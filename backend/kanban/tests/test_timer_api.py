import json
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from kanban.models import Board, BoardColumn, Task, TaskTimer, TaskTimeEntry, TimerMode, TimerState

User = get_user_model()
PASSWORD = "TestPassword123!"


class TaskTimerApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="timer_tester@example.com",
            password=PASSWORD,
            display_name="Timer Tester",
        )
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": "timer_tester@example.com", "password": PASSWORD}),
            content_type="application/json",
        )
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

        # Board & Column
        board_res = self.client.post(
            "/api/kanban/boards",
            data=json.dumps({"title": "Timer Test Board", "description": ""}),
            content_type="application/json",
            **self.auth,
        )
        self.board_id = board_res.json()["id"]
        self.column_id = board_res.json()["columns"][0]["id"]

        # Task
        task_res = self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({"title": "Timed Task"}),
            content_type="application/json",
            **self.auth,
        )
        self.task_id = task_res.json()["id"]

    def test_get_board_serializes_timer_field(self):
        """Board retrieval endpoint returns tasks with nested timer (None or dict)."""
        board_res = self.client.get(f"/api/kanban/boards/{self.board_id}", **self.auth)
        self.assertEqual(board_res.status_code, 200)
        task_data = board_res.json()["columns"][0]["tasks"][0]
        self.assertIn("timer", task_data)
        self.assertIsNone(task_data["timer"])

    def test_patch_timer_creates_task_timer_and_sets_mode(self):
        """PATCH /tasks/{id}/timer creates TaskTimer and updates mode."""
        res = self.client.patch(
            f"/api/kanban/tasks/{self.task_id}/timer",
            data=json.dumps({"mode": "COUNT_UP"}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["mode"], "COUNT_UP")
        self.assertEqual(data["state"], "IDLE")
        self.assertEqual(data["elapsed_seconds"], 0)

        # Confirm persisted in DB
        timer = TaskTimer.objects.get(task_id=self.task_id)
        self.assertEqual(timer.mode, TimerMode.COUNT_UP)
        self.assertEqual(timer.state, TimerState.IDLE)

    def test_patch_timer_start_and_pause_transitions(self):
        """PATCH /tasks/{id}/timer transitions through RUNNING and PAUSED states."""
        now_str = timezone.now().isoformat()

        # Start timer
        res = self.client.patch(
            f"/api/kanban/tasks/{self.task_id}/timer",
            data=json.dumps({"mode": "COUNT_UP", "state": "RUNNING", "started_at": now_str}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["state"], "RUNNING")

        # Pause timer with accumulated 45 seconds
        res = self.client.patch(
            f"/api/kanban/tasks/{self.task_id}/timer",
            data=json.dumps({"state": "PAUSED", "elapsed_seconds": 45, "started_at": None}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["state"], "PAUSED")
        self.assertEqual(res.json()["elapsed_seconds"], 45)

        timer = TaskTimer.objects.get(task_id=self.task_id)
        self.assertEqual(timer.state, TimerState.PAUSED)
        self.assertEqual(timer.elapsed_seconds, 45)

    def test_patch_timer_stop_creates_time_entry_and_resets_runtime(self):
        """Stopping an active timer resets TaskTimer to IDLE and creates a TaskTimeEntry."""
        # Initial active timer
        timer = TaskTimer.objects.create(
            task_id=self.task_id,
            mode=TimerMode.COUNT_UP,
            state=TimerState.RUNNING,
            started_at=timezone.now() - timedelta(seconds=120),
            elapsed_seconds=0,
        )

        res = self.client.patch(
            f"/api/kanban/tasks/{self.task_id}/timer",
            data=json.dumps({"state": "IDLE", "elapsed_seconds": 120}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["state"], "IDLE")
        self.assertEqual(data["elapsed_seconds"], 0)
        self.assertIsNone(data["started_at"])
        self.assertEqual(data["mode"], "COUNT_UP")  # Preserves mode

        # Verify TaskTimeEntry creation
        entries = TaskTimeEntry.objects.filter(task_id=self.task_id)
        self.assertEqual(entries.count(), 1)
        entry = entries.first()
        self.assertEqual(entry.duration_seconds, 120)
        self.assertEqual(entry.user, self.user)
        self.assertIsNotNone(entry.started_at)
        self.assertIsNotNone(entry.ended_at)

    def test_patch_timer_other_user_forbidden(self):
        """Another user cannot mutate timer of a task they do not own."""
        other_user = User.objects.create_user(
            email="other@example.com",
            password=PASSWORD,
            display_name="Other User",
        )
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": "other@example.com", "password": PASSWORD}),
            content_type="application/json",
        )
        other_auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

        res = self.client.patch(
            f"/api/kanban/tasks/{self.task_id}/timer",
            data=json.dumps({"mode": "COUNT_UP"}),
            content_type="application/json",
            **other_auth,
        )
        self.assertEqual(res.status_code, 404)

    def test_board_retrieval_reconciles_expired_offline_countdown(self):
        """Expired countdown timers are reconciled into TaskTimeEntry on board fetch and reset to IDLE."""
        # Expired timer: 1500s target duration, started 1600s ago
        TaskTimer.objects.create(
            task_id=self.task_id,
            mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=1500,
            state=TimerState.RUNNING,
            started_at=timezone.now() - timedelta(seconds=1600),
            elapsed_seconds=0,
        )

        board_res = self.client.get(f"/api/kanban/boards/{self.board_id}", **self.auth)
        self.assertEqual(board_res.status_code, 200)

        task_data = board_res.json()["columns"][0]["tasks"][0]
        self.assertIsNotNone(task_data["timer"])
        self.assertEqual(task_data["timer"]["state"], "IDLE")
        self.assertEqual(task_data["timer"]["elapsed_seconds"], 0)
        self.assertEqual(task_data["timer"]["target_duration_seconds"], 1500)
        self.assertEqual(task_data["timer"]["mode"], "COUNT_DOWN")

        entries = TaskTimeEntry.objects.filter(task_id=self.task_id)
        self.assertEqual(entries.count(), 1)
        entry = entries.first()
        self.assertEqual(entry.duration_seconds, 1500)
        self.assertEqual(entry.user, self.user)
        self.assertEqual(entry.note, "Completed countdown session")

    def test_board_retrieval_does_not_reconcile_unexpired_countdown(self):
        """Active countdown timer with time remaining is left RUNNING."""
        TaskTimer.objects.create(
            task_id=self.task_id,
            mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=1500,
            state=TimerState.RUNNING,
            started_at=timezone.now() - timedelta(seconds=300),
            elapsed_seconds=0,
        )

        board_res = self.client.get(f"/api/kanban/boards/{self.board_id}", **self.auth)
        self.assertEqual(board_res.status_code, 200)

        task_data = board_res.json()["columns"][0]["tasks"][0]
        self.assertEqual(task_data["timer"]["state"], "RUNNING")
        self.assertEqual(TaskTimeEntry.objects.filter(task_id=self.task_id).count(), 0)


    def test_reconcile_and_client_stop_creates_exactly_one_entry(self):
        """When an expired countdown is reconciled on board load and then client sends stop, only 1 entry is created."""
        TaskTimer.objects.create(
            task_id=self.task_id,
            mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=1500,
            state=TimerState.RUNNING,
            started_at=timezone.now() - timedelta(seconds=1600),
            elapsed_seconds=0,
        )

        # 1. Board fetch reconciles the expired countdown
        board_res = self.client.get(f"/api/kanban/boards/{self.board_id}", **self.auth)
        self.assertEqual(board_res.status_code, 200)
        self.assertEqual(TaskTimeEntry.objects.filter(task_id=self.task_id).count(), 1)

        # 2. Client also sends stop/IDLE PATCH request
        res = self.client.patch(
            f"/api/kanban/tasks/{self.task_id}/timer",
            data=json.dumps({"state": "IDLE", "elapsed_seconds": 1500}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)

        # Still exactly 1 entry, NOT 2
        self.assertEqual(TaskTimeEntry.objects.filter(task_id=self.task_id).count(), 1)

    def test_duplicate_stop_calls_create_only_one_entry(self):
        """Consecutive stop calls on a running timer create only one time entry."""
        TaskTimer.objects.create(
            task_id=self.task_id,
            mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=1500,
            state=TimerState.RUNNING,
            started_at=timezone.now() - timedelta(seconds=1500),
            elapsed_seconds=0,
        )

        # First stop
        res1 = self.client.patch(
            f"/api/kanban/tasks/{self.task_id}/timer",
            data=json.dumps({"state": "IDLE", "elapsed_seconds": 1500}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(TaskTimeEntry.objects.filter(task_id=self.task_id).count(), 1)

        # Rapid second stop (e.g. from multiple components or ticking intervals)
        res2 = self.client.patch(
            f"/api/kanban/tasks/{self.task_id}/timer",
            data=json.dumps({"state": "IDLE", "elapsed_seconds": 1500}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res2.status_code, 200)

        # Must still be exactly 1 entry
        self.assertEqual(TaskTimeEntry.objects.filter(task_id=self.task_id).count(), 1)

    def run_session(self, seconds, mode=TimerMode.COUNT_UP):
        """Start a timer `seconds` ago and stop it, as the client does."""
        started_at = timezone.now() - timedelta(seconds=seconds)
        TaskTimer.objects.update_or_create(task_id=self.task_id, defaults={
            "mode": mode,
            "target_duration_seconds": seconds if mode == TimerMode.COUNT_DOWN else None,
            "state": TimerState.RUNNING,
            "started_at": started_at,
            "last_resumed_at": started_at,
            "elapsed_seconds": 0,
        })
        res = self.client.patch(
            f"/api/kanban/tasks/{self.task_id}/timer",
            data=json.dumps({"state": "IDLE", "elapsed_seconds": seconds}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        return started_at

    def test_stop_does_not_resave_an_already_recorded_session(self):
        """A stop for a session that already has an entry (same started_at) adds no second entry."""
        started_at = timezone.now() - timedelta(seconds=10)
        TaskTimeEntry.objects.create(
            task_id=self.task_id,
            user=self.user,
            started_at=started_at,
            ended_at=timezone.now(),
            duration_seconds=10,
            note="Completed countdown session",
        )
        TaskTimer.objects.create(
            task_id=self.task_id,
            mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=10,
            state=TimerState.RUNNING,
            started_at=started_at,
            elapsed_seconds=0,
        )

        res = self.client.patch(
            f"/api/kanban/tasks/{self.task_id}/timer",
            data=json.dumps({"state": "IDLE", "elapsed_seconds": 10}),
            content_type="application/json",
            **self.auth,
        )

        self.assertEqual(res.status_code, 200)
        self.assertEqual(TaskTimeEntry.objects.filter(task_id=self.task_id).count(), 1)

    def test_back_to_back_short_sessions_are_all_recorded(self):
        """Separate sessions of a few seconds, stopped moments apart, each get an entry."""
        self.run_session(3)
        self.run_session(3)
        self.run_session(2)

        durations = TaskTimeEntry.objects.filter(task_id=self.task_id).values_list(
            "duration_seconds", flat=True)
        self.assertEqual(sorted(durations), [2, 3, 3])

    def test_countdown_stopped_soon_after_another_session_is_recorded(self):
        """A new countdown session isn't mistaken for a duplicate of one saved seconds earlier."""
        self.run_session(10, mode=TimerMode.COUNT_DOWN)
        self.run_session(10, mode=TimerMode.COUNT_DOWN)

        self.assertEqual(TaskTimeEntry.objects.filter(task_id=self.task_id).count(), 2)

    def test_pause_and_resume_preserves_started_at_and_records_correct_entry(self):
        """Timer paused and resumed preserves started_at, records true stop as ended_at and active duration."""
        now = timezone.now()
        session_start = now - timedelta(minutes=30)
        resume_time = now - timedelta(minutes=15)

        # Timer started at 6:30, paused at 6:35 (elapsed: 300s), resumed at 6:45
        timer = TaskTimer.objects.create(
            task_id=self.task_id,
            mode=TimerMode.COUNT_UP,
            state=TimerState.RUNNING,
            started_at=session_start,
            last_resumed_at=resume_time,
            elapsed_seconds=300,
        )

        # Ended at 7:00 (active work: 300s + 900s = 1200s = 20 min)
        res = self.client.patch(
            f"/api/kanban/tasks/{self.task_id}/timer",
            data=json.dumps({"state": "IDLE", "elapsed_seconds": 1200}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)

        entry = TaskTimeEntry.objects.filter(task_id=self.task_id).latest("created_at")
        self.assertEqual(entry.duration_seconds, 1200)
        self.assertAlmostEqual(entry.started_at.timestamp(), session_start.timestamp(), delta=2)
        self.assertAlmostEqual(entry.ended_at.timestamp(), now.timestamp(), delta=2)

    def test_stopping_paused_timer_records_last_paused_at_as_ended_at(self):
        """Stopping while PAUSED sets ended_at to last_paused_at, avoiding ghost idle spans."""
        now = timezone.now()
        session_start = now - timedelta(hours=1)
        pause_time = now - timedelta(minutes=40)

        timer = TaskTimer.objects.create(
            task_id=self.task_id,
            mode=TimerMode.COUNT_UP,
            state=TimerState.PAUSED,
            started_at=session_start,
            last_paused_at=pause_time,
            elapsed_seconds=1200,
        )

        res = self.client.patch(
            f"/api/kanban/tasks/{self.task_id}/timer",
            data=json.dumps({"state": "IDLE"}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)

        entry = TaskTimeEntry.objects.filter(task_id=self.task_id).latest("created_at")
        self.assertEqual(entry.duration_seconds, 1200)
        self.assertAlmostEqual(entry.started_at.timestamp(), session_start.timestamp(), delta=2)
        self.assertAlmostEqual(entry.ended_at.timestamp(), pause_time.timestamp(), delta=2)

    def test_countdown_reconciliation_preserves_initial_start_time_with_pauses(self):
        """Expired countdown with prior pauses preserves initial started_at on background reconciliation."""
        now = timezone.now()
        initial_start = now - timedelta(seconds=2000)
        resume_time = now - timedelta(seconds=1205)

        TaskTimer.objects.create(
            task_id=self.task_id,
            mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=1500,
            state=TimerState.RUNNING,
            started_at=initial_start,
            last_resumed_at=resume_time,
            elapsed_seconds=300,
        )

        res = self.client.get("/api/kanban/boards", **self.auth)
        self.assertEqual(res.status_code, 200)

        entry = TaskTimeEntry.objects.filter(task_id=self.task_id).latest("created_at")
        self.assertEqual(entry.duration_seconds, 1500)
        self.assertAlmostEqual(entry.started_at.timestamp(), initial_start.timestamp(), delta=2)

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

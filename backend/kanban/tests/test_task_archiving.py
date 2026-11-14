"""Tests for task archiving, partial unique position constraints, and inactivity tracking mechanics."""

import json
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from kanban.models import Board, BoardColumn, Task, TaskPriority, TaskTimer, TaskTimeEntry, TimerState, TimerMode
from kanban.scheduler import archive_task

User = get_user_model()
PASSWORD = "ArchivingPassword123!"


class TaskArchivingModelAndApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="archive_user@example.com",
            password=PASSWORD,
            display_name="Archive User",
        )
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": "archive_user@example.com", "password": PASSWORD}),
            content_type="application/json",
        )
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

        self.board = Board.objects.create(owner=self.user, title="Main Board")
        self.column1 = BoardColumn.objects.create(board=self.board, title="To Do", position=0)
        self.column2 = BoardColumn.objects.create(board=self.board, title="Done", position=1)

    def test_task_creation_activity_and_archived_at_defaults(self):
        """New tasks have archived_at=None and column_activity_at set to current time."""
        before = timezone.now()
        task = Task.objects.create(column=self.column1, title="Task 1", position=0)
        after = timezone.now()

        self.assertIsNone(task.archived_at)
        self.assertTrue(before <= task.column_activity_at <= after)

    def test_active_queryset_manager(self):
        """Task.objects.active() returns only tasks where archived_at is None."""
        t1 = Task.objects.create(column=self.column1, title="Active 1", position=0)
        t2 = Task.objects.create(
            column=self.column1,
            title="Archived 1",
            position=None,
            archived_at=timezone.now(),
        )

        active_tasks = list(Task.objects.active())
        self.assertIn(t1, active_tasks)
        self.assertNotIn(t2, active_tasks)

    def test_board_view_excludes_archived_tasks(self):
        """GET /api/kanban/boards/{id} excludes archived tasks from column task lists."""
        active_task = Task.objects.create(column=self.column1, title="Active Task", position=0)
        archived_task = Task.objects.create(
            column=self.column1,
            title="Archived Task",
            position=None,
            archived_at=timezone.now(),
        )

        response = self.client.get(f"/api/kanban/boards/{self.board.id}", **self.auth)
        self.assertEqual(response.status_code, 200)

        col1_data = next(c for c in response.json()["columns"] if c["id"] == self.column1.id)
        task_ids = [t["id"] for t in col1_data["tasks"]]
        self.assertIn(active_task.id, task_ids)
        self.assertNotIn(archived_task.id, task_ids)

    def test_archive_task_service_reindexes_and_preserves_time_entries(self):
        """Archiving a task sets position=None, archived_at, reindexes column, and keeps time entries."""
        t0 = Task.objects.create(column=self.column1, title="T0", position=0)
        t1 = Task.objects.create(column=self.column1, title="T1", position=1)
        t2 = Task.objects.create(column=self.column1, title="T2", position=2)

        entry = TaskTimeEntry.objects.create(
            task=t1,
            user=self.user,
            started_at=timezone.now() - timedelta(minutes=30),
            ended_at=timezone.now(),
            duration_seconds=1800,
            note="Important work",
        )

        archive_time = timezone.now()
        archived = archive_task(t1, archived_at=archive_time)

        self.assertEqual(archived.id, t1.id)
        self.assertEqual(archived.archived_at, archive_time)
        self.assertIsNone(archived.position)

        # Remaining active tasks are reindexed: t0=0, t2=1
        t0.refresh_from_db()
        t2.refresh_from_db()
        self.assertEqual(t0.position, 0)
        self.assertEqual(t2.position, 1)

        # Time entry is still intact
        self.assertTrue(TaskTimeEntry.objects.filter(id=entry.id).exists())
        self.assertEqual(entry.task_id, t1.id)

    def test_unique_position_constraint_deferred_and_archived_null(self):
        """Active tasks enforce unique position at commit time, multiple archived tasks have null position, and active tasks cannot have null position."""
        from django.db import IntegrityError, transaction
        t1 = Task.objects.create(column=self.column1, title="T1", position=0)

        # Active tasks cannot have position=None (violates task_position_null_iff_archived check constraint immediately)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Task.objects.create(column=self.column1, title="Active Null Pos", position=None, archived_at=None)

        # Multiple archived tasks with position=None succeed without error
        Task.objects.create(column=self.column1, title="Archived 1", position=None, archived_at=timezone.now())
        Task.objects.create(column=self.column1, title="Archived 2", position=None, archived_at=timezone.now())

        # Creating another active task at position 0 causes an IntegrityError when deferred constraints are checked
        # (savepoint rollback cleans up the duplicate so subsequent tests run cleanly)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Task.objects.create(column=self.column1, title="T1 Dup", position=0)
                from django.db import connection
                connection.check_constraints()

    def test_move_task_reordering_within_column(self):
        """Reordering tasks within the same column succeeds without transient uniqueness collisions."""
        t0 = Task.objects.create(column=self.column1, title="T0", position=0)
        t1 = Task.objects.create(column=self.column1, title="T1", position=1)
        t2 = Task.objects.create(column=self.column1, title="T2", position=2)

        # Reorder t2 to position 0 ([t2, t0, t1])
        res = self.client.post(
            f"/api/kanban/tasks/{t2.id}/move",
            data=json.dumps({"to_column_id": self.column1.id, "target_position": 0}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        t0.refresh_from_db()
        t1.refresh_from_db()
        t2.refresh_from_db()
        self.assertEqual(t2.position, 0)
        self.assertEqual(t0.position, 1)
        self.assertEqual(t1.position, 2)

    def test_move_task_between_columns_with_occupied_positions(self):
        """Moving task to another column that already has a task at the same position succeeds."""
        src_t0 = Task.objects.create(column=self.column1, title="Src T0", position=0)
        src_t1 = Task.objects.create(column=self.column1, title="Src T1", position=1)
        dest_t0 = Task.objects.create(column=self.column2, title="Dest T0", position=0)
        dest_t1 = Task.objects.create(column=self.column2, title="Dest T1", position=1)

        # Move src_t1 (pos 1) to column 2 at position 0
        res = self.client.post(
            f"/api/kanban/tasks/{src_t1.id}/move",
            data=json.dumps({"to_column_id": self.column2.id, "target_position": 0}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        src_t0.refresh_from_db()
        src_t1.refresh_from_db()
        dest_t0.refresh_from_db()
        dest_t1.refresh_from_db()

        self.assertEqual(src_t0.position, 0)
        self.assertEqual(src_t1.column_id, self.column2.id)
        self.assertEqual(src_t1.position, 0)
        self.assertEqual(dest_t0.position, 1)
        self.assertEqual(dest_t1.position, 2)

    def test_move_task_updates_column_activity_at(self):
        """Moving a task across or within columns updates column_activity_at."""
        past_time = timezone.now() - timedelta(days=2)
        task = Task.objects.create(
            column=self.column1,
            title="Moving Task",
            position=0,
        )
        Task.objects.filter(id=task.id).update(column_activity_at=past_time)

        task.refresh_from_db()
        self.assertEqual(task.column_activity_at, past_time)

        response = self.client.post(
            f"/api/kanban/tasks/{task.id}/move",
            data=json.dumps({"to_column_id": self.column2.id, "target_position": 0}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)

        task.refresh_from_db()
        self.assertTrue(task.column_activity_at > past_time)
        self.assertEqual(task.column_id, self.column2.id)

    def test_update_task_updates_column_activity_at(self):
        """Editing task content via PATCH /api/kanban/tasks/{id} updates column_activity_at."""
        past_time = timezone.now() - timedelta(days=2)
        task = Task.objects.create(
            column=self.column1,
            title="Original Title",
            position=0,
        )
        Task.objects.filter(id=task.id).update(column_activity_at=past_time)

        response = self.client.patch(
            f"/api/kanban/tasks/{task.id}",
            data=json.dumps({"title": "Updated Title"}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)

        task.refresh_from_db()
        self.assertEqual(task.title, "Updated Title")
        self.assertTrue(task.column_activity_at > past_time)

    def test_timer_transition_to_idle_resets_column_activity_at(self):
        """Transitioning timer state to IDLE updates task column_activity_at."""
        past_time = timezone.now() - timedelta(days=3)
        task = Task.objects.create(column=self.column1, title="Timed Task", position=0)
        timer = TaskTimer.objects.create(
            task=task,
            state=TimerState.RUNNING,
            mode=TimerMode.COUNT_UP,
            started_at=timezone.now() - timedelta(minutes=10),
        )
        Task.objects.filter(id=task.id).update(column_activity_at=past_time)

        response = self.client.patch(
            f"/api/kanban/tasks/{task.id}/timer",
            data=json.dumps({"state": "IDLE"}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)

        task.refresh_from_db()
        self.assertTrue(task.column_activity_at > past_time)

    def test_create_time_entry_resets_column_activity_at(self):
        """Manually recording a time entry updates task column_activity_at."""
        past_time = timezone.now() - timedelta(days=3)
        task = Task.objects.create(column=self.column1, title="Logged Task", position=0)
        Task.objects.filter(id=task.id).update(column_activity_at=past_time)

        now = timezone.now()
        response = self.client.post(
            f"/api/kanban/tasks/{task.id}/time-entries",
            data=json.dumps({
                "started_at": (now - timedelta(minutes=15)).isoformat(),
                "ended_at": now.isoformat(),
                "duration_seconds": 900,
                "note": "Manual entry",
            }),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 201)

        task.refresh_from_db()
        self.assertTrue(task.column_activity_at > past_time)

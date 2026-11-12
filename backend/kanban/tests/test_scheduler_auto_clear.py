"""Integration tests for background column auto-clearing, advisory lock, and APScheduler lifecycle."""

import json
from datetime import timedelta
from unittest.mock import patch, MagicMock
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.utils import timezone

from kanban.models import Board, BoardColumn, Task, TaskTimer, TaskTimeEntry, TimerState, TimerMode
from kanban.services import auto_clear_expired_tasks, run_auto_clear_job, AUTO_CLEAR_ADVISORY_LOCK_ID
from kanban.scheduler import start_scheduler, stop_scheduler, get_scheduler

User = get_user_model()


class AutoClearServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="scheduler_test@example.com",
            password="SchedulerPassword123!",
            display_name="Scheduler User",
        )
        self.board = Board.objects.create(owner=self.user, title="Auto-Clear Board")
        # Column with 3 days retention (259,200s)
        self.auto_col = BoardColumn.objects.create(
            board=self.board,
            title="Auto-Clear Column",
            position=0,
            auto_clear_duration_seconds=259200,
        )
        # Column without retention policy
        self.normal_col = BoardColumn.objects.create(
            board=self.board,
            title="Normal Column",
            position=1,
            auto_clear_duration_seconds=None,
        )

    def test_auto_clear_archives_expired_tasks_and_keeps_fresh_ones(self):
        """Tasks older than retention window are archived; fresh tasks remain active."""
        now = timezone.now()
        # Task 0: 4 days old (expired)
        t_expired = Task.objects.create(column=self.auto_col, title="Old Task", position=0)
        Task.objects.filter(id=t_expired.id).update(column_activity_at=now - timedelta(days=4))

        # Task 1: 1 day old (fresh)
        t_fresh = Task.objects.create(column=self.auto_col, title="Fresh Task", position=1)
        Task.objects.filter(id=t_fresh.id).update(column_activity_at=now - timedelta(days=1))

        cleared = auto_clear_expired_tasks(as_of=now)
        self.assertEqual(cleared, 1)

        t_expired.refresh_from_db()
        t_fresh.refresh_from_db()

        self.assertIsNotNone(t_expired.archived_at)
        self.assertIsNone(t_expired.position)

        self.assertIsNone(t_fresh.archived_at)
        self.assertEqual(t_fresh.position, 0)

    def test_auto_clear_skips_running_and_paused_timers(self):
        """Tasks exceeding retention threshold are NOT cleared if timer is RUNNING or PAUSED."""
        now = timezone.now()
        four_days_ago = now - timedelta(days=4)

        # Task with running timer
        t_running = Task.objects.create(column=self.auto_col, title="Running Task", position=0)
        Task.objects.filter(id=t_running.id).update(column_activity_at=four_days_ago)
        TaskTimer.objects.create(task=t_running, state=TimerState.RUNNING, started_at=four_days_ago)

        # Task with paused timer
        t_paused = Task.objects.create(column=self.auto_col, title="Paused Task", position=1)
        Task.objects.filter(id=t_paused.id).update(column_activity_at=four_days_ago)
        TaskTimer.objects.create(task=t_paused, state=TimerState.PAUSED, started_at=four_days_ago)

        # Task with idle timer
        t_idle = Task.objects.create(column=self.auto_col, title="Idle Task", position=2)
        Task.objects.filter(id=t_idle.id).update(column_activity_at=four_days_ago)
        TaskTimer.objects.create(task=t_idle, state=TimerState.IDLE)

        # Task with no timer
        t_no_timer = Task.objects.create(column=self.auto_col, title="No Timer Task", position=3)
        Task.objects.filter(id=t_no_timer.id).update(column_activity_at=four_days_ago)

        cleared = auto_clear_expired_tasks(as_of=now)
        self.assertEqual(cleared, 2)

        t_running.refresh_from_db()
        t_paused.refresh_from_db()
        t_idle.refresh_from_db()
        t_no_timer.refresh_from_db()

        self.assertIsNone(t_running.archived_at)
        self.assertIsNone(t_paused.archived_at)

        self.assertIsNotNone(t_idle.archived_at)
        self.assertIsNone(t_idle.position)

        self.assertIsNotNone(t_no_timer.archived_at)
        self.assertIsNone(t_no_timer.position)

        # Remaining active tasks should be reindexed to 0 and 1
        self.assertEqual(t_running.position, 0)
        self.assertEqual(t_paused.position, 1)

    def test_auto_clear_reindexes_interleaved_active_tasks(self):
        """Remaining active tasks receive continuous 0-indexed positions after archiving interleaved tasks."""
        now = timezone.now()
        t0 = Task.objects.create(column=self.auto_col, title="T0 Old", position=0)
        t1 = Task.objects.create(column=self.auto_col, title="T1 Fresh", position=1)
        t2 = Task.objects.create(column=self.auto_col, title="T2 Old", position=2)
        t3 = Task.objects.create(column=self.auto_col, title="T3 Fresh", position=3)

        Task.objects.filter(id__in=[t0.id, t2.id]).update(column_activity_at=now - timedelta(days=5))
        Task.objects.filter(id__in=[t1.id, t3.id]).update(column_activity_at=now - timedelta(days=1))

        cleared = auto_clear_expired_tasks(as_of=now)
        self.assertEqual(cleared, 2)

        t0.refresh_from_db()
        t1.refresh_from_db()
        t2.refresh_from_db()
        t3.refresh_from_db()

        self.assertIsNotNone(t0.archived_at)
        self.assertIsNotNone(t2.archived_at)
        self.assertIsNone(t0.position)
        self.assertIsNone(t2.position)

        self.assertIsNone(t1.archived_at)
        self.assertIsNone(t3.archived_at)
        self.assertEqual(t1.position, 0)
        self.assertEqual(t3.position, 1)

    def test_auto_clear_preserves_task_time_entries(self):
        """Historical TaskTimeEntry records remain queryable and linked when task is auto-cleared."""
        now = timezone.now()
        task = Task.objects.create(column=self.auto_col, title="Tracked Task", position=0)
        Task.objects.filter(id=task.id).update(column_activity_at=now - timedelta(days=4))

        entry1 = TaskTimeEntry.objects.create(
            task=task,
            user=self.user,
            started_at=now - timedelta(days=4, hours=2),
            ended_at=now - timedelta(days=4, hours=1),
            duration_seconds=3600,
            note="Logged time entry 1",
        )
        entry2 = TaskTimeEntry.objects.create(
            task=task,
            user=self.user,
            started_at=now - timedelta(days=4, minutes=45),
            ended_at=now - timedelta(days=4),
            duration_seconds=2700,
            note="Logged time entry 2",
        )

        auto_clear_expired_tasks(as_of=now)

        task.refresh_from_db()
        self.assertIsNotNone(task.archived_at)

        # Time entries are intact and linked to task
        entries = list(TaskTimeEntry.objects.filter(task=task).order_by("id"))
        self.assertEqual(len(entries), 2)
        self.assertEqual([e.id for e in entries], [entry1.id, entry2.id])
        self.assertEqual(sum(e.duration_seconds for e in entries), 6300)

    def test_columns_without_retention_are_not_cleared(self):
        """Tasks in columns with auto_clear_duration_seconds=None are never archived."""
        now = timezone.now()
        task = Task.objects.create(column=self.normal_col, title="Indefinite Task", position=0)
        Task.objects.filter(id=task.id).update(column_activity_at=now - timedelta(days=365))

        cleared = auto_clear_expired_tasks(as_of=now)
        self.assertEqual(cleared, 0)

        task.refresh_from_db()
        self.assertIsNone(task.archived_at)
        self.assertEqual(task.position, 0)

    def test_empty_columns_execute_cleanly(self):
        """Auto-clear runs cleanly when configured columns have no tasks."""
        cleared = auto_clear_expired_tasks()
        self.assertEqual(cleared, 0)


class AdvisoryLockAndSchedulerTests(TestCase):
    def tearDown(self):
        stop_scheduler()

    def test_run_auto_clear_job_executes_service(self):
        """run_auto_clear_job executes auto_clear_expired_tasks."""
        with patch("kanban.services.auto_clear_expired_tasks") as mock_clear:
            run_auto_clear_job()
            mock_clear.assert_called_once()

    def test_advisory_lock_skips_when_lock_not_acquired(self):
        """When another process holds the advisory lock, the job skips execution gracefully."""
        if connection.vendor != "postgresql":
            self.skipTest("Advisory lock test requires PostgreSQL")

        # Open a separate database connection to simulate another worker holding the lock
        other_conn = connection.copy()
        other_conn.connect()
        try:
            with other_conn.cursor() as cursor:
                cursor.execute("SELECT pg_try_advisory_lock(%s);", [AUTO_CLEAR_ADVISORY_LOCK_ID])
                locked = cursor.fetchone()[0]
                self.assertTrue(locked)
                try:
                    # With lock held by other_conn, run_auto_clear_job on connection should skip
                    with patch("kanban.services.auto_clear_expired_tasks") as mock_clear:
                        result = run_auto_clear_job()
                        self.assertIsNone(result)
                        mock_clear.assert_not_called()
                finally:
                    cursor.execute("SELECT pg_advisory_unlock(%s);", [AUTO_CLEAR_ADVISORY_LOCK_ID])
        finally:
            other_conn.close()

    def test_scheduler_lifecycle(self):
        """start_scheduler schedules the 5-minute job, and stop_scheduler cleanly terminates it."""
        sched = start_scheduler()
        self.assertTrue(sched.running)

        job = sched.get_job("auto_clear_expired_tasks")
        self.assertIsNotNone(job)
        # Interval is 5 minutes (300 seconds)
        self.assertEqual(job.trigger.interval.total_seconds(), 300)

        stop_scheduler()
        self.assertFalse(sched.running)

    async def test_asgi_lifespan_startup_and_shutdown(self):
        """ASGI lifespan startup starts scheduler and shutdown terminates scheduler."""
        from config.asgi import application

        scope = {"type": "lifespan"}
        messages_received = []
        messages_to_send = [
            {"type": "lifespan.startup"},
            {"type": "lifespan.shutdown"},
        ]

        async def mock_receive():
            if messages_to_send:
                return messages_to_send.pop(0)
            return {"type": "lifespan.shutdown"}

        async def mock_send(message):
            messages_received.append(message)

        await application(scope, mock_receive, mock_send)

        self.assertEqual(
            messages_received,
            [
                {"type": "lifespan.startup.complete"},
                {"type": "lifespan.shutdown.complete"},
            ],
        )

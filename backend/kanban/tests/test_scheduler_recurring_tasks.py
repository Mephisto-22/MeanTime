"""Integration tests for background recurring task spawning, APScheduler job, and advisory lock."""

from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.utils import timezone

from kanban.models import (
    Board,
    BoardColumn,
    RecurringTask,
    RecurrenceCadence,
    Tag,
    Task,
    TaskPriority,
    TaskTimer,
    TimerMode,
    TimerState,
)
from kanban.scheduler import (
    RECURRING_TASKS_ADVISORY_LOCK_ID,
    get_scheduler,
    run_recurring_tasks_job,
    spawn_due_recurring_tasks,
    start_scheduler,
    stop_scheduler,
)

User = get_user_model()


class RecurringTaskSchedulerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="recurring_worker@example.com",
            password="WorkerPassword123!",
            display_name="Recurring Worker",
        )
        self.board = Board.objects.create(owner=self.user, title="Routine Board")
        # Columns with positions 0, 1, 2
        self.col_left = BoardColumn.objects.create(board=self.board, title="To Do", position=0)
        self.col_mid = BoardColumn.objects.create(board=self.board, title="In Progress", position=1)
        self.col_right = BoardColumn.objects.create(board=self.board, title="Done", position=2)

        self.tag_urgent = Tag.objects.create(user=self.user, name="Urgent Routine")
        self.tag_habit = Tag.objects.create(user=self.user, name="Habit")

    def tearDown(self):
        stop_scheduler()

    def test_spawn_due_recurring_task_at_position_zero_and_shift_existing(self):
        """Due recurring tasks spawn at position 0 of the leftmost column and shift existing tasks downward."""
        # Pre-existing tasks in leftmost column
        t0 = Task.objects.create(column=self.col_left, title="Existing Task 0", position=0)
        t1 = Task.objects.create(column=self.col_left, title="Existing Task 1", position=1)

        now = timezone.now()
        due_time = now - timedelta(minutes=5)

        rec = RecurringTask.objects.create(
            board=self.board,
            creator=self.user,
            title="Morning Routine",
            description="Drink water and stretch",
            priority=TaskPriority.HIGH,
            cadence=RecurrenceCadence.DAILY,
            time_of_day="08:00:00",
            timezone="UTC",
            default_timer_mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=600,
            is_active=True,
            next_run_at=due_time,
        )
        rec.tags.set([self.tag_urgent, self.tag_habit])

        spawned_count = spawn_due_recurring_tasks(as_of=now)
        self.assertEqual(spawned_count, 1)

        # Check existing tasks shifted
        t0.refresh_from_db()
        t1.refresh_from_db()
        self.assertEqual(t0.position, 1)
        self.assertEqual(t1.position, 2)

        # Check newly spawned task
        spawned_task = Task.objects.get(column=self.col_left, position=0)
        self.assertEqual(spawned_task.title, "Morning Routine")
        self.assertEqual(spawned_task.description, "Drink water and stretch")
        self.assertEqual(spawned_task.priority, TaskPriority.HIGH)
        self.assertEqual(spawned_task.recurring_task, rec)
        self.assertEqual(set(spawned_task.tags.all()), {self.tag_urgent, self.tag_habit})

        # Check timer cloned in IDLE state
        self.assertIsNotNone(spawned_task.timer)
        self.assertEqual(spawned_task.timer.mode, TimerMode.COUNT_DOWN)
        self.assertEqual(spawned_task.timer.target_duration_seconds, 600)
        self.assertEqual(spawned_task.timer.state, TimerState.IDLE)
        self.assertEqual(spawned_task.timer.elapsed_seconds, 0)

        # Check next_run_at advanced into future
        rec.refresh_from_db()
        self.assertGreater(rec.next_run_at, now)

    def test_unconditional_spawning_when_previous_occurrence_still_active(self):
        """New occurrences spawn unconditionally even if an earlier occurrence is still unfinished on the board."""
        now = timezone.now()
        due_time = now - timedelta(hours=1)

        rec = RecurringTask.objects.create(
            board=self.board,
            creator=self.user,
            title="Daily Standup Prep",
            cadence=RecurrenceCadence.DAILY,
            time_of_day="09:00:00",
            timezone="UTC",
            is_active=True,
            next_run_at=due_time,
        )

        # Pre-existing unfinished occurrence still active in middle column
        old_occurrence = Task.objects.create(
            column=self.col_mid,
            recurring_task=rec,
            title="Daily Standup Prep",
            position=0,
        )

        # Runner executes
        spawned_count = spawn_due_recurring_tasks(as_of=now)
        self.assertEqual(spawned_count, 1)

        # Both occurrences coexist
        occurrences = list(Task.objects.filter(recurring_task=rec).order_by("id"))
        self.assertEqual(len(occurrences), 2)
        self.assertEqual(occurrences[0].id, old_occurrence.id)
        self.assertEqual(occurrences[0].column, self.col_mid)
        self.assertEqual(occurrences[1].column, self.col_left)
        self.assertEqual(occurrences[1].position, 0)

    def test_inactive_and_future_schedules_not_spawned(self):
        """Inactive schedules or schedules whose next_run_at is in the future are not spawned."""
        now = timezone.now()

        # Inactive schedule
        RecurringTask.objects.create(
            board=self.board,
            creator=self.user,
            title="Inactive Chores",
            cadence=RecurrenceCadence.DAILY,
            is_active=False,
            next_run_at=now - timedelta(days=1),
        )

        # Future schedule
        RecurringTask.objects.create(
            board=self.board,
            creator=self.user,
            title="Future Obligation",
            cadence=RecurrenceCadence.DAILY,
            is_active=True,
            next_run_at=now + timedelta(hours=2),
        )

        spawned = spawn_due_recurring_tasks(as_of=now)
        self.assertEqual(spawned, 0)
        self.assertEqual(Task.objects.count(), 0)

    def test_run_recurring_tasks_job_executes_service(self):
        """run_recurring_tasks_job executes spawn_due_recurring_tasks."""
        with patch("kanban.scheduler.spawn_due_recurring_tasks") as mock_spawn:
            run_recurring_tasks_job()
            mock_spawn.assert_called_once()

    def test_scheduler_registers_recurring_tasks_job(self):
        """start_scheduler registers the 1-minute spawn_due_recurring_tasks interval job."""
        sched = start_scheduler()
        self.assertTrue(sched.running)

        job = sched.get_job("spawn_due_recurring_tasks")
        self.assertIsNotNone(job)
        self.assertEqual(job.trigger.interval.total_seconds(), 60)

        stop_scheduler()
        self.assertFalse(sched.running)

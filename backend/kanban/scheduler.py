"""Embedded APScheduler integration and background execution for MeanTime tasks."""

import logging
from contextlib import contextmanager
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from django.db import connection, transaction
from django.utils import timezone

from kanban.models import BoardColumn, Task, TaskTimer, TimerMode, TimerState, RecurringTask
from kanban.recurrence import calculate_next_run_at

logger = logging.getLogger(__name__)

# 64-bit integer constant for PostgreSQL advisory locking (Ticket #244/247)
AUTO_CLEAR_ADVISORY_LOCK_ID = 244244244
RECURRING_TASKS_ADVISORY_LOCK_ID = 249251249

_scheduler: BackgroundScheduler | None = None


def _reindex(items):
    """Rewrite position 0..n-1."""
    for i, obj in enumerate(items):
        obj.position = i
        obj.save(update_fields=["position"])


def archive_task(task: Task, archived_at: datetime | None = None) -> Task:
    """
    Mark a task archived (archived_at set, position = None),
    preserving all related TaskTimeEntry records, and re-indexing
    remaining active tasks in that column.
    """
    now = archived_at or timezone.now()
    with transaction.atomic():
        column = task.column
        task.archived_at = now
        task.position = None
        task.save(update_fields=["archived_at", "position", "updated_at"])
        remaining_active = list(
            Task.objects.active()
            .filter(column=column)
            .order_by("position", "id")
        )
        _reindex(remaining_active)
    return task


def auto_clear_expired_tasks(as_of: datetime | None = None) -> int:
    """
    Evaluate all columns with an active auto_clear_duration_seconds policy.
    For each configured column, archive tasks whose inactivity duration
    exceeds the column retention window and whose timer is not RUNNING or PAUSED.
    Re-index remaining active tasks in cleared columns within an atomic transaction.
    """
    now = as_of or timezone.now()
    cleared_total = 0

    columns = BoardColumn.objects.filter(
        auto_clear_duration_seconds__isnull=False,
        auto_clear_duration_seconds__gt=0,
    )

    for column in columns:
        cutoff = now - timedelta(seconds=column.auto_clear_duration_seconds)
        tasks_to_clear = list(
            Task.objects.active()
            .filter(column=column, column_activity_at__lte=cutoff)
            .exclude(timer__state__in=[TimerState.RUNNING, TimerState.PAUSED])
            .order_by("position", "id")
        )

        for task in tasks_to_clear:
            archive_task(task, archived_at=now)
            cleared_total += 1

    if cleared_total > 0:
        logger.info("Auto-cleared %d expired tasks across board columns.", cleared_total)

    return cleared_total


def spawn_due_recurring_tasks(as_of: datetime | None = None) -> int:
    """
    Evaluate all active RecurringTask records where next_run_at <= as_of.
    For each due recurring task, find the board's leftmost column, shift existing active tasks downward,
    spawn a new occurrence at position 0 cloning template properties, tags, and timer settings,
    and advance next_run_at to the subsequent cycle.
    """
    now = as_of or timezone.now()
    spawned_total = 0

    due_schedules = list(
        RecurringTask.objects.filter(
            is_active=True,
            next_run_at__lte=now,
        ).select_related("board").prefetch_related("tags")
    )

    for rec_task in due_schedules:
        leftmost_column = (
            BoardColumn.objects.filter(board=rec_task.board)
            .order_by("position", "id")
            .first()
        )
        if leftmost_column is None:
            logger.warning(
                "RecurringTask %s (id=%s) has no columns on board %s; skipping.",
                rec_task.title,
                rec_task.id,
                rec_task.board_id,
            )
            continue

        with transaction.atomic():
            # Get existing active tasks in the leftmost column
            existing_active_tasks = list(
                Task.objects.active()
                .filter(column=leftmost_column)
                .order_by("position", "id")
            )
            # Shift existing active tasks downward in reverse order to prevent position collisions
            for i in range(len(existing_active_tasks) - 1, -1, -1):
                existing_active_tasks[i].position = i + 1
                existing_active_tasks[i].save(update_fields=["position"])

            # Create new occurrence at position 0
            new_task = Task.objects.create(
                column=leftmost_column,
                recurring_task=rec_task,
                title=rec_task.title,
                description=rec_task.description,
                priority=rec_task.priority,
                position=0,
                column_activity_at=now,
            )
            # Copy tags
            new_task.tags.set(rec_task.tags.all())

            # Copy timer configuration if mode is not NONE
            if rec_task.default_timer_mode != TimerMode.NONE:
                TaskTimer.objects.create(
                    task=new_task,
                    mode=rec_task.default_timer_mode,
                    target_duration_seconds=rec_task.target_duration_seconds,
                    state=TimerState.IDLE,
                )

            # Advance next_run_at
            rec_task.next_run_at = rec_task.calculate_next_run(after=now)
            rec_task.save(update_fields=["next_run_at", "updated_at"])
            spawned_total += 1

    if spawned_total > 0:
        logger.info("Spawned %d recurring tasks.", spawned_total)

    return spawned_total


@contextmanager
def pg_advisory_lock_scope(lock_id: int):
    """
    Context manager acquiring a PostgreSQL advisory lock if running on PostgreSQL.
    Yields True if lock was acquired (or if running on non-PostgreSQL), False otherwise.
    Releases the advisory lock on exit.
    """
    if connection.vendor != "postgresql":
        yield True
        return

    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_lock(%s);", [lock_id])
        acquired = cursor.fetchone()[0]

    if not acquired:
        yield False
        return

    try:
        yield True
    finally:
        with connection.cursor() as unlock_cursor:
            unlock_cursor.execute("SELECT pg_advisory_unlock(%s);", [lock_id])


def run_recurring_tasks_job() -> int | None:
    """
    Execute the recurring task spawning routine guarded by a PostgreSQL advisory lock.
    Guarantees single-leader execution across multiple Uvicorn workers and dev reloader processes.
    """
    with pg_advisory_lock_scope(RECURRING_TASKS_ADVISORY_LOCK_ID) as acquired:
        if not acquired:
            logger.debug("Recurring tasks advisory lock not acquired; another worker is currently executing.")
            return None
        return spawn_due_recurring_tasks()


def run_auto_clear_job() -> int | None:
    """
    Execute the auto-clear routine guarded by a PostgreSQL advisory lock.
    Guarantees single-leader execution across multiple Uvicorn workers and dev reloader processes.
    """
    with pg_advisory_lock_scope(AUTO_CLEAR_ADVISORY_LOCK_ID) as acquired:
        if not acquired:
            logger.debug("Auto-clear advisory lock not acquired; another worker is currently executing.")
            return None
        return auto_clear_expired_tasks()


def get_scheduler() -> BackgroundScheduler:
    """Return the global BackgroundScheduler instance, creating it if needed."""
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler()
    return _scheduler


def start_scheduler() -> BackgroundScheduler:
    """
    Start the embedded APScheduler and register background jobs.
    Runs the column auto-clear routine every 5 minutes.
    """
    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.add_job(
            run_auto_clear_job,
            "interval",
            minutes=5,
            id="auto_clear_expired_tasks",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        scheduler.add_job(
            run_recurring_tasks_job,
            "interval",
            minutes=1,
            id="spawn_due_recurring_tasks",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        scheduler.start()
        logger.info("APScheduler started: auto-clear (5m) and recurring tasks (1m) scheduled.")
    return scheduler


def stop_scheduler() -> None:
    """Cleanly terminate the embedded APScheduler upon application shutdown."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")
    _scheduler = None

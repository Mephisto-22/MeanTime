"""Embedded APScheduler integration and background execution for MeanTime tasks."""

import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from django.db import connection, transaction
from django.utils import timezone

from kanban.models import BoardColumn, Task, TimerState

logger = logging.getLogger(__name__)

# 64-bit integer constant for PostgreSQL advisory locking (Ticket #244/247)
AUTO_CLEAR_ADVISORY_LOCK_ID = 244244244

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


def run_auto_clear_job() -> int | None:
    """
    Execute the auto-clear routine guarded by a PostgreSQL advisory lock.
    Guarantees single-leader execution across multiple Uvicorn workers and dev reloader processes.
    """
    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s);", [AUTO_CLEAR_ADVISORY_LOCK_ID])
            acquired = cursor.fetchone()[0]

            if not acquired:
                logger.debug("Auto-clear advisory lock not acquired; another worker is currently executing.")
                return None

            try:
                return auto_clear_expired_tasks()
            finally:
                with connection.cursor() as unlock_cursor:
                    unlock_cursor.execute("SELECT pg_advisory_unlock(%s);", [AUTO_CLEAR_ADVISORY_LOCK_ID])
    else:
        # Non-PostgreSQL fallback (e.g. SQLite unit tests)
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
        scheduler.start()
        logger.info("APScheduler started: auto-clear job scheduled every 5 minutes.")
    return scheduler


def stop_scheduler() -> None:
    """Cleanly terminate the embedded APScheduler upon application shutdown."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")
    _scheduler = None

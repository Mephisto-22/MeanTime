"""Domain services for task retention, auto-clearing, and background execution."""

import logging
from datetime import datetime, timedelta
from django.db import connection, transaction
from django.utils import timezone

from kanban.models import BoardColumn, Task, TimerState
from kanban.api import _reindex

logger = logging.getLogger(__name__)

# 64-bit integer constant for PostgreSQL advisory locking (Ticket #244/247)
AUTO_CLEAR_ADVISORY_LOCK_ID = 244244244


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

        if not tasks_to_clear:
            continue

        with transaction.atomic():
            for task in tasks_to_clear:
                task.archived_at = now
                task.position = None
                task.save(update_fields=["archived_at", "position", "updated_at"])
                cleared_total += 1

            remaining_active = list(
                Task.objects.active()
                .filter(column=column)
                .order_by("position", "id")
            )
            _reindex(remaining_active)

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

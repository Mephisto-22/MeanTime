#!/usr/bin/env python
"""
Retro setup script for MeanTime.

1. Hard-deletes the user with email `crb094@latech.edu` (cascading boards, tasks, etc.)
   so the account can be re-registered cleanly during retro.
2. Prepopulates a "Retro Demo Board" for `barfieldc22@gmail.com` with sample columns,
   tags, tasks, timers/time entries, and the three APScheduler test fixtures:
   - An active RecurringTask scheduled in the future
   - A Task with a due date and future reminder_at (reminder_sent_at=None)
   - A BoardColumn with auto_clear_duration_seconds=3600 containing an active Task

Usage (local Docker):
    docker compose exec backend python scripts/retro_setup.py

Usage (AWS Django container):
    python scripts/retro_setup.py
"""

import argparse
import os
import sys
from datetime import timedelta
from pathlib import Path

# Ensure /app (backend root) is on sys.path when invoked as `python scripts/retro_setup.py`
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.db import transaction  # noqa: E402
from django.utils import timezone  # noqa: E402

from kanban.models import (  # noqa: E402
    Board,
    BoardColumn,
    RecurrenceCadence,
    RecurringTask,
    Tag,
    Task,
    TaskPriority,
    TaskTimeEntry,
    TaskTimer,
    TimerMode,
    TimerState,
)
from users.models import User  # noqa: E402

DEFAULT_DELETE_EMAIL = "crb094@latech.edu"
DEFAULT_SEED_EMAIL = "barfieldc22@gmail.com"
RETRO_BOARD_TITLE = "Retro Demo Board"
AUTO_CLEAR_COLUMN_TITLE = "Done (Auto-Clear)"
DUE_DATE_TASK_TITLE = "Due Date Reminder Test Task"
AUTO_CLEAR_TASK_TITLE = "Auto-Clear Test Task"
RECURRING_TASK_TITLE = "Recurring Retro Check-In"


def delete_user_by_email(email: str) -> None:
    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        print(f"[skip] User '{email}' does not exist (already deleted).")
        return

    with transaction.atomic():
        deleted_count, per_model = user.delete()

    print(f"[ok] Deleted user '{email}' (total cascaded rows: {deleted_count}).")
    for model_label, count in sorted(per_model.items()):
        if count:
            print(f"     - {model_label}: {count}")


def seed_retro_board(email: str) -> None:
    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        print(
            f"[error] User '{email}' not found. Register or create this account first.",
            file=sys.stderr,
        )
        sys.exit(1)

    now = timezone.now()

    with transaction.atomic():
        # Replace any previous Retro Demo Board for idempotency
        existing_boards = Board.objects.filter(owner=user, title=RETRO_BOARD_TITLE)
        if existing_boards.exists():
            count, _ = existing_boards.delete()
            print(f"[info] Removed previous '{RETRO_BOARD_TITLE}' ({count} cascaded rows).")

        board = Board.objects.create(
            owner=user,
            title=RETRO_BOARD_TITLE,
            description="Prepopulated board for retro demo and APScheduler verification.",
        )

        # Tags
        tag_names = ["Retro", "APScheduler", "Backend", "Urgent"]
        tags = {
            name: Tag.objects.get_or_create(user=user, name=name)[0]
            for name in tag_names
        }

        # Columns
        col_todo = BoardColumn.objects.create(board=board, title="To Do", position=0)
        col_in_progress = BoardColumn.objects.create(board=board, title="In Progress", position=1)
        col_review = BoardColumn.objects.create(board=board, title="Review", position=2)
        col_done = BoardColumn.objects.create(
            board=board,
            title=AUTO_CLEAR_COLUMN_TITLE,
            position=3,
            auto_clear_duration_seconds=3600,  # 1 hour retention window
        )

        # Sample tasks in To Do
        t_slides = Task.objects.create(
            column=col_todo,
            title="Finalize retro slides",
            description="Summarize sprint velocity, wins, and action items.",
            priority=TaskPriority.HIGH,
            position=0,
            column_activity_at=now,
        )
        t_slides.tags.add(tags["Retro"])

        # Scheduler Test 2: Task with a due date & future reminder
        t_due = Task.objects.create(
            column=col_todo,
            title=DUE_DATE_TASK_TITLE,
            description="Used to verify APScheduler due-date reminder emails.",
            priority=TaskPriority.HIGH,
            position=1,
            column_activity_at=now,
            due_at=now + timedelta(hours=2),
            reminder_offset_seconds=3600,
            reminder_at=now + timedelta(hours=1),
            reminder_sent_at=None,
        )
        t_due.tags.add(tags["APScheduler"], tags["Urgent"])

        # Sample task in In Progress with a paused timer + time entry
        t_deploy = Task.objects.create(
            column=col_in_progress,
            title="Verify AWS ECS deployment",
            description="Confirm backend container health check and APScheduler startup logs.",
            priority=TaskPriority.MEDIUM,
            position=0,
            column_activity_at=now,
        )
        t_deploy.tags.add(tags["Backend"])
        TaskTimer.objects.create(
            task=t_deploy,
            mode=TimerMode.COUNT_UP,
            state=TimerState.PAUSED,
            elapsed_seconds=1845,
        )
        TaskTimeEntry.objects.create(
            task=t_deploy,
            user=user,
            started_at=now - timedelta(minutes=31),
            ended_at=now - timedelta(seconds=15),
            duration_seconds=1845,
            note="Initial ECS smoke check",
        )

        # Sample task in Review with a completed time entry
        t_review = Task.objects.create(
            column=col_review,
            title="Review scheduler test coverage",
            description="Double-check recurring, due-date, and auto-clear jobs.",
            priority=TaskPriority.LOW,
            position=0,
            column_activity_at=now,
        )
        t_review.tags.add(tags["Backend"], tags["Retro"])
        TaskTimeEntry.objects.create(
            task=t_review,
            user=user,
            started_at=now - timedelta(minutes=20),
            ended_at=now - timedelta(minutes=5),
            duration_seconds=900,
            note="Reviewed test suite",
        )

        # Scheduler Test 3: Task inside auto-clear column (not yet expired)
        t_autoclear = Task.objects.create(
            column=col_done,
            title=AUTO_CLEAR_TASK_TITLE,
            description="Used to verify APScheduler column auto-clear archiving.",
            priority=TaskPriority.MEDIUM,
            position=0,
            column_activity_at=now,
        )
        t_autoclear.tags.add(tags["APScheduler"])

        # Scheduler Test 1: RecurringTask scheduled in the future
        next_run = now + timedelta(hours=1)
        rec_task = RecurringTask.objects.create(
            board=board,
            creator=user,
            title=RECURRING_TASK_TITLE,
            description="Spawned automatically by APScheduler when next_run_at <= now.",
            priority=TaskPriority.MEDIUM,
            cadence=RecurrenceCadence.DAILY,
            time_of_day=next_run.time().replace(microsecond=0),
            timezone=user.timezone or "UTC",
            default_timer_mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=1500,
            is_active=True,
            next_run_at=next_run,
        )
        rec_task.tags.add(tags["APScheduler"], tags["Retro"])

    print(f"[ok] Created '{board.title}' (id={board.id}) for '{user.email}'.")
    print(f"     - Columns: To Do (id={col_todo.id}), In Progress (id={col_in_progress.id}), "
          f"Review (id={col_review.id}), {col_done.title} (id={col_done.id}, auto_clear=3600s)")
    print(f"     - RecurringTask: '{rec_task.title}' (id={rec_task.id}, next_run_at={rec_task.next_run_at.isoformat()})")
    print(f"     - Due-Date Task: '{t_due.title}' (id={t_due.id}, reminder_at={t_due.reminder_at.isoformat()})")
    print(f"     - Auto-Clear Task: '{t_autoclear.title}' (id={t_autoclear.id}, column_activity_at={t_autoclear.column_activity_at.isoformat()})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Retro setup: delete test user and seed demo board.")
    parser.add_argument(
        "--delete-email",
        default=DEFAULT_DELETE_EMAIL,
        help=f"Email of user to hard-delete (default: {DEFAULT_DELETE_EMAIL})",
    )
    parser.add_argument(
        "--seed-email",
        default=DEFAULT_SEED_EMAIL,
        help=f"Email of user to receive the prepopulated board (default: {DEFAULT_SEED_EMAIL})",
    )
    args = parser.parse_args()

    delete_user_by_email(args.delete_email)
    seed_retro_board(args.seed_email)


if __name__ == "__main__":
    main()

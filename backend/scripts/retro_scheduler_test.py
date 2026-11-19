#!/usr/bin/env python
"""
APScheduler retro testing helper for MeanTime.

Backdates the three APScheduler test fixtures created by `retro_setup.py` one by one
(or all at once) so you can demonstrate:
  1. `recur`     - Backdates RecurringTask.next_run_at so the recurring task spawns.
  2. `reminder`  - Backdates Task.reminder_at so the due-date reminder email sends.
  3. `autoclear` - Backdates Task.column_activity_at past auto_clear_duration_seconds so it archives.
  4. `status`    - Prints the current state of all three fixtures.
  5. `all`       - Backdates all three fixtures.

By default, this script only backdates timestamps so the live embedded APScheduler
picks them up on its normal interval (1m recurring, 60s reminders, 5m auto-clear).
Pass `--run-now` to also invoke the scheduler job immediately.

Usage (local Docker):
    docker compose exec backend python scripts/retro_scheduler_test.py status
    docker compose exec backend python scripts/retro_scheduler_test.py recur
    docker compose exec backend python scripts/retro_scheduler_test.py reminder
    docker compose exec backend python scripts/retro_scheduler_test.py autoclear

Usage (AWS Django container):
    python scripts/retro_scheduler_test.py status
    python scripts/retro_scheduler_test.py recur --run-now
"""

import argparse
import os
import sys
from datetime import timedelta
from pathlib import Path

# Ensure /app (backend root) is on sys.path when invoked as `python scripts/retro_scheduler_test.py`
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.utils import timezone  # noqa: E402

from kanban.models import Board, BoardColumn, RecurringTask, Task  # noqa: E402
from kanban.scheduler import (  # noqa: E402
    run_auto_clear_job,
    run_due_date_reminders_job,
    run_recurring_tasks_job,
)
from users.models import User  # noqa: E402

DEFAULT_EMAIL = "barfieldc22@gmail.com"
RETRO_BOARD_TITLE = "Retro Demo Board"
AUTO_CLEAR_COLUMN_TITLE = "Done (Auto-Clear)"
DUE_DATE_TASK_TITLE = "Due Date Reminder Test Task"
AUTO_CLEAR_TASK_TITLE = "Auto-Clear Test Task"
RECURRING_TASK_TITLE = "Recurring Retro Check-In"


def _get_board(email: str) -> Board:
    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        print(f"[error] User '{email}' not found.", file=sys.stderr)
        sys.exit(1)

    board = Board.objects.filter(owner=user, title=RETRO_BOARD_TITLE).order_by("-id").first()
    if board is None:
        print(
            f"[error] '{RETRO_BOARD_TITLE}' not found for '{email}'. Run retro_setup.py first.",
            file=sys.stderr,
        )
        sys.exit(1)
    return board


def show_status(board: Board) -> None:
    print(f"=== Scheduler Test Status for '{board.title}' (id={board.id}) ===")

    rec_task = RecurringTask.objects.filter(board=board, title=RECURRING_TASK_TITLE).first()
    if rec_task:
        occ_count = rec_task.occurrences.count()
        print(
            f"[recur]     id={rec_task.id} active={rec_task.is_active} "
            f"next_run_at={rec_task.next_run_at.isoformat()} spawned_occurrences={occ_count}"
        )
    else:
        print("[recur]     Not found.")

    due_task = Task.objects.filter(column__board=board, title=DUE_DATE_TASK_TITLE).first()
    if due_task:
        sent = due_task.reminder_sent_at.isoformat() if due_task.reminder_sent_at else "None"
        rem = due_task.reminder_at.isoformat() if due_task.reminder_at else "None"
        due = due_task.due_at.isoformat() if due_task.due_at else "None"
        print(
            f"[reminder]  id={due_task.id} due_at={due} reminder_at={rem} reminder_sent_at={sent}"
        )
    else:
        print("[reminder]  Not found.")

    clear_col = BoardColumn.objects.filter(board=board, title=AUTO_CLEAR_COLUMN_TITLE).first()
    clear_task = Task.objects.filter(column__board=board, title=AUTO_CLEAR_TASK_TITLE).first()
    if clear_col and clear_task:
        archived = clear_task.archived_at.isoformat() if clear_task.archived_at else "None (active)"
        print(
            f"[autoclear] col_id={clear_col.id} window={clear_col.auto_clear_duration_seconds}s | "
            f"task_id={clear_task.id} column_activity_at={clear_task.column_activity_at.isoformat()} "
            f"archived_at={archived}"
        )
    else:
        print("[autoclear] Not found.")


def trigger_recur(board: Board, run_now: bool) -> None:
    rec_task = RecurringTask.objects.filter(board=board, title=RECURRING_TASK_TITLE).first()
    if rec_task is None:
        print(f"[error] RecurringTask '{RECURRING_TASK_TITLE}' not found.", file=sys.stderr)
        sys.exit(1)

    now = timezone.now()
    rec_task.is_active = True
    rec_task.next_run_at = now - timedelta(minutes=2)
    rec_task.save(update_fields=["is_active", "next_run_at", "updated_at"])
    print(f"[ok] Backdated RecurringTask (id={rec_task.id}) next_run_at -> {rec_task.next_run_at.isoformat()}")

    if run_now:
        spawned = run_recurring_tasks_job()
        print(f"[run-now] run_recurring_tasks_job() spawned {spawned} task(s).")
    else:
        print("     APScheduler runs spawn_due_recurring_tasks every 1 minute.")


def trigger_reminder(board: Board, run_now: bool) -> None:
    due_task = Task.objects.filter(column__board=board, title=DUE_DATE_TASK_TITLE).first()
    if due_task is None:
        print(f"[error] Task '{DUE_DATE_TASK_TITLE}' not found.", file=sys.stderr)
        sys.exit(1)

    now = timezone.now()
    due_task.due_at = now + timedelta(minutes=15)
    due_task.reminder_at = now - timedelta(minutes=2)
    due_task.reminder_sent_at = None
    due_task.save(update_fields=["due_at", "reminder_at", "reminder_sent_at", "updated_at"])
    print(
        f"[ok] Backdated Task '{due_task.title}' (id={due_task.id}) "
        f"reminder_at -> {due_task.reminder_at.isoformat()} (reminder_sent_at=None)"
    )

    if run_now:
        dispatched = run_due_date_reminders_job()
        print(f"[run-now] run_due_date_reminders_job() dispatched {dispatched} reminder(s).")
    else:
        print("     APScheduler runs dispatch_due_date_reminders every 60 seconds.")


def trigger_autoclear(board: Board, run_now: bool) -> None:
    clear_col = BoardColumn.objects.filter(board=board, title=AUTO_CLEAR_COLUMN_TITLE).first()
    clear_task = Task.objects.filter(column__board=board, title=AUTO_CLEAR_TASK_TITLE).first()
    if clear_col is None or clear_task is None:
        print(f"[error] Auto-clear column or task not found.", file=sys.stderr)
        sys.exit(1)

    window = clear_col.auto_clear_duration_seconds or 3600
    now = timezone.now()
    clear_task.column_activity_at = now - timedelta(seconds=window + 120)
    clear_task.save(update_fields=["column_activity_at", "updated_at"])
    print(
        f"[ok] Backdated Task '{clear_task.title}' (id={clear_task.id}) "
        f"column_activity_at -> {clear_task.column_activity_at.isoformat()} "
        f"(exceeds {window}s window)"
    )

    if run_now:
        cleared = run_auto_clear_job()
        print(f"[run-now] run_auto_clear_job() archived {cleared} task(s).")
    else:
        print("     APScheduler runs auto_clear_expired_tasks every 5 minutes.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backdate APScheduler test fixtures for MeanTime retro."
    )
    parser.add_argument(
        "action",
        choices=["status", "recur", "reminder", "autoclear", "all"],
        help="Which scheduler operation to inspect or backdate.",
    )
    parser.add_argument(
        "--email",
        default=DEFAULT_EMAIL,
        help=f"Board owner email (default: {DEFAULT_EMAIL})",
    )
    parser.add_argument(
        "--run-now",
        action="store_true",
        help="Immediately invoke the corresponding APScheduler job after backdating.",
    )
    args = parser.parse_args()

    board = _get_board(args.email)

    if args.action == "status":
        show_status(board)
    elif args.action == "recur":
        trigger_recur(board, args.run_now)
    elif args.action == "reminder":
        trigger_reminder(board, args.run_now)
    elif args.action == "autoclear":
        trigger_autoclear(board, args.run_now)
    elif args.action == "all":
        trigger_recur(board, args.run_now)
        trigger_reminder(board, args.run_now)
        trigger_autoclear(board, args.run_now)


if __name__ == "__main__":
    main()

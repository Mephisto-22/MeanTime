"""Board analytics: how much tracked time a board's work has taken."""

from django.contrib.auth import get_user_model
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from ninja import Router, Schema

from .api import get_accessible_boards, reconcile_expired_countdowns
from .models import Board, BoardColumn, Task, TaskTimeEntry

router = Router(tags=["Analytics"])

# How many of a board's most time-consuming tasks the analytics list.
TOP_TASK_LIMIT = 5
# The group for time entries with no user (entries recorded before they had one).
UNKNOWN_NAME = "Unknown"


class ColumnTimeOut(Schema):
    """Tracked time across the tasks in one column."""
    column_id: int
    title: str
    total_seconds: int


class TaskTimeOut(Schema):
    """Tracked time on one task."""
    task_id: int
    title: str
    column_id: int
    column_title: str
    total_seconds: int


class CollaboratorTimeOut(Schema):
    """Tracked time by one person on a board, by display name only and never email."""
    user_id: int | None
    display_name: str
    total_seconds: int


class BoardAnalyticsOut(Schema):
    """Tracked time on a board: in total, per column, for its top tasks and per person."""
    board_id: int
    title: str
    is_shared: bool
    total_seconds: int
    columns: list[ColumnTimeOut]
    top_tasks: list[TaskTimeOut]
    collaborators: list[CollaboratorTimeOut]


def collaborator_totals(board: Board) -> list[dict]:
    """Return each person's tracked time on the board, most time first.

    The owner and every collaborator are listed, even with no time. Someone
    who has left the board is listed too, because their time still counts
    towards the board's total. Entries with no user come last, as "Unknown".
    """
    seconds_by_user = dict(
        TaskTimeEntry.objects.filter(task__column__board=board)
        .order_by()
        .values("user")
        .annotate(total=Sum("duration_seconds"))
        .values_list("user", "total")
    )

    people = {board.owner.id: board.owner}
    people.update((user.id, user) for user in board.collaborators.all())
    former_ids = [
        user_id for user_id in seconds_by_user if user_id is not None and user_id not in people
    ]
    people.update(
        (user.id, user) for user in get_user_model().objects.filter(id__in=former_ids))

    rows = sorted(
        (
            {
                "user_id": user.id,
                "display_name": user.display_name,
                "total_seconds": seconds_by_user.get(user.id, 0),
            }
            for user in people.values()
        ),
        key=lambda row: (-row["total_seconds"], row["display_name"].casefold()),
    )
    if seconds_by_user.get(None):
        rows.append(
            {"user_id": None, "display_name": UNKNOWN_NAME, "total_seconds": seconds_by_user[None]})
    return rows


@router.get("/boards/{board_id}/analytics", response=BoardAnalyticsOut)
def get_board_analytics(request, board_id: int):
    """Return the board's total tracked time, time per column, its top tasks and time per person.

    Only the owner and collaborators can see a board's analytics, including
    the time per person; anyone else gets 404, as they would for the board itself.
    """
    board = get_object_or_404(get_accessible_boards(request.auth), id=board_id)
    # Record any countdowns that ran out while nobody had the board open.
    reconcile_expired_countdowns(request.auth)

    columns = (
        BoardColumn.objects.filter(board=board)
        .annotate(total_seconds=Coalesce(Sum("tasks__time_entries__duration_seconds"), 0))
        .order_by("position", "id")
    )
    top_tasks = (
        Task.objects.filter(column__board=board)
        .select_related("column")
        .annotate(total_seconds=Coalesce(Sum("time_entries__duration_seconds"), 0))
        .filter(total_seconds__gt=0)
        .order_by("-total_seconds", "column__position", "position", "id")[:TOP_TASK_LIMIT]
    )

    return {
        "board_id": board.id,
        "title": board.title,
        "is_shared": board.collaborators.exists(),
        "total_seconds": sum(column.total_seconds for column in columns),
        "columns": [
            {"column_id": column.id, "title": column.title, "total_seconds": column.total_seconds}
            for column in columns
        ],
        "top_tasks": [
            {
                "task_id": task.id,
                "title": task.title,
                "column_id": task.column_id,
                "column_title": task.column.title,
                "total_seconds": task.total_seconds,
            }
            for task in top_tasks
        ],
        "collaborators": collaborator_totals(board),
    }

"""Board analytics: how much tracked time a board's work has taken."""

from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from ninja import Router, Schema

from .api import get_accessible_boards, reconcile_expired_countdowns
from .models import BoardColumn, Task

router = Router(tags=["Analytics"])

# How many of a board's most time-consuming tasks the analytics list.
TOP_TASK_LIMIT = 5


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


class BoardAnalyticsOut(Schema):
    """Tracked time on a board, in total, per column and for its top tasks."""
    board_id: int
    title: str
    total_seconds: int
    columns: list[ColumnTimeOut]
    top_tasks: list[TaskTimeOut]


@router.get("/boards/{board_id}/analytics", response=BoardAnalyticsOut)
def get_board_analytics(request, board_id: int):
    """Return the board's total tracked time, time per column and its top tasks by time.

    Only the owner and collaborators can see a board's analytics; anyone else
    gets 404, as they would for the board itself.
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
    }

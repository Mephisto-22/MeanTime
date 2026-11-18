"""Board analytics: how much tracked time a board's work has taken."""

from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from ninja import Router, Schema

from .api import get_accessible_boards, reconcile_expired_countdowns
from .models import Board, BoardColumn, Task, TimerMode

router = Router(tags=["Analytics"])


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


class TaskEstimateOut(Schema):
    """Planned vs actual time on one task. A positive difference means over the target."""
    task_id: int
    title: str
    column_id: int
    column_title: str
    planned_seconds: int
    actual_seconds: int
    difference_seconds: int


class EstimatesOut(Schema):
    """Planned vs actual time for a board's countdown tasks, and how far off they were on average.

    `average_difference_percent` is the mean of each tracked task's difference
    as a percentage of its target: 20 means "on average 20% over", -10 means
    "on average 10% under". Tasks with no tracked time yet are listed but left
    out of the average, and it's null when no task has tracked time.
    """
    tasks: list[TaskEstimateOut]
    average_difference_percent: int | None
    tracked_task_count: int


class BoardAnalyticsOut(Schema):
    """Tracked time on a board: in total, per column, for its top tasks and against estimates."""
    board_id: int
    title: str
    total_seconds: int
    columns: list[ColumnTimeOut]
    # Every task with tracked time, most first; the page shows the first few.
    top_tasks: list[TaskTimeOut]
    estimates: EstimatesOut


def board_estimates(board: Board) -> dict:
    """Return planned vs actual time for each task on the board with a countdown target.

    Planned time is the countdown timer's target; actual time is the sum of the
    task's time entries across sessions and contributors. Tasks are ordered from
    the furthest over their target to the furthest under.
    """
    tasks = (
        Task.objects.filter(
            column__board=board,
            timer__mode=TimerMode.COUNT_DOWN,
            timer__target_duration_seconds__gt=0,
        )
        .select_related("column", "timer")
        .annotate(actual_seconds=Coalesce(Sum("time_entries__duration_seconds"), 0))
    )

    rows = []
    for task in tasks:
        planned = task.timer.target_duration_seconds
        rows.append({
            "task_id": task.id,
            "title": task.title,
            "column_id": task.column_id,
            "column_title": task.column.title,
            "planned_seconds": planned,
            "actual_seconds": task.actual_seconds,
            "difference_seconds": task.actual_seconds - planned,
        })
    rows.sort(key=lambda row: (-row["difference_seconds"], row["title"].casefold()))

    tracked = [row for row in rows if row["actual_seconds"] > 0]
    average = None
    if tracked:
        percents = [row["difference_seconds"] / row["planned_seconds"] * 100 for row in tracked]
        average = round(sum(percents) / len(percents))

    return {
        "tasks": rows,
        "average_difference_percent": average,
        "tracked_task_count": len(tracked),
    }


@router.get("/boards/{board_id}/analytics", response=BoardAnalyticsOut)
def get_board_analytics(request, board_id: int):
    """Return the board's tracked time in total, per column and for its top tasks, plus estimates.

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
        .order_by("-total_seconds", "column__position", "position", "id")
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
        "estimates": board_estimates(board),
    }

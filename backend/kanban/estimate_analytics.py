"""Board analytics: planned vs actual time for tasks with a countdown target.

Planned time is the countdown timer's target. Actual time is the sum of the
task's time entries, from everyone who tracked it, so it keeps growing across
sessions and includes time logged by hand.
"""

from django.db.models import Sum
from django.db.models.functions import Coalesce
from ninja import Schema

from .models import Board, Task, TimerMode


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


def board_estimates(board: Board) -> dict:
    """Return planned vs actual time for each task on the board with a countdown target.

    Tasks are ordered from the furthest over their target to the furthest under.
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

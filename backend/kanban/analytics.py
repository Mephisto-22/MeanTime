"""Board analytics: how much tracked time a board's work has taken."""

from collections import defaultdict
from typing import Literal

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from ninja import Query, Router, Schema

from .api import get_accessible_boards, reconcile_expired_countdowns
from .average_analytics import TaskAveragesOut, task_averages
from .models import Board, BoardColumn, Tag, Task

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


class BoardAnalyticsOut(Schema):
    """Tracked time on a board: in total, per column, for its top tasks and on average."""
    board_id: int
    title: str
    total_seconds: int
    columns: list[ColumnTimeOut]
    # Every task with tracked time, most first; the page shows the first few.
    top_tasks: list[TaskTimeOut]
    averages: TaskAveragesOut
    # The names of the tags used on the board, for the tag filter. Not filtered.
    tags: list[str]


def filter_board_tasks(board: Board, timer_mode: str | None, tags: list[str]):
    """Return the board's tasks with the given timer mode and any of the given tag names.

    Tags are matched by name, since each user has their own tags: on a shared
    board, two people's "bug" tags count as one.
    """
    tasks = Task.objects.filter(column__board=board)
    if timer_mode:
        tasks = tasks.filter(timer__mode=timer_mode)
    if tags:
        # A subquery, so a task with two matching tags isn't counted twice.
        tasks = tasks.filter(id__in=Task.objects.filter(tags__name__in=tags).values("id"))
    return tasks


@router.get("/boards/{board_id}/analytics", response=BoardAnalyticsOut)
def get_board_analytics(
    request,
    board_id: int,
    timer_mode: Literal["COUNT_DOWN", "COUNT_UP"] | None = None,
    tags: list[str] = Query([]),
):
    """Return the board's tracked time in total, per column, for its top tasks and on average.

    `timer_mode` keeps only countdown or stopwatch tasks, by the task's timer
    now. `tags` keeps only tasks with at least one of those tag names. Without
    them, every task counts.

    Only the owner and collaborators can see a board's analytics; anyone else
    gets 404, as they would for the board itself.
    """
    board = get_object_or_404(get_accessible_boards(request.auth), id=board_id)
    # Record any countdowns that ran out while nobody had the board open.
    reconcile_expired_countdowns(request.auth)

    tracked_tasks = [
        task
        for task in (
            filter_board_tasks(board, timer_mode, tags)
            .select_related("column")
            .annotate(
                total_seconds=Coalesce(Sum("time_entries__duration_seconds"), 0),
                session_count=Count(
                    "time_entries", filter=Q(time_entries__duration_seconds__gt=0)),
            )
            .order_by("-total_seconds", "column__position", "position", "id")
        )
        if task.total_seconds > 0
    ]

    column_totals = defaultdict(int)
    for task in tracked_tasks:
        column_totals[task.column_id] += task.total_seconds
    columns = BoardColumn.objects.filter(board=board).order_by("position", "id")
    tag_names = (
        Tag.objects.filter(tasks__column__board=board)
        .order_by("name")
        .values_list("name", flat=True)
        .distinct()
    )

    return {
        "board_id": board.id,
        "title": board.title,
        "total_seconds": sum(column_totals.values()),
        "columns": [
            {
                "column_id": column.id,
                "title": column.title,
                "total_seconds": column_totals[column.id],
            }
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
            for task in tracked_tasks
        ],
        "averages": task_averages(tracked_tasks),
        "tags": list(tag_names),
    }

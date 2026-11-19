"""Board analytics: how much tracked time a board's work has taken."""

from collections import defaultdict
from typing import Literal

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, QuerySet, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from ninja import Query, Router, Schema

from .api import get_accessible_boards, reconcile_expired_countdowns
from .average_analytics import TaskAveragesOut, task_averages
from .breakdown_analytics import TimeBreakdownOut, time_breakdown
from .models import Board, BoardColumn, Tag, Task, TaskTimeEntry

router = Router(tags=["Analytics"])

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
    """Tracked time on a board: in total, per column, for its top tasks, on average, per person,
    per tag and per priority."""
    board_id: int
    title: str
    is_shared: bool
    total_seconds: int
    columns: list[ColumnTimeOut]
    # Every task with tracked time, most first; the page shows the first few.
    top_tasks: list[TaskTimeOut]
    averages: TaskAveragesOut
    collaborators: list[CollaboratorTimeOut]
    breakdown: TimeBreakdownOut
    # The names of the tags used on the board, for the tag filter. Not filtered.
    tags: list[str]


def filter_board_tasks(board: Board, timer_mode: str | None, tags: list[str]) -> QuerySet[Task]:
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


def collaborator_totals(board: Board, tasks: QuerySet[Task]) -> list[CollaboratorTimeOut]:
    """Return each person's tracked time on the given tasks of the board, most time first.

    The owner and every collaborator are listed, even with no time. Someone
    who has left the board is listed too, because their time still counts
    towards the board's total. Entries with no user come last, as "Unknown".
    """
    seconds_by_user = dict(
        TaskTimeEntry.objects.filter(task__in=tasks)
        .order_by()
        .values("user")
        .annotate(total=Sum("duration_seconds"))
        .values_list("user", "total")
    )

    people = {board.owner.id: board.owner}
    people.update(
        (membership.user.id, membership.user)
        for membership in board.memberships.select_related("user")
    )
    former_ids = [
        user_id for user_id in seconds_by_user if user_id is not None and user_id not in people
    ]
    people.update(
        (user.id, user) for user in get_user_model().objects.filter(id__in=former_ids))

    rows = sorted(
        (
            CollaboratorTimeOut(
                user_id=user.id,
                display_name=user.display_name,
                total_seconds=seconds_by_user.get(user.id, 0),
            )
            for user in people.values()
        ),
        key=lambda row: (-row.total_seconds, row.display_name.casefold()),
    )
    if seconds_by_user.get(None):
        rows.append(
            CollaboratorTimeOut(
                user_id=None,
                display_name=UNKNOWN_NAME,
                total_seconds=seconds_by_user[None],
            )
        )
    return rows


@router.get("/boards/{board_id}/analytics", response=BoardAnalyticsOut)
def get_board_analytics(
    request,
    board_id: int,
    timer_mode: Literal["COUNT_DOWN", "COUNT_UP"] | None = None,
    tags: list[str] = Query([]),
):
    """Return the board's tracked time in total, per column, for its top tasks, on average and per person.

    `timer_mode` keeps only countdown or stopwatch tasks, by the task's timer
    now. `tags` keeps only tasks with at least one of those tag names. Without
    them, every task counts.

    Only the owner and collaborators can see a board's analytics, including
    the time per person; anyone else gets 404, as they would for the board itself.
    """
    board = get_object_or_404(get_accessible_boards(request.auth), id=board_id)
    # Record any countdowns that ran out while nobody had the board open.
    reconcile_expired_countdowns(request.auth)

    tasks = filter_board_tasks(board, timer_mode, tags)
    tracked_tasks = [
        task
        for task in (
            tasks.select_related("column")
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
        "is_shared": board.memberships.exists(),
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
        "collaborators": collaborator_totals(board, tasks),
        "breakdown": time_breakdown({task.id: task.total_seconds for task in tracked_tasks}),
        "tags": list(tag_names),
    }

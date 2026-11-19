"""Analytics: tracked time broken down by tag and by priority.

A task with several tags counts toward each of them, so the tag totals can add
up to more than the overall total. Tags are grouped by name, since each user
has their own tags: on a shared board, two people's "bug" tags count as one.
Untagged tasks and tasks without a priority go in a "None" group, sent as a
null name.
"""

from collections import defaultdict
from collections.abc import Mapping

from ninja import Schema

from .models import Task, TaskPriority

# Priorities from most to least urgent; the "None" group comes last.
PRIORITY_ORDER = [TaskPriority.HIGH.value, TaskPriority.MEDIUM.value, TaskPriority.LOW.value]


class BreakdownRowOut(Schema):
    """Tracked time in one group. A null name is the "None" group."""
    name: str | None
    total_seconds: int


class TimeBreakdownOut(Schema):
    """Tracked time per tag and per priority. Only groups with tracked time are listed."""
    # Most time first, with "None" last.
    tags: list[BreakdownRowOut]
    # High, Medium, Low, then "None", using the priority values (HIGH, MEDIUM, LOW).
    priorities: list[BreakdownRowOut]


def time_breakdown(seconds_by_task: Mapping[int, int]) -> dict:
    """Return the tracked time per tag and per priority, given each task's tracked seconds."""
    seconds_by_task = {task_id: seconds for task_id, seconds in seconds_by_task.items() if seconds > 0}

    # A set, so a task with two people's same-named tags counts once for that name.
    tag_names = defaultdict(set)
    for task_id, name in Task.tags.through.objects.filter(
        task_id__in=seconds_by_task
    ).values_list("task_id", "tag__name"):
        tag_names[task_id].add(name)

    tag_totals = defaultdict(int)
    untagged_seconds = 0
    for task_id, seconds in seconds_by_task.items():
        if not tag_names[task_id]:
            untagged_seconds += seconds
        for name in tag_names[task_id]:
            tag_totals[name] += seconds

    tags = [
        {"name": name, "total_seconds": total}
        for name, total in sorted(tag_totals.items(), key=lambda item: (-item[1], item[0].casefold()))
    ]
    if untagged_seconds:
        tags.append({"name": None, "total_seconds": untagged_seconds})

    priority_totals = defaultdict(int)
    for task_id, priority in Task.objects.filter(id__in=seconds_by_task).values_list("id", "priority"):
        priority_totals[priority or None] += seconds_by_task[task_id]
    priorities = [
        {"name": priority, "total_seconds": priority_totals[priority]}
        for priority in [*PRIORITY_ORDER, None]
        if priority_totals[priority]
    ]

    return {"tags": tags, "priorities": priorities}

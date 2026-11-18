"""Board analytics: how long a task and a session take on average.

A session is one time entry: a countdown or stopwatch run, or time logged by
hand. Only tasks with tracked time count, so a board full of untouched tasks
doesn't pull the averages down.
"""

from collections.abc import Iterable

from ninja import Schema

from .models import Task


class TaskAveragesOut(Schema):
    """Averages across the tasks with tracked time. The averages are null when there are none."""
    task_count: int
    session_count: int
    average_task_seconds: int | None
    average_session_seconds: int | None
    # One decimal place, such as 2.5.
    average_sessions_per_task: float | None


def task_averages(tracked_tasks: Iterable[Task]) -> dict:
    """Average the tasks' tracked time and sessions.

    Each task must be annotated with `total_seconds` and `session_count`.
    """
    tasks = list(tracked_tasks)
    task_count = len(tasks)
    session_count = sum(task.session_count for task in tasks)
    total_seconds = sum(task.total_seconds for task in tasks)
    if task_count == 0:
        return {
            "task_count": 0,
            "session_count": 0,
            "average_task_seconds": None,
            "average_session_seconds": None,
            "average_sessions_per_task": None,
        }
    return {
        "task_count": task_count,
        "session_count": session_count,
        "average_task_seconds": round(total_seconds / task_count),
        "average_session_seconds": round(total_seconds / session_count) if session_count else None,
        "average_sessions_per_task": round(session_count / task_count, 1),
    }

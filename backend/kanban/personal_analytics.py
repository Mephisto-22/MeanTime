"""Personal analytics: how much time the signed-in user tracked on each day."""

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from ninja import Router, Schema
from ninja.errors import HttpError

from .api import get_accessible_boards, reconcile_expired_countdowns
from .breakdown_analytics import TimeBreakdownOut, time_breakdown
from .models import TaskTimeEntry

router = Router(tags=["Analytics"])

# The range shown when the client doesn't ask for one: today and the 6 days before.
DEFAULT_RANGE_DAYS = 7
# The longest range one request may cover, inclusive of both ends.
MAX_RANGE_DAYS = 90


class DayEntryOut(Schema):
    """One of the user's time entries, with the task and board it was tracked on."""
    id: int
    task_id: int
    task_title: str
    board_id: int
    board_title: str
    started_at: datetime
    ended_at: datetime | None = None
    duration_seconds: int
    note: str


class DayTimeOut(Schema):
    """The user's tracked time on one day, in their profile timezone."""
    day: date
    total_seconds: int
    entries: list[DayEntryOut]


class DailyTimeOut(Schema):
    """The user's tracked time per day, for every day from start to end."""
    start: date
    end: date
    timezone: str
    total_seconds: int
    days: list[DayTimeOut]
    # The range's time per tag and per priority.
    breakdown: TimeBreakdownOut


def serialize_entry(entry: TaskTimeEntry) -> dict:
    """Return the entry with the titles of its task and board."""
    board = entry.task.column.board
    return {
        "id": entry.id,
        "task_id": entry.task_id,
        "task_title": entry.task.title,
        "board_id": board.id,
        "board_title": board.title,
        "started_at": entry.started_at,
        "ended_at": entry.ended_at,
        "duration_seconds": entry.duration_seconds,
        "note": entry.note,
    }


@router.get("/me/daily", response=DailyTimeOut)
def get_daily_time(request, start: date | None = None, end: date | None = None):
    """Return the user's tracked time per day from start to end, inclusive.

    Only entries the user recorded on boards they can still open are counted.
    Days follow the user's profile timezone. An entry counts on the day it
    started, even if it ran past midnight: a paused session's duration can be
    shorter than its start-to-end span, so it can't be split reliably.
    Without dates, the range is the last 7 days.
    """
    user = request.auth
    tz = ZoneInfo(user.timezone)

    end = end or datetime.now(tz).date()
    start = start or end - timedelta(days=DEFAULT_RANGE_DAYS - 1)
    if start > end:
        raise HttpError(400, "The start date must be on or before the end date.")
    span_days = (end - start).days + 1
    if span_days > MAX_RANGE_DAYS:
        raise HttpError(400, f"The date range can't be longer than {MAX_RANGE_DAYS} days.")

    # Record any countdowns that ran out while nobody had their board open.
    reconcile_expired_countdowns(user)

    entries = (
        TaskTimeEntry.objects.filter(
            user=user,
            task__column__board__in=get_accessible_boards(user).values("id"),
            started_at__gte=datetime.combine(start, time.min, tzinfo=tz),
            started_at__lt=datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz),
        )
        .select_related("task__column__board")
        .order_by("started_at", "id")
    )

    entries_by_day = defaultdict(list)
    seconds_by_task = defaultdict(int)
    for entry in entries:
        entries_by_day[entry.started_at.astimezone(tz).date()].append(entry)
        seconds_by_task[entry.task_id] += entry.duration_seconds

    days = []
    for offset in range(span_days):
        day = start + timedelta(days=offset)
        day_entries = entries_by_day[day]
        days.append({
            "day": day,
            "total_seconds": sum(entry.duration_seconds for entry in day_entries),
            "entries": [serialize_entry(entry) for entry in day_entries],
        })

    return {
        "start": start,
        "end": end,
        "timezone": user.timezone,
        "total_seconds": sum(day["total_seconds"] for day in days),
        "days": days,
        "breakdown": time_breakdown(seconds_by_task),
    }

"""Recurrence scheduling and timestamp calculation utilities."""

import calendar
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from django.utils import timezone
from kanban.models import RecurrenceCadence


def parse_time_of_day(time_val: time | str) -> time:
    """Parse time instance or HH:MM / HH:MM:SS string to datetime.time."""
    if isinstance(time_val, time):
        return time(time_val.hour, time_val.minute, time_val.second)
    if isinstance(time_val, str):
        parts = time_val.strip().split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        second = int(parts[2]) if len(parts) > 2 else 0
        return time(hour, minute, second)
    raise ValueError(f"Invalid time_of_day: {time_val}")


def get_zone_info(tz_name: str | None) -> ZoneInfo:
    """Get ZoneInfo instance for tz_name, falling back to UTC on invalid names."""
    if not tz_name:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(tz_name.strip())
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def calculate_next_run_at(
    cadence: str | RecurrenceCadence,
    time_of_day: time | str,
    timezone_name: str = "UTC",
    days_of_week: list[int] | None = None,
    day_of_month: int | None = None,
    after: datetime | None = None,
) -> datetime:
    """
    Calculate the next occurrence timestamp in UTC strictly after `after`.
    Evaluates calendar schedules against the user's localized timezone.
    """
    tz = get_zone_info(timezone_name)
    tod = parse_time_of_day(time_of_day)

    base_time = after or timezone.now()
    if timezone.is_naive(base_time):
        base_time = timezone.make_aware(base_time, ZoneInfo("UTC"))
    local_base = base_time.astimezone(tz)

    cadence_str = str(cadence).upper()
    if "." in cadence_str:
        cadence_str = cadence_str.split(".")[-1]

    if cadence_str == RecurrenceCadence.DAILY:
        # Today at tod
        candidate = local_base.replace(
            hour=tod.hour, minute=tod.minute, second=tod.second, microsecond=0
        )
        if candidate > local_base:
            next_local = candidate
        else:
            next_local = candidate + timedelta(days=1)

    elif cadence_str == RecurrenceCadence.WEEKLY:
        # 0=Monday..6=Sunday
        valid_days = sorted(set(d for d in (days_of_week or []) if 0 <= d <= 6))
        if not valid_days:
            valid_days = [local_base.weekday()]

        next_local = None
        # Check next 14 days to guarantee landing on valid weekday strictly after local_base
        for offset in range(15):
            day_candidate_date = local_base.date() + timedelta(days=offset)
            if day_candidate_date.weekday() in valid_days:
                candidate = datetime.combine(day_candidate_date, tod, tzinfo=tz)
                if candidate > local_base:
                    next_local = candidate
                    break

        if next_local is None:
            # Fallback
            next_local = local_base + timedelta(days=7)

    elif cadence_str == RecurrenceCadence.MONTHLY:
        target_dom = day_of_month if (day_of_month and 1 <= day_of_month <= 31) else local_base.day

        # Check current month
        year = local_base.year
        month = local_base.month
        max_day = calendar.monthrange(year, month)[1]
        candidate_dom = min(target_dom, max_day)
        candidate = datetime(
            year, month, candidate_dom, tod.hour, tod.minute, tod.second, tzinfo=tz
        )

        if candidate > local_base:
            next_local = candidate
        else:
            # Advance to next month
            if month == 12:
                next_year = year + 1
                next_month = 1
            else:
                next_year = year
                next_month = month + 1
            next_max_day = calendar.monthrange(next_year, next_month)[1]
            next_dom = min(target_dom, next_max_day)
            next_local = datetime(
                next_year, next_month, next_dom, tod.hour, tod.minute, tod.second, tzinfo=tz
            )
    else:
        raise ValueError(f"Unsupported recurrence cadence: {cadence}")

    return next_local.astimezone(ZoneInfo("UTC"))

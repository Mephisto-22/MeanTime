"""Unit tests for recurrence calculation helper."""

from datetime import datetime, time
from unittest import TestCase
from zoneinfo import ZoneInfo
from kanban.models import RecurrenceCadence
from kanban.recurrence import calculate_next_run_at, parse_time_of_day, get_zone_info


class RecurrenceCalculationTests(TestCase):
    def test_parse_time_of_day(self):
        self.assertEqual(parse_time_of_day(time(14, 30)), time(14, 30))
        self.assertEqual(parse_time_of_day("08:15"), time(8, 15, 0))
        self.assertEqual(parse_time_of_day("23:59:59"), time(23, 59, 59))
        with self.assertRaises(ValueError):
            parse_time_of_day(12345)

    def test_daily_recurrence_later_today(self):
        # 10:00 UTC, target 14:00 UTC -> today at 14:00 UTC
        base = datetime(2026, 11, 14, 10, 0, tzinfo=ZoneInfo("UTC"))
        next_run = calculate_next_run_at(
            cadence=RecurrenceCadence.DAILY,
            time_of_day="14:00",
            timezone_name="UTC",
            after=base,
        )
        self.assertEqual(next_run, datetime(2026, 11, 14, 14, 0, tzinfo=ZoneInfo("UTC")))

    def test_daily_recurrence_already_passed_today(self):
        # 15:00 UTC, target 14:00 UTC -> tomorrow at 14:00 UTC
        base = datetime(2026, 11, 14, 15, 0, tzinfo=ZoneInfo("UTC"))
        next_run = calculate_next_run_at(
            cadence=RecurrenceCadence.DAILY,
            time_of_day="14:00",
            timezone_name="UTC",
            after=base,
        )
        self.assertEqual(next_run, datetime(2026, 11, 15, 14, 0, tzinfo=ZoneInfo("UTC")))

    def test_weekly_recurrence_multiple_days(self):
        # 2026-11-14 is Saturday (weekday=5).
        # Days: Monday (0) and Wednesday (2). Next should be Monday 2026-11-16.
        base = datetime(2026, 11, 14, 12, 0, tzinfo=ZoneInfo("UTC"))
        next_run = calculate_next_run_at(
            cadence=RecurrenceCadence.WEEKLY,
            time_of_day="09:00",
            timezone_name="UTC",
            days_of_week=[0, 2],
            after=base,
        )
        self.assertEqual(next_run, datetime(2026, 11, 16, 9, 0, tzinfo=ZoneInfo("UTC")))

    def test_weekly_recurrence_same_day_later_hour(self):
        # 2026-11-16 is Monday (weekday=0). Base is 08:00 UTC. Target is 10:00 UTC.
        base = datetime(2026, 11, 16, 8, 0, tzinfo=ZoneInfo("UTC"))
        next_run = calculate_next_run_at(
            cadence=RecurrenceCadence.WEEKLY,
            time_of_day="10:00",
            timezone_name="UTC",
            days_of_week=[0, 2],
            after=base,
        )
        self.assertEqual(next_run, datetime(2026, 11, 16, 10, 0, tzinfo=ZoneInfo("UTC")))

    def test_monthly_recurrence_same_month(self):
        # Base is 2026-11-05 10:00 UTC. Target day is 20th at 12:00.
        base = datetime(2026, 11, 5, 10, 0, tzinfo=ZoneInfo("UTC"))
        next_run = calculate_next_run_at(
            cadence=RecurrenceCadence.MONTHLY,
            time_of_day="12:00",
            timezone_name="UTC",
            day_of_month=20,
            after=base,
        )
        self.assertEqual(next_run, datetime(2026, 11, 20, 12, 0, tzinfo=ZoneInfo("UTC")))

    def test_monthly_recurrence_next_month_clamped(self):
        # Base is 2026-01-31 15:00 UTC. Target day is 31st.
        # Next month is February (28 days). Next run should be 2026-02-28.
        base = datetime(2026, 1, 31, 15, 0, tzinfo=ZoneInfo("UTC"))
        next_run = calculate_next_run_at(
            cadence=RecurrenceCadence.MONTHLY,
            time_of_day="10:00",
            timezone_name="UTC",
            day_of_month=31,
            after=base,
        )
        self.assertEqual(next_run, datetime(2026, 2, 28, 10, 0, tzinfo=ZoneInfo("UTC")))

    def test_timezone_conversion_to_utc(self):
        # Chicago is UTC-6 in standard time (November).
        # Target: 09:00 in America/Chicago -> 15:00 UTC.
        base = datetime(2026, 11, 14, 12, 0, tzinfo=ZoneInfo("UTC"))  # 06:00 local Chicago
        next_run = calculate_next_run_at(
            cadence=RecurrenceCadence.DAILY,
            time_of_day="09:00",
            timezone_name="America/Chicago",
            after=base,
        )
        self.assertEqual(next_run, datetime(2026, 11, 14, 15, 0, tzinfo=ZoneInfo("UTC")))

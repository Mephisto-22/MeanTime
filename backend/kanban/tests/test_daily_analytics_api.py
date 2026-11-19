"""Tests for the per-day time endpoint, GET /api/analytics/me/daily."""

import json
from datetime import date, datetime, timedelta
from datetime import timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings

from kanban.models import Board, BoardColumn, BoardMembership, Task, TaskTimeEntry
from users.models import UserBlock

User = get_user_model()
PASSWORD = "TestPassword123!"
UTC = dt_timezone.utc


def utc(day, hour, minute=0):
    """Return a UTC datetime on the given November 2026 day."""
    return datetime(2026, 11, day, hour, minute, tzinfo=UTC)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class DailyTimeTestCase(TestCase):
    """A user with one board and a task, plus helpers for entries and requests."""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="me@example.com", password=PASSWORD, display_name="Me")
        self.board = Board.objects.create(owner=self.user, title="Sprint Board")
        self.column = BoardColumn.objects.create(board=self.board, title="To Do", position=0)
        self.task = Task.objects.create(column=self.column, title="Write tests", position=0)

    def add_entry(self, started_at, seconds, task=None, user=None):
        return TaskTimeEntry.objects.create(
            task=task or self.task,
            user=user or self.user,
            started_at=started_at,
            ended_at=started_at + timedelta(seconds=seconds),
            duration_seconds=seconds,
        )

    def auth_for(self, email):
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": email, "password": PASSWORD}),
            content_type="application/json",
        )
        return {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

    def get_daily(self, email="me@example.com", **params):
        return self.client.get("/api/analytics/me/daily", params, **self.auth_for(email))

    def totals(self, res):
        """Map each returned day to its total seconds."""
        return {day["day"]: day["total_seconds"] for day in res.json()["days"]}


class DailyTimeTotalsTests(DailyTimeTestCase):
    """The days and totals the endpoint returns."""

    def test_every_day_in_the_range_is_returned_with_its_total(self):
        self.add_entry(utc(9, 10), 600)
        self.add_entry(utc(9, 14), 300)
        self.add_entry(utc(11, 9), 1200)

        res = self.get_daily(start="2026-11-09", end="2026-11-11")

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["start"], "2026-11-09")
        self.assertEqual(data["end"], "2026-11-11")
        self.assertEqual(data["timezone"], "UTC")
        self.assertEqual(data["total_seconds"], 2100)
        self.assertEqual(
            self.totals(res), {"2026-11-09": 900, "2026-11-10": 0, "2026-11-11": 1200})

    def test_each_day_lists_its_entries_with_task_and_board(self):
        first = self.add_entry(utc(9, 10), 600)
        second = self.add_entry(utc(9, 8), 300)

        res = self.get_daily(start="2026-11-09", end="2026-11-09")

        entries = res.json()["days"][0]["entries"]
        self.assertEqual([entry["id"] for entry in entries], [second.id, first.id])
        self.assertEqual(entries[0]["task_id"], self.task.id)
        self.assertEqual(entries[0]["task_title"], "Write tests")
        self.assertEqual(entries[0]["board_id"], self.board.id)
        self.assertEqual(entries[0]["board_title"], "Sprint Board")
        self.assertEqual(entries[0]["duration_seconds"], 300)

    def test_entries_outside_the_range_are_ignored(self):
        self.add_entry(utc(8, 23, 59), 600)
        self.add_entry(utc(12, 0), 600)

        res = self.get_daily(start="2026-11-09", end="2026-11-11")

        self.assertEqual(res.json()["total_seconds"], 0)

    def test_without_dates_the_range_is_the_last_seven_days(self):
        res = self.get_daily()

        self.assertEqual(res.status_code, 200)
        data = res.json()
        today = datetime.now(UTC).date()
        self.assertEqual(data["end"], today.isoformat())
        self.assertEqual(data["start"], (today - timedelta(days=6)).isoformat())
        self.assertEqual(len(data["days"]), 7)

    def test_without_dates_today_follows_the_profile_timezone(self):
        self.user.timezone = "Pacific/Kiritimati"  # UTC+14
        self.user.save(update_fields=["timezone"])

        res = self.get_daily()

        today = datetime.now(ZoneInfo("Pacific/Kiritimati")).date()
        self.assertEqual(res.json()["end"], today.isoformat())


class DailyTimeTimezoneTests(DailyTimeTestCase):
    """Days follow the user's profile timezone, not UTC."""

    def test_days_follow_the_profile_timezone(self):
        self.user.timezone = "America/Chicago"  # UTC-6 in November
        self.user.save(update_fields=["timezone"])
        # 03:00 UTC on the 10th is 21:00 on the 9th in Chicago.
        self.add_entry(utc(10, 3), 600)

        res = self.get_daily(start="2026-11-09", end="2026-11-10")

        self.assertEqual(res.json()["timezone"], "America/Chicago")
        self.assertEqual(self.totals(res), {"2026-11-09": 600, "2026-11-10": 0})

    def test_the_range_starts_and_ends_at_local_midnight(self):
        self.user.timezone = "America/Chicago"
        self.user.save(update_fields=["timezone"])
        # 05:59 UTC on the 9th is 23:59 on the 8th in Chicago: before the range.
        self.add_entry(utc(9, 5, 59), 300)
        # 06:00 UTC on the 12th is midnight on the 12th in Chicago: after the range.
        self.add_entry(utc(12, 6), 300)
        # 05:59 UTC on the 12th is 23:59 on the 11th in Chicago: inside the range.
        self.add_entry(utc(12, 5, 59), 600)

        res = self.get_daily(start="2026-11-09", end="2026-11-11")

        self.assertEqual(
            self.totals(res), {"2026-11-09": 0, "2026-11-10": 0, "2026-11-11": 600})

    def test_a_session_past_midnight_counts_on_its_start_day(self):
        # 23:30 on the 9th to 01:30 on the 10th.
        self.add_entry(utc(9, 23, 30), 7200)

        res = self.get_daily(start="2026-11-09", end="2026-11-10")

        self.assertEqual(self.totals(res), {"2026-11-09": 7200, "2026-11-10": 0})


class DailyTimeAccessTests(DailyTimeTestCase):
    """Only the user's own entries, on boards they can still open, are counted."""

    def setUp(self):
        super().setUp()
        self.teammate = User.objects.create_user(
            email="teammate@example.com", password=PASSWORD, display_name="Teammate")
        self.shared = Board.objects.create(owner=self.teammate, title="Team Board")
        BoardMembership.objects.create(
            board=self.shared, user=self.user, role=BoardMembership.Role.EDITOR
        )
        shared_column = BoardColumn.objects.create(board=self.shared, title="Doing", position=0)
        self.shared_task = Task.objects.create(column=shared_column, title="Pair up", position=0)

    def test_entries_on_boards_shared_with_the_user_are_counted(self):
        self.add_entry(utc(9, 10), 600, task=self.shared_task)

        res = self.get_daily(start="2026-11-09", end="2026-11-09")

        self.assertEqual(res.json()["total_seconds"], 600)
        self.assertEqual(res.json()["days"][0]["entries"][0]["board_title"], "Team Board")

    def test_other_users_entries_are_not_counted(self):
        self.add_entry(utc(9, 10), 600, user=self.teammate)
        self.add_entry(utc(9, 11), 900, task=self.shared_task, user=self.teammate)

        res = self.get_daily(start="2026-11-09", end="2026-11-09")

        self.assertEqual(res.json()["total_seconds"], 0)

    def test_entries_on_a_board_the_user_left_are_not_counted(self):
        self.add_entry(utc(9, 10), 600, task=self.shared_task)
        self.shared.memberships.filter(user=self.user).delete()

        res = self.get_daily(start="2026-11-09", end="2026-11-09")

        self.assertEqual(res.json()["total_seconds"], 0)

    def test_entries_on_a_board_whose_owner_blocked_the_user_are_not_counted(self):
        self.add_entry(utc(9, 10), 600, task=self.shared_task)
        UserBlock.objects.create(blocker=self.teammate, blocked=self.user)

        res = self.get_daily(start="2026-11-09", end="2026-11-09")

        self.assertEqual(res.json()["total_seconds"], 0)

    def test_requires_authentication(self):
        res = self.client.get("/api/analytics/me/daily")

        self.assertEqual(res.status_code, 401)


class DailyTimeRangeValidationTests(DailyTimeTestCase):
    """The date range checks."""

    def test_start_after_end_is_rejected(self):
        res = self.get_daily(start="2026-11-11", end="2026-11-09")

        self.assertEqual(res.status_code, 400)
        self.assertIn("start date", res.json()["detail"])

    def test_a_single_day_range_is_allowed(self):
        res = self.get_daily(start="2026-11-09", end="2026-11-09")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()["days"]), 1)

    def test_ninety_days_is_allowed(self):
        start = date(2026, 8, 1)

        res = self.get_daily(
            start=start.isoformat(), end=(start + timedelta(days=89)).isoformat())

        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()["days"]), 90)

    def test_more_than_ninety_days_is_rejected(self):
        start = date(2026, 8, 1)

        res = self.get_daily(
            start=start.isoformat(), end=(start + timedelta(days=90)).isoformat())

        self.assertEqual(res.status_code, 400)
        self.assertIn("90 days", res.json()["detail"])

    def test_an_invalid_date_is_rejected(self):
        res = self.get_daily(start="not-a-date", end="2026-11-09")

        self.assertEqual(res.status_code, 422)

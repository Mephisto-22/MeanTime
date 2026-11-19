"""Tests for the time per tag and per priority on the board and personal analytics."""

from django.contrib.auth import get_user_model

from kanban.models import Tag, TaskPriority, TaskTimer, TimerMode
from kanban.tests.test_board_analytics_api import PASSWORD, BoardAnalyticsTestCase
from kanban.tests.test_daily_analytics_api import DailyTimeTestCase, utc

User = get_user_model()


class BoardBreakdownTestCase(BoardAnalyticsTestCase):
    """The owner's board, with helpers for tagged tasks and the breakdown."""

    def tag(self, name, user=None):
        return Tag.objects.get_or_create(user=user or self.owner, name=name)[0]

    def add_tagged_task(self, title, seconds, tags=(), priority=None):
        task = self.add_task(self.todo, title, seconds)
        task.priority = priority
        task.save(update_fields=["priority"])
        task.tags.add(*(self.tag(name) for name in tags))
        return task

    def get_breakdown(self, query=""):
        res = self.client.get(
            f"/api/kanban/boards/{self.board.id}/analytics{query}",
            **self.auth_for("owner@example.com"),
        )
        return res.json()["breakdown"]

    @staticmethod
    def rows(rows):
        return [(row["name"], row["total_seconds"]) for row in rows]


class BoardTagBreakdownTests(BoardBreakdownTestCase):

    def test_time_per_tag_most_first(self):
        self.add_tagged_task("API", 1800, tags=["backend"])
        self.add_tagged_task("Page", 600, tags=["frontend"])
        self.add_tagged_task("Schema", 1200, tags=["backend"])

        self.assertEqual(
            self.rows(self.get_breakdown()["tags"]), [("backend", 3000), ("frontend", 600)])

    def test_a_task_with_several_tags_counts_toward_each(self):
        self.add_tagged_task("Docs for the API", 900, tags=["backend", "docs"])

        self.assertEqual(
            self.rows(self.get_breakdown()["tags"]), [("backend", 900), ("docs", 900)])

    def test_untagged_tasks_go_in_a_none_group_last(self):
        self.add_tagged_task("Tagged", 300, tags=["bug"])
        self.add_tagged_task("Untagged", 1800)

        self.assertEqual(self.rows(self.get_breakdown()["tags"]), [("bug", 300), (None, 1800)])

    def test_same_named_tags_from_two_people_count_once(self):
        alice = User.objects.create_user(
            email="alice@example.com", password=PASSWORD, display_name="Alice")
        self.board.collaborators.add(alice)
        task = self.add_tagged_task("Shared bug", 600, tags=["bug"])
        task.tags.add(self.tag("bug", user=alice))

        self.assertEqual(self.rows(self.get_breakdown()["tags"]), [("bug", 600)])

    def test_tasks_without_tracked_time_are_left_out(self):
        self.add_tagged_task("Not started", 0, tags=["docs"])

        self.assertEqual(self.get_breakdown(), {"tags": [], "priorities": []})


class BoardPriorityBreakdownTests(BoardBreakdownTestCase):

    def test_time_per_priority_from_high_to_low_then_none(self):
        self.add_tagged_task("Low", 300, priority=TaskPriority.LOW)
        self.add_tagged_task("None", 600)
        self.add_tagged_task("High", 120, priority=TaskPriority.HIGH)
        self.add_tagged_task("Also high", 60, priority=TaskPriority.HIGH)

        self.assertEqual(
            self.rows(self.get_breakdown()["priorities"]),
            [("HIGH", 180), ("LOW", 300), (None, 600)],
        )

    def test_breakdown_follows_the_stats_filters(self):
        countdown = self.add_tagged_task("Countdown", 600, tags=["bug"], priority=TaskPriority.HIGH)
        TaskTimer.objects.create(task=countdown, mode=TimerMode.COUNT_DOWN, target_duration_seconds=600)
        self.add_tagged_task("Untimed", 900, tags=["docs"], priority=TaskPriority.LOW)

        breakdown = self.get_breakdown("?timer_mode=COUNT_DOWN")

        self.assertEqual(self.rows(breakdown["tags"]), [("bug", 600)])
        self.assertEqual(self.rows(breakdown["priorities"]), [("HIGH", 600)])


class PersonalBreakdownTests(DailyTimeTestCase):
    """The per-day endpoint's breakdown covers the user's entries in the range."""

    def test_time_per_tag_and_priority_in_the_range(self):
        self.task.priority = TaskPriority.MEDIUM
        self.task.save(update_fields=["priority"])
        self.task.tags.add(
            Tag.objects.create(user=self.user, name="tests"),
            Tag.objects.create(user=self.user, name="backend"),
        )
        self.add_entry(utc(9, 10), 600)
        self.add_entry(utc(10, 10), 300)
        self.add_entry(utc(20, 10), 5000)  # Outside the range.

        breakdown = self.get_daily(start="2026-11-09", end="2026-11-11").json()["breakdown"]

        self.assertEqual(
            [(row["name"], row["total_seconds"]) for row in breakdown["tags"]],
            [("backend", 900), ("tests", 900)],
        )
        self.assertEqual(
            [(row["name"], row["total_seconds"]) for row in breakdown["priorities"]],
            [("MEDIUM", 900)],
        )

    def test_untagged_tasks_without_priority_go_in_none_groups(self):
        self.add_entry(utc(9, 10), 600)

        breakdown = self.get_daily(start="2026-11-09", end="2026-11-09").json()["breakdown"]

        self.assertEqual(breakdown, {
            "tags": [{"name": None, "total_seconds": 600}],
            "priorities": [{"name": None, "total_seconds": 600}],
        })

    def test_only_the_users_own_entries_count(self):
        other = User.objects.create_user(
            email="other@example.com", password=PASSWORD, display_name="Other")
        self.board.collaborators.add(other)
        self.add_entry(utc(9, 10), 600, user=other)

        breakdown = self.get_daily(start="2026-11-09", end="2026-11-09").json()["breakdown"]

        self.assertEqual(breakdown, {"tags": [], "priorities": []})

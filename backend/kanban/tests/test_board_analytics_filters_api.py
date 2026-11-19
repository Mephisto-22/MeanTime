"""Tests for the timer mode and tag filters on GET /api/kanban/boards/{id}/analytics."""

from django.contrib.auth import get_user_model

from kanban.models import BoardMembership, Tag, TaskTimer, TimerMode
from kanban.tests.test_board_analytics_api import PASSWORD, BoardAnalyticsTestCase

User = get_user_model()


class BoardAnalyticsFilterTestCase(BoardAnalyticsTestCase):
    """A board with a countdown, a stopwatch and an untimed task, some of them tagged."""

    def setUp(self):
        super().setUp()
        self.countdown = self.add_task(self.todo, "Countdown", 600, 600)
        TaskTimer.objects.create(
            task=self.countdown, mode=TimerMode.COUNT_DOWN, target_duration_seconds=600)
        self.stopwatch = self.add_task(self.done, "Stopwatch", 1800)
        TaskTimer.objects.create(task=self.stopwatch, mode=TimerMode.COUNT_UP)
        self.untimed = self.add_task(self.done, "Logged by hand", 300)

        self.bug = Tag.objects.create(user=self.owner, name="bug")
        self.docs = Tag.objects.create(user=self.owner, name="docs")
        self.countdown.tags.add(self.bug)
        self.stopwatch.tags.add(self.bug, self.docs)
        self.untimed.tags.add(self.docs)

    def get_filtered(self, query=""):
        return self.client.get(
            f"/api/kanban/boards/{self.board.id}/analytics{query}",
            **self.auth_for("owner@example.com"),
        )

    @staticmethod
    def summary(data):
        return {
            "total": data["total_seconds"],
            "columns": [column["total_seconds"] for column in data["columns"]],
            "tasks": [task["title"] for task in data["top_tasks"]],
        }


class TimerModeFilterTests(BoardAnalyticsFilterTestCase):

    def test_without_filters_every_task_counts(self):
        data = self.get_filtered().json()

        self.assertEqual(self.summary(data), {
            "total": 3300,
            "columns": [1200, 2100],
            "tasks": ["Stopwatch", "Countdown", "Logged by hand"],
        })

    def test_countdown_keeps_only_countdown_tasks(self):
        data = self.get_filtered("?timer_mode=COUNT_DOWN").json()

        self.assertEqual(self.summary(data), {"total": 1200, "columns": [1200, 0], "tasks": ["Countdown"]})

    def test_stopwatch_keeps_only_stopwatch_tasks(self):
        data = self.get_filtered("?timer_mode=COUNT_UP").json()

        self.assertEqual(self.summary(data), {"total": 1800, "columns": [0, 1800], "tasks": ["Stopwatch"]})

    def test_unknown_timer_mode_is_rejected(self):
        self.assertEqual(self.get_filtered("?timer_mode=NONE").status_code, 422)


class TagFilterTests(BoardAnalyticsFilterTestCase):

    def test_one_tag(self):
        data = self.get_filtered("?tags=bug").json()

        self.assertEqual(data["top_tasks"][0]["title"], "Stopwatch")
        self.assertEqual(self.summary(data)["tasks"], ["Stopwatch", "Countdown"])
        self.assertEqual(data["total_seconds"], 3000)

    def test_any_of_several_tags_and_no_double_counting(self):
        # The stopwatch task has both tags, and still counts once.
        data = self.get_filtered("?tags=bug&tags=docs").json()

        self.assertEqual(data["total_seconds"], 3300)
        self.assertEqual(len(data["top_tasks"]), 3)

    def test_tags_and_timer_mode_together(self):
        data = self.get_filtered("?tags=docs&timer_mode=COUNT_UP").json()

        self.assertEqual(self.summary(data)["tasks"], ["Stopwatch"])

    def test_collaborators_tag_with_the_same_name_matches(self):
        alice = User.objects.create_user(
            email="alice@example.com", password=PASSWORD, display_name="Alice")
        BoardMembership.objects.create(board=self.board, user=alice)
        shared = self.add_task(self.todo, "Alice's bug", 120)
        shared.tags.add(Tag.objects.create(user=alice, name="bug"))

        data = self.get_filtered("?tags=bug").json()

        self.assertIn("Alice's bug", self.summary(data)["tasks"])
        self.assertEqual(data["tags"], ["bug", "docs"])

    def test_tag_list_is_every_tag_on_the_board_whatever_the_filter(self):
        Tag.objects.create(user=self.owner, name="unused")

        data = self.get_filtered("?tags=bug&timer_mode=COUNT_DOWN").json()

        self.assertEqual(data["tags"], ["bug", "docs"])

    def test_time_per_collaborator_follows_the_filters(self):
        alice = User.objects.create_user(
            email="alice@example.com", password=PASSWORD, display_name="Alice")
        BoardMembership.objects.create(board=self.board, user=alice)
        alices_task = self.add_task(self.todo, "Alice's docs")
        alices_task.time_entries.create(
            user=alice, started_at=alices_task.created_at, duration_seconds=900)
        alices_task.tags.add(self.docs)

        def people(query):
            return {
                row["display_name"]: row["total_seconds"]
                for row in self.get_filtered(query).json()["collaborators"]
            }

        self.assertEqual(people(""), {"Owner": 3300, "Alice": 900})
        self.assertEqual(people("?tags=bug"), {"Owner": 3000, "Alice": 0})
        self.assertEqual(people("?tags=docs&timer_mode=COUNT_UP"), {"Owner": 1800, "Alice": 0})

    def test_no_matching_tasks(self):
        data = self.get_filtered("?tags=missing").json()

        self.assertEqual(self.summary(data), {"total": 0, "columns": [0, 0], "tasks": []})

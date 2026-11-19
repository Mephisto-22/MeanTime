"""Tests for the averages in GET /api/kanban/boards/{id}/analytics."""

from django.utils import timezone

from kanban.models import TaskTimeEntry, TaskTimer, TimerMode
from kanban.tests.test_board_analytics_api import BoardAnalyticsTestCase


class TaskAveragesTests(BoardAnalyticsTestCase):

    def get_averages(self, query=""):
        res = self.client.get(
            f"/api/kanban/boards/{self.board.id}/analytics{query}",
            **self.auth_for("owner@example.com"),
        )
        return res.json()["averages"]

    def test_averages_across_tracked_tasks(self):
        self.add_task(self.todo, "Three sessions", 600, 600, 600)  # 30m over 3 sessions
        self.add_task(self.done, "One session", 1800)  # 30m over 1 session
        self.add_task(self.todo, "Not started")  # Left out.

        self.assertEqual(self.get_averages(), {
            "task_count": 2,
            "session_count": 4,
            "average_task_seconds": 1800,
            "average_session_seconds": 900,
            "average_sessions_per_task": 2.0,
        })

    def test_averages_are_rounded(self):
        self.add_task(self.todo, "A", 100, 100)
        self.add_task(self.todo, "B", 101)
        self.add_task(self.todo, "C", 100, 100)

        averages = self.get_averages()

        self.assertEqual(averages["average_task_seconds"], 167)  # 501 / 3
        self.assertEqual(averages["average_session_seconds"], 100)  # 501 / 5
        self.assertEqual(averages["average_sessions_per_task"], 1.7)  # 5 / 3

    def test_zero_length_entries_are_not_sessions(self):
        task = self.add_task(self.todo, "Focus", 600)
        now = timezone.now()
        TaskTimeEntry.objects.create(task=task, started_at=now, ended_at=now, duration_seconds=0)

        self.assertEqual(self.get_averages()["session_count"], 1)

    def test_no_tracked_time(self):
        self.add_task(self.todo, "Not started")

        self.assertEqual(self.get_averages(), {
            "task_count": 0,
            "session_count": 0,
            "average_task_seconds": None,
            "average_session_seconds": None,
            "average_sessions_per_task": None,
        })

    def test_averages_follow_the_timer_mode_filter(self):
        countdown = self.add_task(self.todo, "Countdown", 1500, 1500)
        TaskTimer.objects.create(
            task=countdown, mode=TimerMode.COUNT_DOWN, target_duration_seconds=1500)
        self.add_task(self.todo, "Untimed", 60)

        averages = self.get_averages("?timer_mode=COUNT_DOWN")

        self.assertEqual(averages["task_count"], 1)
        self.assertEqual(averages["average_session_seconds"], 1500)
        self.assertEqual(averages["average_sessions_per_task"], 2.0)

"""Tests for planned vs actual time in GET /api/kanban/boards/{id}/analytics."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from kanban.models import Board, BoardColumn, TaskTimeEntry, TaskTimer, TimerMode, TimerState
from kanban.tests.test_board_analytics_api import PASSWORD, BoardAnalyticsTestCase

User = get_user_model()


class EstimateAnalyticsTestCase(BoardAnalyticsTestCase):
    """The owner's board, plus helpers for tasks with a countdown target."""

    def add_countdown_task(self, title, target, *durations, column=None):
        task = self.add_task(column or self.todo, title, *durations)
        TaskTimer.objects.create(
            task=task, mode=TimerMode.COUNT_DOWN, target_duration_seconds=target)
        return task

    def get_estimates(self):
        data = self.get_analytics(**self.auth_for("owner@example.com")).json()
        return data["estimates"]

    @staticmethod
    def estimate_tuples(estimates):
        """Project each estimate row to (title, planned_seconds, actual_seconds, difference_seconds)."""
        return [
            (row["title"], row["planned_seconds"], row["actual_seconds"], row["difference_seconds"])
            for row in estimates["tasks"]
        ]


class EstimateTotalsTests(EstimateAnalyticsTestCase):
    """Planned, actual and the difference for each countdown task."""

    def test_tasks_under_on_and_over_their_target(self):
        self.add_countdown_task("Under", 1500, 1200)
        self.add_countdown_task("On", 1500, 1500)
        self.add_countdown_task("Over", 1500, 900, 900)  # Two sessions add up.

        estimates = self.get_estimates()

        self.assertEqual(
            self.estimate_tuples(estimates),
            [("Over", 1500, 1800, 300), ("On", 1500, 1500, 0), ("Under", 1500, 1200, -300)],
        )

    def test_row_includes_the_task_and_its_column(self):
        task = self.add_countdown_task("Focus", 600, 300, column=self.done)

        row = self.get_estimates()["tasks"][0]

        self.assertEqual(row["task_id"], task.id)
        self.assertEqual(row["column_id"], self.done.id)
        self.assertEqual(row["column_title"], "Done")

    def test_tasks_without_a_countdown_target_are_left_out(self):
        self.add_task(self.todo, "No timer", 600)
        count_up = self.add_task(self.todo, "Count up", 600)
        TaskTimer.objects.create(
            task=count_up, mode=TimerMode.COUNT_UP, target_duration_seconds=300)
        no_target = self.add_task(self.todo, "Countdown without target", 600)
        TaskTimer.objects.create(task=no_target, mode=TimerMode.COUNT_DOWN)
        self.add_countdown_task("Countdown", 300, 600)

        estimates = self.get_estimates()

        self.assertEqual([row["title"] for row in estimates["tasks"]], ["Countdown"])

    def test_actual_time_counts_everyone_who_tracked_the_task(self):
        alice = User.objects.create_user(
            email="alice@example.com", password=PASSWORD, display_name="Alice")
        self.board.collaborators.add(alice)
        task = self.add_countdown_task("Shared", 1200, 600)
        now = timezone.now()
        TaskTimeEntry.objects.create(
            task=task, user=alice, started_at=now, ended_at=now, duration_seconds=900)

        self.assertEqual(self.estimate_tuples(self.get_estimates()), [("Shared", 1200, 1500, 300)])

    def test_expired_countdown_counts_as_actual_time(self):
        task = self.add_task(self.todo, "Running")
        TaskTimer.objects.create(
            task=task,
            mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=1500,
            state=TimerState.RUNNING,
            started_at=timezone.now() - timedelta(seconds=1600),
        )

        self.assertEqual(self.estimate_tuples(self.get_estimates()), [("Running", 1500, 1500, 0)])

    def test_other_boards_are_not_counted(self):
        other_board = Board.objects.create(owner=self.owner, title="Other")
        other_column = BoardColumn.objects.create(board=other_board, title="To Do")
        self.add_countdown_task("Elsewhere", 600, 900, column=other_column)

        self.assertEqual(self.get_estimates()["tasks"], [])


class EstimateAverageTests(EstimateAnalyticsTestCase):
    """The board's average difference from its targets."""

    def test_average_of_each_tasks_percentage(self):
        self.add_countdown_task("20% over", 1000, 1200)
        self.add_countdown_task("10% under", 1000, 900)
        self.add_countdown_task("50% over", 600, 900)

        estimates = self.get_estimates()

        self.assertEqual(estimates["average_difference_percent"], 20)
        self.assertEqual(estimates["tracked_task_count"], 3)

    def test_average_under_target_is_negative(self):
        self.add_countdown_task("Quick", 1000, 750)

        self.assertEqual(self.get_estimates()["average_difference_percent"], -25)

    def test_untracked_tasks_are_listed_but_not_averaged(self):
        self.add_countdown_task("Tracked", 1000, 1100)
        self.add_countdown_task("Not started", 1000)

        estimates = self.get_estimates()

        self.assertEqual(
            self.estimate_tuples(estimates),
            [("Tracked", 1000, 1100, 100), ("Not started", 1000, 0, -1000)],
        )
        self.assertEqual(estimates["average_difference_percent"], 10)
        self.assertEqual(estimates["tracked_task_count"], 1)

    def test_no_average_without_tracked_time(self):
        self.add_countdown_task("Not started", 1000)

        estimates = self.get_estimates()

        self.assertIsNone(estimates["average_difference_percent"])
        self.assertEqual(estimates["tracked_task_count"], 0)

    def test_board_without_countdown_tasks(self):
        self.add_task(self.todo, "Plain", 600)

        self.assertEqual(
            self.get_estimates(),
            {"tasks": [], "average_difference_percent": None, "tracked_task_count": 0},
        )


class EstimateAccessTests(EstimateAnalyticsTestCase):
    """Collaborators see the same comparison; anyone else gets 404."""

    def setUp(self):
        super().setUp()
        self.add_countdown_task("Focus", 600, 900)
        User.objects.create_user(
            email="collab@example.com", password=PASSWORD, display_name="Collaborator")
        User.objects.create_user(
            email="stranger@example.com", password=PASSWORD, display_name="Stranger")
        self.board.collaborators.add(User.objects.get(email="collab@example.com"))

    def test_collaborator_sees_the_comparison(self):
        res = self.get_analytics(**self.auth_for("collab@example.com"))

        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.estimate_tuples(res.json()["estimates"]), [("Focus", 600, 900, 300)])

    def test_stranger_gets_404(self):
        res = self.get_analytics(**self.auth_for("stranger@example.com"))

        self.assertEqual(res.status_code, 404)

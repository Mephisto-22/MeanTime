"""Tests for the board analytics endpoint, GET /api/kanban/boards/{id}/analytics."""

import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from kanban.models import Board, BoardColumn, Task, TaskTimeEntry, TaskTimer, TimerMode, TimerState
from users.models import UserBlock

User = get_user_model()
PASSWORD = "TestPassword123!"


class BoardAnalyticsTestCase(TestCase):
    """An owner's board with two columns, plus helpers for tasks, entries and logins."""

    def setUp(self):
        self.client = Client()
        self.owner = User.objects.create_user(
            email="owner@example.com", password=PASSWORD, display_name="Owner")
        self.board = Board.objects.create(owner=self.owner, title="Sprint Board")
        self.todo = BoardColumn.objects.create(board=self.board, title="To Do", position=0)
        self.done = BoardColumn.objects.create(board=self.board, title="Done", position=1)

    def auth_for(self, email):
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": email, "password": PASSWORD}),
            content_type="application/json",
        )
        return {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

    def add_task(self, column, title, *durations):
        task = Task.objects.create(column=column, title=title, position=column.tasks.count())
        now = timezone.now()
        for seconds in durations:
            TaskTimeEntry.objects.create(
                task=task,
                user=self.owner,
                started_at=now - timedelta(seconds=seconds),
                ended_at=now,
                duration_seconds=seconds,
            )
        return task

    def get_analytics(self, board_id=None, **auth):
        return self.client.get(
            f"/api/kanban/boards/{board_id or self.board.id}/analytics", **auth)


class BoardAnalyticsTotalsTests(BoardAnalyticsTestCase):
    """The totals the endpoint returns."""

    def test_board_without_tracked_time(self):
        self.add_task(self.todo, "Untracked")

        res = self.get_analytics(**self.auth_for("owner@example.com"))

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["board_id"], self.board.id)
        self.assertEqual(data["title"], "Sprint Board")
        self.assertEqual(data["total_seconds"], 0)
        self.assertEqual(
            data["columns"],
            [
                {"column_id": self.todo.id, "title": "To Do", "total_seconds": 0},
                {"column_id": self.done.id, "title": "Done", "total_seconds": 0},
            ],
        )
        self.assertEqual(data["top_tasks"], [])

    def test_board_and_column_totals(self):
        self.add_task(self.todo, "Write tests", 600, 300)
        self.add_task(self.todo, "Fix bug", 120)
        self.add_task(self.done, "Ship it", 1800)

        data = self.get_analytics(**self.auth_for("owner@example.com")).json()

        self.assertEqual(data["total_seconds"], 2820)
        totals = {column["title"]: column["total_seconds"] for column in data["columns"]}
        self.assertEqual(totals, {"To Do": 1020, "Done": 1800})

    def test_columns_follow_board_order(self):
        self.todo.position, self.done.position = 1, 0
        self.todo.save()
        self.done.save()

        data = self.get_analytics(**self.auth_for("owner@example.com")).json()

        self.assertEqual([column["title"] for column in data["columns"]], ["Done", "To Do"])

    def test_top_tasks_are_the_five_longest_with_tracked_time(self):
        for minutes in (1, 7, 3, 9, 5, 2):
            self.add_task(self.todo, f"{minutes} min", minutes * 60)
        self.add_task(self.done, "Untracked")

        data = self.get_analytics(**self.auth_for("owner@example.com")).json()

        self.assertEqual(
            [task["title"] for task in data["top_tasks"]],
            ["9 min", "7 min", "5 min", "3 min", "2 min"],
        )
        first = data["top_tasks"][0]
        self.assertEqual(first["column_id"], self.todo.id)
        self.assertEqual(first["column_title"], "To Do")
        self.assertEqual(first["total_seconds"], 540)

    def test_other_boards_are_not_counted(self):
        self.add_task(self.todo, "Mine", 60)
        other_board = Board.objects.create(owner=self.owner, title="Other")
        other_column = BoardColumn.objects.create(board=other_board, title="To Do")
        self.add_task(other_column, "Elsewhere", 3600)

        data = self.get_analytics(**self.auth_for("owner@example.com")).json()

        self.assertEqual(data["total_seconds"], 60)
        self.assertEqual([task["title"] for task in data["top_tasks"]], ["Mine"])

    def test_expired_countdown_is_counted(self):
        task = self.add_task(self.todo, "Focus")
        TaskTimer.objects.create(
            task=task,
            mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=1500,
            state=TimerState.RUNNING,
            started_at=timezone.now() - timedelta(seconds=1600),
        )

        data = self.get_analytics(**self.auth_for("owner@example.com")).json()

        self.assertEqual(data["total_seconds"], 1500)


class BoardAnalyticsAccessTests(BoardAnalyticsTestCase):
    """Who can see a board's analytics."""

    def setUp(self):
        super().setUp()
        self.collaborator = User.objects.create_user(
            email="collab@example.com", password=PASSWORD, display_name="Collaborator")
        self.stranger = User.objects.create_user(
            email="stranger@example.com", password=PASSWORD, display_name="Stranger")
        self.board.collaborators.add(self.collaborator)
        self.add_task(self.todo, "Shared work", 900)

    def test_owner_can_see_analytics(self):
        res = self.get_analytics(**self.auth_for("owner@example.com"))

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["total_seconds"], 900)

    def test_collaborator_can_see_analytics(self):
        res = self.get_analytics(**self.auth_for("collab@example.com"))

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["total_seconds"], 900)

    def test_stranger_gets_404(self):
        res = self.get_analytics(**self.auth_for("stranger@example.com"))

        self.assertEqual(res.status_code, 404)

    def test_blocked_collaborator_gets_404(self):
        UserBlock.objects.create(blocker=self.owner, blocked=self.collaborator)

        res = self.get_analytics(**self.auth_for("collab@example.com"))

        self.assertEqual(res.status_code, 404)

    def test_missing_board_gets_404(self):
        res = self.get_analytics(board_id=999999, **self.auth_for("owner@example.com"))

        self.assertEqual(res.status_code, 404)

    def test_request_without_token_gets_401(self):
        res = self.get_analytics()

        self.assertEqual(res.status_code, 401)

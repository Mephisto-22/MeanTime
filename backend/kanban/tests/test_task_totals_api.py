"""Tests for the total_seconds field on tasks returned by the kanban API."""

import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import Client, TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from kanban.models import TaskTimeEntry, TaskTimer, TimerMode, TimerState

User = get_user_model()
PASSWORD = "TestPassword123!"


class TaskTotalsTestCase(TestCase):
    """Creates a logged-in user with one board and helpers for tasks and entries."""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="totals@example.com",
            password=PASSWORD,
            display_name="Totals Tester",
        )
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": "totals@example.com", "password": PASSWORD}),
            content_type="application/json",
        )
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

        board = self.client.post(
            "/api/kanban/boards",
            data=json.dumps({"title": "Totals Board"}),
            content_type="application/json",
            **self.auth,
        ).json()
        self.board_id = board["id"]
        self.column_id = board["columns"][0]["id"]

    def create_task(self, title="Task"):
        response = self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({"title": title}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        return response.json()

    def add_entry(self, task_id, seconds):
        now = timezone.now()
        return TaskTimeEntry.objects.create(
            task_id=task_id,
            user=self.user,
            started_at=now - timedelta(seconds=seconds),
            ended_at=now,
            duration_seconds=seconds,
        )

    def get_board(self):
        response = self.client.get(f"/api/kanban/boards/{self.board_id}", **self.auth)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def board_totals(self):
        """Map each task id on the board's first column to its total_seconds."""
        tasks = self.get_board()["columns"][0]["tasks"]
        return {task["id"]: task["total_seconds"] for task in tasks}


class BoardTaskTotalsTests(TaskTotalsTestCase):
    """total_seconds on tasks loaded with a board."""

    def test_task_without_entries_has_zero_total(self):
        task = self.create_task()

        self.assertEqual(self.board_totals()[task["id"]], 0)

    def test_total_sums_every_entry_on_the_task(self):
        task = self.create_task()
        self.add_entry(task["id"], 600)
        self.add_entry(task["id"], 1200)
        self.add_entry(task["id"], 45)

        self.assertEqual(self.board_totals()[task["id"]], 1845)

    def test_entries_on_other_tasks_are_not_counted(self):
        first = self.create_task("First")
        second = self.create_task("Second")
        self.add_entry(first["id"], 300)
        self.add_entry(second["id"], 900)

        totals = self.board_totals()

        self.assertEqual(totals[first["id"]], 300)
        self.assertEqual(totals[second["id"]], 900)

    def test_board_list_includes_totals(self):
        task = self.create_task()
        self.add_entry(task["id"], 120)

        response = self.client.get("/api/kanban/boards", **self.auth)

        tasks = response.json()[0]["columns"][0]["tasks"]
        self.assertEqual(tasks[0]["total_seconds"], 120)

    def test_totals_do_not_add_a_query_per_task(self):
        self.add_entry(self.create_task()["id"], 60)
        with CaptureQueriesContext(connection) as one_task:
            self.get_board()

        for _ in range(3):
            self.add_entry(self.create_task()["id"], 60)
        with CaptureQueriesContext(connection) as four_tasks:
            self.get_board()

        self.assertEqual(len(four_tasks), len(one_task))


class TaskEndpointTotalsTests(TaskTotalsTestCase):
    """total_seconds on tasks returned by the task endpoints."""

    def test_new_task_has_zero_total(self):
        self.assertEqual(self.create_task()["total_seconds"], 0)

    def test_updated_task_returns_its_total(self):
        task = self.create_task()
        self.add_entry(task["id"], 500)

        response = self.client.patch(
            f"/api/kanban/tasks/{task['id']}",
            data=json.dumps({"title": "Renamed"}),
            content_type="application/json",
            **self.auth,
        )

        self.assertEqual(response.json()["total_seconds"], 500)


class TotalsAfterEntryChangesTests(TaskTotalsTestCase):
    """The total reflects time entries as they're added, edited and deleted."""

    def test_total_includes_a_manually_logged_entry(self):
        task = self.create_task()
        now = timezone.now()

        self.client.post(
            f"/api/kanban/tasks/{task['id']}/time-entries",
            data=json.dumps({
                "started_at": (now - timedelta(minutes=30)).isoformat(),
                "ended_at": now.isoformat(),
            }),
            content_type="application/json",
            **self.auth,
        )

        self.assertEqual(self.board_totals()[task["id"]], 1800)

    def test_total_follows_an_edited_entry(self):
        task = self.create_task()
        entry = self.add_entry(task["id"], 1200)

        self.client.patch(
            f"/api/kanban/time-entries/{entry.id}",
            data=json.dumps({"duration_seconds": 600}),
            content_type="application/json",
            **self.auth,
        )

        self.assertEqual(self.board_totals()[task["id"]], 600)

    def test_total_drops_a_deleted_entry(self):
        task = self.create_task()
        self.add_entry(task["id"], 300)
        entry = self.add_entry(task["id"], 700)

        self.client.delete(f"/api/kanban/time-entries/{entry.id}", **self.auth)

        self.assertEqual(self.board_totals()[task["id"]], 300)

    def test_total_includes_a_stopped_timer_session(self):
        task = self.create_task()
        TaskTimer.objects.create(
            task_id=task["id"],
            mode=TimerMode.COUNT_UP,
            state=TimerState.PAUSED,
            started_at=timezone.now() - timedelta(minutes=10),
            last_paused_at=timezone.now(),
            elapsed_seconds=420,
        )

        self.client.patch(
            f"/api/kanban/tasks/{task['id']}/timer",
            data=json.dumps({"state": "IDLE"}),
            content_type="application/json",
            **self.auth,
        )

        self.assertEqual(self.board_totals()[task["id"]], 420)

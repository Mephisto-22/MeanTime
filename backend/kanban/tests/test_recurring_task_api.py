"""API integration tests for recurring task models, schemas, and endpoints."""

import json
from datetime import datetime, time
from zoneinfo import ZoneInfo
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from kanban.models import (
    Board,
    BoardColumn,
    RecurringTask,
    RecurrenceCadence,
    Tag,
    Task,
    TaskPriority,
    TimerMode,
)

User = get_user_model()
PASSWORD = "Password123!"


class RecurringTaskApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="owner@example.com",
            password=PASSWORD,
            display_name="Board Owner",
        )
        self.other_user = User.objects.create_user(
            email="other@example.com",
            password=PASSWORD,
            display_name="Other User",
        )

        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": "owner@example.com", "password": PASSWORD}),
            content_type="application/json",
        )
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

        other_login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": "other@example.com", "password": PASSWORD}),
            content_type="application/json",
        )
        self.other_auth = {"HTTP_AUTHORIZATION": f"Bearer {other_login.json()['access_token']}"}

        self.board = Board.objects.create(owner=self.user, title="Test Board")
        self.col_todo = BoardColumn.objects.create(board=self.board, title="To Do", position=0)
        self.col_done = BoardColumn.objects.create(board=self.board, title="Done", position=1)

        self.tag = Tag.objects.create(user=self.user, name="Chores")

    def test_create_task_with_recurrence_in_column(self):
        """Creating a task with recurrence creates both the Task and its parent RecurringTask."""
        payload = {
            "title": "Daily Standup Prep",
            "description": "Review daily tasks",
            "priority": "HIGH",
            "tag_ids": [self.tag.id],
            "timer_mode": "COUNT_DOWN",
            "target_duration_seconds": 900,
            "recurrence": {
                "cadence": "DAILY",
                "days_of_week": [],
                "time_of_day": "09:00",
                "timezone": "America/Chicago",
            },
        }

        response = self.client.post(
            f"/api/kanban/columns/{self.col_todo.id}/tasks",
            data=json.dumps(payload),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["title"], "Daily Standup Prep")
        self.assertEqual(data["priority"], "HIGH")
        self.assertIsNotNone(data["recurring_task_id"])
        self.assertIsNotNone(data["recurring_task"])
        self.assertEqual(data["recurring_task"]["cadence"], "DAILY")
        self.assertEqual(data["recurring_task"]["timezone"], "America/Chicago")
        self.assertTrue(data["recurring_task"]["is_active"])

        # Check DB state
        task = Task.objects.get(id=data["id"])
        self.assertIsNotNone(task.recurring_task)
        rec = task.recurring_task
        self.assertEqual(rec.title, "Daily Standup Prep")
        self.assertEqual(rec.creator, self.user)
        self.assertEqual(rec.board, self.board)
        self.assertEqual(rec.cadence, RecurrenceCadence.DAILY)
        self.assertEqual(rec.default_timer_mode, TimerMode.COUNT_DOWN)
        self.assertEqual(rec.target_duration_seconds, 900)
        self.assertIn(self.tag, rec.tags.all())
        self.assertIsNotNone(rec.next_run_at)

    def test_create_task_via_board_endpoint_with_recurrence(self):
        """Creating a task via board endpoint supports recurrence and column assignment."""
        payload = {
            "title": "Weekly Habit",
            "description": "Weekly review",
            "column_id": self.col_done.id,
            "recurrence": {
                "cadence": "WEEKLY",
                "days_of_week": [0, 4],  # Monday, Friday
                "time_of_day": "12:00",
                "timezone": "UTC",
            },
        }

        response = self.client.post(
            f"/api/kanban/boards/{self.board.id}/tasks",
            data=json.dumps(payload),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["column_id"], self.col_done.id)
        self.assertIsNotNone(data["recurring_task_id"])
        self.assertEqual(data["recurring_task"]["cadence"], "WEEKLY")
        self.assertEqual(data["recurring_task"]["days_of_week"], [0, 4])

    def test_update_task_apply_to_future_false(self):
        """Updating a recurring task with apply_to_future=False modifies only the current occurrence."""
        rec = RecurringTask.objects.create(
            board=self.board,
            creator=self.user,
            title="Blueprint Title",
            cadence=RecurrenceCadence.DAILY,
            next_run_at=timezone.now(),
        )
        task = Task.objects.create(
            column=self.col_todo,
            recurring_task=rec,
            title="Initial Title",
            position=0,
        )

        payload = {
            "title": "Modified Title for This Task Only",
            "apply_to_future": False,
        }

        response = self.client.patch(
            f"/api/kanban/tasks/{task.id}",
            data=json.dumps(payload),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)

        task.refresh_from_db()
        rec.refresh_from_db()

        self.assertEqual(task.title, "Modified Title for This Task Only")
        self.assertEqual(rec.title, "Blueprint Title")

    def test_update_task_apply_to_future_true(self):
        """Updating a recurring task with apply_to_future=True modifies occurrence AND parent blueprint."""
        rec = RecurringTask.objects.create(
            board=self.board,
            creator=self.user,
            title="Blueprint Title",
            cadence=RecurrenceCadence.DAILY,
            next_run_at=timezone.now(),
        )
        task = Task.objects.create(
            column=self.col_todo,
            recurring_task=rec,
            title="Initial Title",
            position=0,
        )

        payload = {
            "title": "New Title Across Future Occurrences",
            "priority": "HIGH",
            "timer_mode": "COUNT_DOWN",
            "target_duration_seconds": 1800,
            "apply_to_future": True,
            "recurrence": {
                "cadence": "WEEKLY",
                "days_of_week": [1, 3],
                "time_of_day": "10:00",
            },
        }

        response = self.client.patch(
            f"/api/kanban/tasks/{task.id}",
            data=json.dumps(payload),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)

        task.refresh_from_db()
        rec.refresh_from_db()

        self.assertEqual(task.title, "New Title Across Future Occurrences")
        self.assertEqual(rec.title, "New Title Across Future Occurrences")
        self.assertEqual(task.priority, TaskPriority.HIGH)
        self.assertEqual(rec.priority, TaskPriority.HIGH)
        self.assertEqual(rec.cadence, RecurrenceCadence.WEEKLY)
        self.assertEqual(rec.days_of_week, [1, 3])
        self.assertEqual(rec.default_timer_mode, "COUNT_DOWN")
        self.assertEqual(rec.target_duration_seconds, 1800)

    def test_update_non_recurring_task_add_recurrence(self):
        """Updating a non-recurring task with recurrence configures recurrence and links a new RecurringTask."""
        task = Task.objects.create(
            column=self.col_todo,
            title="Non-recurring Task",
            position=0,
        )
        self.assertIsNone(task.recurring_task)

        payload = {
            "recurrence": {
                "cadence": "DAILY",
                "days_of_week": [],
                "time_of_day": "09:30",
                "timezone": "America/Chicago",
            },
        }

        response = self.client.patch(
            f"/api/kanban/tasks/{task.id}",
            data=json.dumps(payload),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsNotNone(data["recurring_task_id"])
        self.assertIsNotNone(data["recurring_task"])
        self.assertEqual(data["recurring_task"]["cadence"], "DAILY")
        self.assertEqual(data["recurring_task"]["time_of_day"], "09:30:00")

        task.refresh_from_db()
        self.assertIsNotNone(task.recurring_task)
        self.assertEqual(task.recurring_task.cadence, RecurrenceCadence.DAILY)
        self.assertEqual(str(task.recurring_task.time_of_day), "09:30:00")

    def test_update_task_recurrence_schedule_without_apply_to_future(self):
        """Updating recurrence schedule on a recurring task updates the blueprint even if apply_to_future=False."""
        rec = RecurringTask.objects.create(
            board=self.board,
            creator=self.user,
            title="Blueprint Title",
            cadence=RecurrenceCadence.DAILY,
            next_run_at=timezone.now(),
        )
        task = Task.objects.create(
            column=self.col_todo,
            recurring_task=rec,
            title="Initial Title",
            position=0,
        )

        payload = {
            "title": "One-off title change",
            "apply_to_future": False,
            "recurrence": {
                "cadence": "WEEKLY",
                "days_of_week": [1, 4],
            },
        }

        response = self.client.patch(
            f"/api/kanban/tasks/{task.id}",
            data=json.dumps(payload),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        task.refresh_from_db()
        rec.refresh_from_db()
        self.assertEqual(task.title, "One-off title change")
        self.assertEqual(rec.title, "Blueprint Title")
        self.assertEqual(rec.cadence, RecurrenceCadence.WEEKLY)
        self.assertEqual(rec.days_of_week, [1, 4])

    def test_delete_task_cancel_recurrence_false(self):
        """Deleting a recurring task with cancel_recurrence=False leaves the recurrence schedule active."""
        rec = RecurringTask.objects.create(
            board=self.board,
            creator=self.user,
            title="Habit",
            cadence=RecurrenceCadence.DAILY,
            is_active=True,
            next_run_at=timezone.now(),
        )
        task = Task.objects.create(
            column=self.col_todo,
            recurring_task=rec,
            title="Habit Task",
            position=0,
        )

        response = self.client.delete(f"/api/kanban/tasks/{task.id}?cancel_recurrence=false", **self.auth)
        self.assertEqual(response.status_code, 200)

        self.assertFalse(Task.objects.filter(id=task.id).exists())
        rec.refresh_from_db()
        self.assertTrue(rec.is_active)

    def test_delete_task_cancel_recurrence_true(self):
        """Deleting a recurring task with cancel_recurrence=True deactivates the recurrence schedule."""
        rec = RecurringTask.objects.create(
            board=self.board,
            creator=self.user,
            title="Habit",
            cadence=RecurrenceCadence.DAILY,
            is_active=True,
            next_run_at=timezone.now(),
        )
        task = Task.objects.create(
            column=self.col_todo,
            recurring_task=rec,
            title="Habit Task",
            position=0,
        )

        response = self.client.delete(f"/api/kanban/tasks/{task.id}?cancel_recurrence=true", **self.auth)
        self.assertEqual(response.status_code, 200)

        self.assertFalse(Task.objects.filter(id=task.id).exists())
        rec.refresh_from_db()
        self.assertFalse(rec.is_active)

    def test_patch_recurring_task_blueprint(self):
        """Blueprint can be directly updated, recalculating next_run_at when cadence shifts."""
        rec = RecurringTask.objects.create(
            board=self.board,
            creator=self.user,
            title="Original Blueprint",
            cadence=RecurrenceCadence.DAILY,
            time_of_day="08:00:00",
            timezone="UTC",
            is_active=True,
            next_run_at=timezone.now(),
        )

        # PATCH blueprint (deactivate)
        response = self.client.patch(
            f"/api/kanban/recurring-tasks/{rec.id}",
            data=json.dumps({"is_active": False}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        rec.refresh_from_db()
        self.assertFalse(rec.is_active)

        # PATCH blueprint (cadence change to weekly)
        response = self.client.patch(
            f"/api/kanban/recurring-tasks/{rec.id}",
            data=json.dumps({"cadence": "WEEKLY", "days_of_week": [1, 3]}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        rec.refresh_from_db()
        self.assertEqual(rec.cadence, RecurrenceCadence.WEEKLY)
        self.assertEqual(rec.days_of_week, [1, 3])

    def test_unauthorized_user_cannot_access_recurring_tasks(self):
        """Non-collaborators receive 404 when attempting to alter recurring blueprints."""
        rec = RecurringTask.objects.create(
            board=self.board,
            creator=self.user,
            title="Secret Rec",
            cadence=RecurrenceCadence.DAILY,
            next_run_at=timezone.now(),
        )

        res_patch = self.client.patch(
            f"/api/kanban/recurring-tasks/{rec.id}",
            data=json.dumps({"title": "Hacked"}),
            content_type="application/json",
            **self.other_auth,
        )
        self.assertEqual(res_patch.status_code, 404)

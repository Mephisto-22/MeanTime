"""Tests for task due dates, collaborator reminder recalculation, and API endpoints."""

from datetime import timedelta
import json
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from kanban.event_schemas import BoardEventType
from kanban.models import Board, BoardColumn, Task

User = get_user_model()
PASSWORD = "TestPassword123!"


class TaskDueDateModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="tester@example.com",
            password=PASSWORD,
            display_name="Tester",
        )
        self.board = Board.objects.create(owner=self.user, title="Test Board")
        self.column = BoardColumn.objects.create(board=self.board, title="Todo", position=0)

    def test_create_task_with_future_reminder(self):
        """Creating a task with future due date and reminder calculates reminder_at and leaves reminder_sent_at None."""
        future_due = timezone.now() + timedelta(days=2)
        task = Task(
            column=self.column,
            title="Future Task",
        )
        task.set_due_date_and_reminder(future_due, reminder_offset_seconds=3600)
        task.save()
        self.assertIsNotNone(task.reminder_at)
        self.assertEqual(task.reminder_at, future_due - timedelta(seconds=3600))
        self.assertIsNone(task.reminder_sent_at)

    def test_create_task_with_past_reminder_suppresses_dispatch(self):
        """Creating a task whose reminder window is already past initializes reminder_sent_at to now."""
        past_due = timezone.now() - timedelta(minutes=5)
        task = Task(
            column=self.column,
            title="Past Due Task",
        )
        task.set_due_date_and_reminder(past_due, reminder_offset_seconds=900)
        task.save()
        self.assertIsNotNone(task.reminder_at)
        self.assertEqual(task.reminder_at, past_due - timedelta(seconds=900))
        self.assertIsNotNone(task.reminder_sent_at)
        self.assertAlmostEqual(
            task.reminder_sent_at.timestamp(),
            timezone.now().timestamp(),
            delta=5,
        )

    def test_create_task_without_reminder_offset(self):
        """Creating a task with due_at but no reminder leaves reminder_at and reminder_sent_at None."""
        future_due = timezone.now() + timedelta(days=1)
        task = Task(
            column=self.column,
            title="No Reminder Task",
        )
        task.set_due_date_and_reminder(future_due, reminder_offset_seconds=None)
        task.save()
        self.assertIsNone(task.reminder_at)
        self.assertIsNone(task.reminder_sent_at)

    def test_extending_due_at_resets_reminder_sent_at(self):
        """Extending a task's due date into the future resets reminder_sent_at to None."""
        initial_due = timezone.now() + timedelta(hours=1)
        task = Task(
            column=self.column,
            title="Extend Task",
        )
        task.set_due_date_and_reminder(initial_due, reminder_offset_seconds=7200)
        task.save()
        self.assertIsNotNone(task.reminder_sent_at)

        # Extend due date by 3 days
        extended_due = timezone.now() + timedelta(days=3)
        task.set_due_date_and_reminder(extended_due, reminder_offset_seconds=7200)
        task.save()

        self.assertEqual(task.reminder_at, extended_due - timedelta(seconds=7200))
        self.assertIsNone(task.reminder_sent_at)

    def test_disabling_reminder_clears_reminder_fields(self):
        """Setting reminder_offset_seconds to None clears reminder_at and reminder_sent_at."""
        future_due = timezone.now() + timedelta(days=2)
        task = Task(
            column=self.column,
            title="Toggle Reminder Off",
        )
        task.set_due_date_and_reminder(future_due, reminder_offset_seconds=3600)
        task.save()
        self.assertIsNotNone(task.reminder_at)

        task.set_due_date_and_reminder(task.due_at, reminder_offset_seconds=None)
        task.save()

        self.assertIsNone(task.reminder_at)
        self.assertIsNone(task.reminder_sent_at)

    def test_clearing_due_date_clears_reminder(self):
        """Clearing due_at to None clears reminder_offset_seconds, reminder_at, and reminder_sent_at."""
        future_due = timezone.now() + timedelta(days=2)
        task = Task(
            column=self.column,
            title="Clear Due Date",
        )
        task.set_due_date_and_reminder(future_due, reminder_offset_seconds=3600)
        task.save()

        task.set_due_date_and_reminder(None)
        task.save()

        self.assertIsNone(task.due_at)
        self.assertIsNone(task.reminder_offset_seconds)
        self.assertIsNone(task.reminder_at)
        self.assertIsNone(task.reminder_sent_at)

    def test_updating_unrelated_field_preserves_reminder_sent_at(self):
        """Updating title or description does not clobber reminder_sent_at or recalculate reminder_at."""
        past_due = timezone.now() - timedelta(hours=1)
        task = Task(
            column=self.column,
            title="Initial Title",
        )
        task.set_due_date_and_reminder(past_due, reminder_offset_seconds=0)
        task.save()
        original_sent_at = task.reminder_sent_at
        self.assertIsNotNone(original_sent_at)

        task.title = "Updated Title"
        task.save()

        self.assertEqual(task.reminder_sent_at, original_sent_at)


class TaskDueDateApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="tester@example.com",
            password=PASSWORD,
            display_name="API Tester",
        )
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": "tester@example.com", "password": PASSWORD}),
            content_type="application/json",
        )
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

        board_res = self.client.post(
            "/api/kanban/boards",
            data=json.dumps({"title": "API Board", "description": ""}),
            content_type="application/json",
            **self.auth,
        )
        self.board_id = board_res.json()["id"]
        self.column_id = board_res.json()["columns"][0]["id"]

    def test_create_task_with_due_date_and_reminder(self):
        """POST /columns/{id}/tasks accepts due_at and reminder_offset_seconds and returns them."""
        due_str = (timezone.now() + timedelta(days=2)).isoformat()
        payload = {
            "title": "API Task With Due Date",
            "due_at": due_str,
            "reminder_offset_seconds": 3600,
        }
        res = self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps(payload),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIsNotNone(data["due_at"])
        self.assertEqual(data["reminder_offset_seconds"], 3600)

        task = Task.objects.get(id=data["id"])
        self.assertIsNotNone(task.due_at)
        self.assertEqual(task.reminder_offset_seconds, 3600)
        self.assertIsNotNone(task.reminder_at)

    def test_update_task_due_date_and_reminder(self):
        """PATCH /tasks/{id} updates due_at and reminder_offset_seconds."""
        create_res = self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({"title": "Initial Task"}),
            content_type="application/json",
            **self.auth,
        )
        task_id = create_res.json()["id"]

        new_due_str = (timezone.now() + timedelta(days=4)).isoformat()
        patch_payload = {
            "due_at": new_due_str,
            "reminder_offset_seconds": 7200,
        }
        res = self.client.patch(
            f"/api/kanban/tasks/{task_id}",
            data=json.dumps(patch_payload),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIsNotNone(data["due_at"])
        self.assertEqual(data["reminder_offset_seconds"], 7200)

        task = Task.objects.get(id=task_id)
        self.assertEqual(task.reminder_offset_seconds, 7200)
        self.assertIsNotNone(task.reminder_at)

    def test_update_task_clears_due_date(self):
        """PATCH /tasks/{id} with due_at=None clears due_at and reminder."""
        initial_due = (timezone.now() + timedelta(days=1)).isoformat()
        create_res = self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({
                "title": "Task To Clear",
                "due_at": initial_due,
                "reminder_offset_seconds": 900,
            }),
            content_type="application/json",
            **self.auth,
        )
        task_id = create_res.json()["id"]

        res = self.client.patch(
            f"/api/kanban/tasks/{task_id}",
            data=json.dumps({"due_at": None, "reminder_offset_seconds": None}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIsNone(data["due_at"])
        self.assertIsNone(data["reminder_offset_seconds"])

        task = Task.objects.get(id=task_id)
        self.assertIsNone(task.due_at)
        self.assertIsNone(task.reminder_offset_seconds)
        self.assertIsNone(task.reminder_at)

    @patch("kanban.api.publish_event_on_commit")
    def test_update_task_emits_task_updated_event(self, mock_publish):
        """Updating due date publishes BoardEventType.TASK_UPDATED with due date fields."""
        create_res = self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({"title": "Event Task"}),
            content_type="application/json",
            **self.auth,
        )
        task_id = create_res.json()["id"]
        mock_publish.reset_mock()

        new_due_str = (timezone.now() + timedelta(days=5)).isoformat()
        self.client.patch(
            f"/api/kanban/tasks/{task_id}",
            data=json.dumps({"due_at": new_due_str, "reminder_offset_seconds": 1800}),
            content_type="application/json",
            **self.auth,
        )

        mock_publish.assert_called_once()
        _, kwargs = mock_publish.call_args
        self.assertEqual(kwargs["event_type"], BoardEventType.TASK_UPDATED)
        task_data = kwargs["data"]["task"]
        self.assertIsNotNone(task_data["due_at"])
        self.assertEqual(task_data["reminder_offset_seconds"], 1800)

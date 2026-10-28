"""Tests for task priority API handling, schema serialization, and nullability."""

import json
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from kanban.models import Board, BoardColumn, Task, TaskPriority

User = get_user_model()

PASSWORD = "TestPassword123!"


class TaskPriorityApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="tester@example.com",
            password=PASSWORD,
            display_name="Task Tester",
        )
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": "tester@example.com", "password": PASSWORD}),
            content_type="application/json",
        )
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

        # Create a board and retrieve its first column
        board_res = self.client.post(
            "/api/kanban/boards",
            data=json.dumps({"title": "Test Board", "description": ""}),
            content_type="application/json",
            **self.auth,
        )
        self.board_id = board_res.json()["id"]
        self.column_id = board_res.json()["columns"][0]["id"]

    def test_create_task_without_priority_defaults_to_none(self):
        """Creating a task without specifying priority defaults priority to None/null."""
        response = self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({"title": "No Priority Task"}),
            content_type="application/json",
            **self.auth,
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsNone(data["priority"])

        task = Task.objects.get(id=data["id"])
        self.assertIsNone(task.priority)

    def test_create_task_with_explicit_priority(self):
        """Creating a task with explicit priority persists and returns that priority."""
        response = self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({"title": "High Priority Task", "priority": "HIGH"}),
            content_type="application/json",
            **self.auth,
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["priority"], "HIGH")

        task = Task.objects.get(id=data["id"])
        self.assertEqual(task.priority, "HIGH")

    def test_board_endpoint_serializes_null_and_set_priority(self):
        """Board retrieval endpoint returns tasks with both null and assigned priority."""
        self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({"title": "Unset Priority"}),
            content_type="application/json",
            **self.auth,
        )
        self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({"title": "Low Priority", "priority": "LOW"}),
            content_type="application/json",
            **self.auth,
        )

        board_res = self.client.get(f"/api/kanban/boards/{self.board_id}", **self.auth)
        self.assertEqual(board_res.status_code, 200)
        columns = board_res.json()["columns"]
        first_column = next(c for c in columns if c["id"] == self.column_id)
        priorities = [t["priority"] for t in first_column["tasks"]]
        self.assertEqual(priorities, [None, "LOW"])

    def test_update_task_clears_priority_to_null(self):
        """PATCHing a task with priority=null explicitly sets priority to None."""
        create_res = self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({"title": "Priority Task", "priority": "HIGH"}),
            content_type="application/json",
            **self.auth,
        )
        task_id = create_res.json()["id"]

        patch_res = self.client.patch(
            f"/api/kanban/tasks/{task_id}",
            data=json.dumps({"priority": None}),
            content_type="application/json",
            **self.auth,
        )

        self.assertEqual(patch_res.status_code, 200)
        data = patch_res.json()
        self.assertIsNone(data["priority"])

        task = Task.objects.get(id=task_id)
        self.assertIsNone(task.priority)

    def test_update_task_sets_priority_from_none(self):
        """PATCHing a task without priority to a set priority updates it correctly."""
        create_res = self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({"title": "Task without Priority"}),
            content_type="application/json",
            **self.auth,
        )
        task_id = create_res.json()["id"]

        patch_res = self.client.patch(
            f"/api/kanban/tasks/{task_id}",
            data=json.dumps({"priority": "MEDIUM"}),
            content_type="application/json",
            **self.auth,
        )

        self.assertEqual(patch_res.status_code, 200)
        data = patch_res.json()
        self.assertEqual(data["priority"], "MEDIUM")

        task = Task.objects.get(id=task_id)
        self.assertEqual(task.priority, "MEDIUM")

    def test_update_task_unrelated_field_preserves_priority(self):
        """PATCHing unrelated fields does not clobber existing priority."""
        create_res = self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({"title": "Original Title", "priority": "LOW"}),
            content_type="application/json",
            **self.auth,
        )
        task_id = create_res.json()["id"]

        patch_res = self.client.patch(
            f"/api/kanban/tasks/{task_id}",
            data=json.dumps({"title": "Updated Title"}),
            content_type="application/json",
            **self.auth,
        )

        self.assertEqual(patch_res.status_code, 200)
        data = patch_res.json()
        self.assertEqual(data["title"], "Updated Title")
        self.assertEqual(data["priority"], "LOW")

        task = Task.objects.get(id=task_id)
        self.assertEqual(task.priority, "LOW")

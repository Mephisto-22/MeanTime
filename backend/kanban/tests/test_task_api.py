"""Tests for task priority API handling, schema serialization, and nullability."""

import json
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from kanban.models import Board, BoardColumn, Task, Tag, TaskPriority

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

    def create_task(self, title: str, priority=None):
        payload = {"title": title}
        if priority is not None:
            payload["priority"] = priority
        return self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps(payload),
            content_type="application/json",
            **self.auth,
        )

    def test_create_task_without_priority_defaults_to_none(self):
        """Creating a task without specifying priority defaults priority to None/null."""
        response = self.create_task("No Priority Task")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsNone(data["priority"])

        task = Task.objects.get(id=data["id"])
        self.assertIsNone(task.priority)

    def test_create_task_with_explicit_priority(self):
        """Creating a task with explicit priority persists and returns that priority."""
        response = self.create_task("High Priority Task", priority="HIGH")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["priority"], "HIGH")

        task = Task.objects.get(id=data["id"])
        self.assertEqual(task.priority, "HIGH")

    def test_board_endpoint_serializes_null_and_set_priority(self):
        """Board retrieval endpoint returns tasks with both null and assigned priority."""
        self.create_task("Unset Priority")
        self.create_task("Low Priority", priority="LOW")

        board_res = self.client.get(f"/api/kanban/boards/{self.board_id}", **self.auth)
        self.assertEqual(board_res.status_code, 200)
        columns = board_res.json()["columns"]
        first_column = next(c for c in columns if c["id"] == self.column_id)
        priorities = [t["priority"] for t in first_column["tasks"]]
        self.assertEqual(priorities, [None, "LOW"])

    def test_update_task_clears_priority_to_null(self):
        """PATCHing a task with priority=null explicitly sets priority to None."""
        create_res = self.create_task("Priority Task", priority="HIGH")
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
        create_res = self.create_task("Task without Priority")
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
        create_res = self.create_task("Original Title", priority="LOW")
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


class TaskTagSharingApiTests(TestCase):
    """Tests for using board members' tags on shared tasks."""

    def setUp(self):
        self.client = Client()

        self.owner = User.objects.create_user(
            email="owner@example.com",
            password=PASSWORD,
            display_name="Board Owner",
        )
        self.collaborator = User.objects.create_user(
            email="collaborator@example.com",
            password=PASSWORD,
            display_name="Collaborator",
        )
        self.other_collaborator = User.objects.create_user(
            email="other-collaborator@example.com",
            password=PASSWORD,
            display_name="Other Collaborator",
        )
        self.outsider = User.objects.create_user(
            email="outsider@example.com",
            password=PASSWORD,
            display_name="Outsider",
        )

        self.board = Board.objects.create(
            owner=self.owner,
            title="Shared Board",
        )
        self.board.collaborators.add(
            self.collaborator,
            self.other_collaborator,
        )

        self.column = BoardColumn.objects.create(
            board=self.board,
            title="To Do",
        )
        self.task = Task.objects.create(
            column=self.column,
            title="Original Task",
        )

        self.owner_tag = Tag.objects.create(
            user=self.owner,
            name="Owner Tag",
        )
        self.collaborator_tag = Tag.objects.create(
            user=self.other_collaborator,
            name="Collaborator Tag",
        )
        self.outsider_tag = Tag.objects.create(
            user=self.outsider,
            name="Outsider Tag",
        )

    def auth_headers(self, email):
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({
                "email": email,
                "password": PASSWORD,
            }),
            content_type="application/json",
        )
        return {
            "HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"
        }

    def update_task(self, payload, **auth):
        return self.client.patch(
            f"/api/kanban/tasks/{self.task.id}",
            data=json.dumps(payload),
            content_type="application/json",
            **auth,
        )

    def test_collaborator_can_update_task_with_owner_owned_tag(self):
        """A collaborator can update a task while retaining the owner's tag."""
        self.task.tags.add(self.owner_tag)

        response = self.update_task(
            {
                "title": "Updated by Collaborator",
                "tag_ids": [self.owner_tag.id],
            },
            **self.auth_headers("collaborator@example.com"),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "Updated by Collaborator")
        self.assertEqual(
            list(self.task.tags.values_list("id", flat=True)),
            [self.owner_tag.id],
        )

    def test_collaborator_can_attach_another_collaborators_tag(self):
        """A collaborator can attach a tag owned by another board collaborator."""
        response = self.update_task(
            {"tag_ids": [self.collaborator_tag.id]},
            **self.auth_headers("collaborator@example.com"),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            list(self.task.tags.values_list("id", flat=True)),
            [self.collaborator_tag.id],
        )

        # Attaching the tag does not transfer ownership.
        self.collaborator_tag.refresh_from_db()
        self.assertEqual(self.collaborator_tag.user_id, self.other_collaborator.id)

    def test_collaborator_cannot_attach_outsiders_tag(self):
        """Tags belonging to users outside the board are rejected."""
        response = self.update_task(
            {"tag_ids": [self.outsider_tag.id]},
            **self.auth_headers("collaborator@example.com"),
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.task.tags.exists())

    def test_duplicate_tag_ids_are_rejected(self):
        """Submitting the same tag ID more than once returns a validation error."""
        response = self.update_task(
            {"tag_ids": [self.owner_tag.id, self.owner_tag.id]},
            **self.auth_headers("collaborator@example.com"),
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.task.tags.exists())

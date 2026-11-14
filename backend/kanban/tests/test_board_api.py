"""Tests for creating and deleting boards through the kanban API."""

import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from kanban.models import Board, BoardColumn, Task

User = get_user_model()

PASSWORD = "BoardPassword123!"


class CreateBoardTests(TestCase):
    """POST /api/kanban/boards."""

    def setUp(self):
        self.client = Client()
        User.objects.create_user(
            email="boards@example.com",
            password=PASSWORD,
            display_name="Board Owner",
        )
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": "boards@example.com", "password": PASSWORD}),
            content_type="application/json",
        )
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

    def create_board(self, title="School"):
        return self.client.post(
            "/api/kanban/boards",
            data=json.dumps({"title": title, "description": ""}),
            content_type="application/json",
            **self.auth,
        )

    def test_new_board_starts_with_default_columns(self):
        """A new board comes back with To Do, In Progress and Done, in order."""
        response = self.create_board()

        self.assertEqual(response.status_code, 201)
        columns = response.json()["columns"]
        self.assertEqual(
            [(c["title"], c["position"]) for c in columns],
            [("To Do", 0), ("In Progress", 1), ("Done", 2)],
        )
        self.assertTrue(all(c["tasks"] == [] for c in columns))

    def test_default_columns_are_saved(self):
        """The default columns are stored, not just returned."""
        board_id = self.create_board().json()["id"]

        titles = list(
            BoardColumn.objects.filter(board_id=board_id)
            .order_by("position")
            .values_list("title", flat=True)
        )
        self.assertEqual(titles, ["To Do", "In Progress", "Done"])

    def test_each_board_gets_its_own_columns(self):
        """Two boards never share column rows."""
        first = self.create_board("First").json()
        second = self.create_board("Second").json()

        first_ids = {c["id"] for c in first["columns"]}
        second_ids = {c["id"] for c in second["columns"]}
        self.assertEqual(len(first_ids), 3)
        self.assertEqual(len(second_ids), 3)
        self.assertFalse(first_ids & second_ids)
        self.assertEqual(Board.objects.count(), 2)

    def test_creating_a_board_requires_login(self):
        """Without a token, nothing is created."""
        response = self.client.post(
            "/api/kanban/boards",
            data=json.dumps({"title": "Nope", "description": ""}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertFalse(Board.objects.exists())


class DeleteBoardTests(TestCase):
    """DELETE /api/kanban/boards/{id}."""

    def setUp(self):
        self.client = Client()
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password=PASSWORD,
            display_name="Board Owner",
        )
        User.objects.create_user(
            email="other@example.com",
            password=PASSWORD,
            display_name="Someone Else",
        )
        self.board = Board.objects.create(owner=self.owner, title="School")
        column = BoardColumn.objects.create(board=self.board, title="To Do")
        Task.objects.create(column=column, title="Essay")

    def auth_for(self, email):
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": email, "password": PASSWORD}),
            content_type="application/json",
        )
        return {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

    def delete_board(self, **auth):
        return self.client.delete(f"/api/kanban/boards/{self.board.id}", **auth)

    def test_owner_deletes_board_with_its_columns_and_tasks(self):
        """Deleting a board removes everything on it."""
        response = self.delete_board(**self.auth_for("owner@example.com"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"success": True})
        self.assertFalse(Board.objects.exists())
        self.assertFalse(BoardColumn.objects.exists())
        self.assertFalse(Task.objects.exists())

    def test_other_users_cannot_delete_the_board(self):
        """Someone else's board looks like it doesn't exist, and stays."""
        response = self.delete_board(**self.auth_for("other@example.com"))

        self.assertEqual(response.status_code, 404)
        self.assertTrue(Board.objects.filter(id=self.board.id).exists())
        self.assertEqual(Task.objects.count(), 1)

    def test_deleting_a_board_requires_login(self):
        """Without a token, nothing is deleted."""
        response = self.delete_board()

        self.assertEqual(response.status_code, 401)
        self.assertTrue(Board.objects.filter(id=self.board.id).exists())


class ColumnAutoClearTests(TestCase):
    """Column auto-clear policy configuration via API."""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="colowner@example.com",
            password=PASSWORD,
            display_name="Column Owner",
        )
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": "colowner@example.com", "password": PASSWORD}),
            content_type="application/json",
        )
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}
        board_res = self.client.post(
            "/api/kanban/boards",
            data=json.dumps({"title": "Auto-Clear Board", "description": ""}),
            content_type="application/json",
            **self.auth,
        )
        self.board = board_res.json()
        self.column = self.board["columns"][0]

    def test_column_default_auto_clear_duration_is_null(self):
        """New columns default to auto_clear_duration_seconds = None."""
        self.assertIsNone(self.column.get("auto_clear_duration_seconds"))

    def test_create_column_with_auto_clear_duration(self):
        """Can create a column with an explicit auto_clear_duration_seconds."""
        response = self.client.post(
            f"/api/kanban/boards/{self.board['id']}/columns",
            data=json.dumps({
                "title": "Review",
                "auto_clear_duration_seconds": 259200,
            }),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["auto_clear_duration_seconds"], 259200)

        # Check DB persistence
        col_db = BoardColumn.objects.get(id=data["id"])
        self.assertEqual(col_db.auto_clear_duration_seconds, 259200)

    def test_update_column_auto_clear_duration(self):
        """PATCH column can configure auto_clear_duration_seconds."""
        response = self.client.patch(
            f"/api/kanban/columns/{self.column['id']}",
            data=json.dumps({"auto_clear_duration_seconds": 604800}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["auto_clear_duration_seconds"], 604800)

        col_db = BoardColumn.objects.get(id=self.column["id"])
        self.assertEqual(col_db.auto_clear_duration_seconds, 604800)

    def test_clear_auto_clear_duration_with_null(self):
        """PATCH column with auto_clear_duration_seconds = null disables auto-clear."""
        # First set it
        col = BoardColumn.objects.get(id=self.column["id"])
        col.auto_clear_duration_seconds = 604800
        col.save()

        response = self.client.patch(
            f"/api/kanban/columns/{self.column['id']}",
            data=json.dumps({"auto_clear_duration_seconds": None}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["auto_clear_duration_seconds"])

        col.refresh_from_db()
        self.assertIsNone(col.auto_clear_duration_seconds)

    def test_clear_auto_clear_duration_with_zero(self):
        """PATCH column with auto_clear_duration_seconds = 0 disables auto-clear (persists as null)."""
        col = BoardColumn.objects.get(id=self.column["id"])
        col.auto_clear_duration_seconds = 604800
        col.save()

        response = self.client.patch(
            f"/api/kanban/columns/{self.column['id']}",
            data=json.dumps({"auto_clear_duration_seconds": 0}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["auto_clear_duration_seconds"])

        col.refresh_from_db()
        self.assertIsNone(col.auto_clear_duration_seconds)

    def test_boundary_validation_negative_auto_clear_duration(self):
        """PATCH or POST with negative auto_clear_duration_seconds fails boundary validation."""
        response = self.client.patch(
            f"/api/kanban/columns/{self.column['id']}",
            data=json.dumps({"auto_clear_duration_seconds": -50}),
            content_type="application/json",
            **self.auth,
        )
        self.assertIn(response.status_code, [400, 422])

    def test_board_view_includes_column_auto_clear_duration(self):
        """GET /api/kanban/boards/{id} includes auto_clear_duration_seconds for columns."""
        col = BoardColumn.objects.get(id=self.column["id"])
        col.auto_clear_duration_seconds = 1209600
        col.save()

        response = self.client.get(
            f"/api/kanban/boards/{self.board['id']}",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        col_data = next(c for c in response.json()["columns"] if c["id"] == self.column["id"])
        self.assertEqual(col_data["auto_clear_duration_seconds"], 1209600)

    def test_update_column_does_not_return_archived_tasks(self):
        """PATCH column only serializes active tasks, excluding archived ones."""
        col = BoardColumn.objects.get(id=self.column["id"])
        active_task = Task.objects.create(column=col, title="Active Task", position=0)
        archived_task = Task.objects.create(
            column=col,
            title="Archived Task",
            position=None,
            archived_at=timezone.now(),
        )

        response = self.client.patch(
            f"/api/kanban/columns/{col.id}",
            data=json.dumps({"auto_clear_duration_seconds": 86400}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(response.status_code, 200)
        returned_task_ids = [t["id"] for t in response.json()["tasks"]]
        self.assertIn(active_task.id, returned_task_ids)
        self.assertNotIn(archived_task.id, returned_task_ids)



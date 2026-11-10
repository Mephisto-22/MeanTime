import json
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from kanban.models import Board, BoardColumn, Task, TaskTimeEntry

User = get_user_model()
PASSWORD = "TestPassword123!"


class TaskTimeEntryApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="chronicle_tester@example.com",
            password=PASSWORD,
            display_name="Chronicle Tester",
        )
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": "chronicle_tester@example.com", "password": PASSWORD}),
            content_type="application/json",
        )
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

        # Board & Column & Task
        board_res = self.client.post(
            "/api/kanban/boards",
            data=json.dumps({"title": "Chronicle Test Board", "description": ""}),
            content_type="application/json",
            **self.auth,
        )
        self.board_id = board_res.json()["id"]
        self.column_id = board_res.json()["columns"][0]["id"]

        task_res = self.client.post(
            f"/api/kanban/columns/{self.column_id}/tasks",
            data=json.dumps({"title": "Chronicle Task"}),
            content_type="application/json",
            **self.auth,
        )
        self.task_id = task_res.json()["id"]

    def test_create_and_list_time_entries(self):
        """POST /tasks/{id}/time-entries creates manual entry and GET returns list."""
        now = timezone.now()
        start = (now - timedelta(hours=1)).isoformat()
        end = now.isoformat()

        post_res = self.client.post(
            f"/api/kanban/tasks/{self.task_id}/time-entries",
            data=json.dumps({
                "started_at": start,
                "ended_at": end,
                "duration_seconds": 3600,
                "note": "Manual focus block",
            }),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(post_res.status_code, 201)
        data = post_res.json()
        self.assertEqual(data["duration_seconds"], 3600)
        self.assertEqual(data["note"], "Manual focus block")
        self.assertEqual(data["task_id"], self.task_id)
        self.assertEqual(data["user_id"], self.user.id)
        self.assertIsNotNone(data.get("user"))
        self.assertEqual(data["user"]["id"], self.user.id)
        self.assertEqual(data["user"]["display_name"], "Chronicle Tester")

        # GET /tasks/{id}/time-entries
        get_res = self.client.get(f"/api/kanban/tasks/{self.task_id}/time-entries", **self.auth)
        self.assertEqual(get_res.status_code, 200)
        entries = get_res.json()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["id"], data["id"])
        self.assertIsNotNone(entries[0].get("user"))
        self.assertEqual(entries[0]["user"]["id"], self.user.id)

    def test_time_entry_response_serializes_nested_user_profile(self):
        """GET /tasks/{id}/time-entries returns nested UserOut profile metadata for user."""
        entry_with_user = TaskTimeEntry.objects.create(
            task_id=self.task_id,
            user=self.user,
            started_at=timezone.now() - timedelta(minutes=30),
            ended_at=timezone.now(),
            duration_seconds=1800,
            note="With user",
        )
        entry_without_user = TaskTimeEntry.objects.create(
            task_id=self.task_id,
            user=None,
            started_at=timezone.now() - timedelta(minutes=60),
            ended_at=timezone.now() - timedelta(minutes=30),
            duration_seconds=1800,
            note="Without user",
        )

        res = self.client.get(f"/api/kanban/tasks/{self.task_id}/time-entries", **self.auth)
        self.assertEqual(res.status_code, 200)
        entries_by_id = {e["id"]: e for e in res.json()}

        self.assertIn(entry_with_user.id, entries_by_id)
        user_data = entries_by_id[entry_with_user.id]["user"]
        self.assertIsNotNone(user_data)
        self.assertEqual(user_data["id"], self.user.id)
        self.assertEqual(user_data["display_name"], self.user.display_name)
        self.assertEqual(user_data["email"], self.user.email)

        self.assertIn(entry_without_user.id, entries_by_id)
        self.assertIsNone(entries_by_id[entry_without_user.id]["user"])
        self.assertIsNone(entries_by_id[entry_without_user.id]["user_id"])

    def test_patch_time_entry_duration_preserves_end_and_enforces_lte_span(self):
        """PATCHing duration_seconds preserves ended_at and enforces duration <= ended_at - started_at."""
        now = timezone.now()
        start = now - timedelta(minutes=60)
        entry = TaskTimeEntry.objects.create(
            task_id=self.task_id,
            user=self.user,
            started_at=start,
            ended_at=now,
            duration_seconds=1800,
            note="Original note",
        )

        # Update duration to 2700 (<= 3600), ended_at should NOT be shifted
        patch_res = self.client.patch(
            f"/api/kanban/time-entries/{entry.id}",
            data=json.dumps({"duration_seconds": 2700, "note": "Updated note"}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(patch_res.status_code, 200)
        data = patch_res.json()
        self.assertEqual(data["duration_seconds"], 2700)
        self.assertEqual(data["note"], "Updated note")

        entry.refresh_from_db()
        self.assertEqual(entry.duration_seconds, 2700)
        self.assertEqual(entry.ended_at, now)

        # Attempt to set duration > span (e.g. 4000s > 3600s) should fail with 400
        invalid_res = self.client.patch(
            f"/api/kanban/time-entries/{entry.id}",
            data=json.dumps({"duration_seconds": 4000}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(invalid_res.status_code, 400)

    def test_patch_time_entry_timestamps_preserves_existing_duration(self):
        """PATCHing timestamps preserves duration_seconds as long as duration <= span."""
        now = timezone.now()
        entry = TaskTimeEntry.objects.create(
            task_id=self.task_id,
            user=self.user,
            started_at=now - timedelta(minutes=15),
            ended_at=now,
            duration_seconds=900,
        )

        new_start = (now - timedelta(minutes=45)).isoformat()
        new_end = now.isoformat()

        # Expanding span to 45 mins should preserve 15 min duration
        patch_res = self.client.patch(
            f"/api/kanban/time-entries/{entry.id}",
            data=json.dumps({"started_at": new_start, "ended_at": new_end}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(patch_res.status_code, 200)
        data = patch_res.json()
        self.assertEqual(data["duration_seconds"], 900)

        entry.refresh_from_db()
        self.assertEqual(entry.duration_seconds, 900)

    def test_delete_time_entry(self):
        """DELETE /time-entries/{id} removes entry from database."""
        now = timezone.now()
        entry = TaskTimeEntry.objects.create(
            task_id=self.task_id,
            user=self.user,
            started_at=now - timedelta(minutes=20),
            ended_at=now,
            duration_seconds=1200,
        )

        del_res = self.client.delete(f"/api/kanban/time-entries/{entry.id}", **self.auth)
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.json()["success"])
        self.assertFalse(TaskTimeEntry.objects.filter(id=entry.id).exists())

    def test_time_entry_ownership_security(self):
        """Another user cannot access or delete another user's time entries."""
        now = timezone.now()
        entry = TaskTimeEntry.objects.create(
            task_id=self.task_id,
            user=self.user,
            started_at=now - timedelta(minutes=20),
            ended_at=now,
            duration_seconds=1200,
        )

        other_user = User.objects.create_user(
            email="other_chronicle@example.com",
            password=PASSWORD,
            display_name="Other User",
        )
        login = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": "other_chronicle@example.com", "password": PASSWORD}),
            content_type="application/json",
        )
        other_auth = {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

        # GET forbidden / 404
        get_res = self.client.get(f"/api/kanban/tasks/{self.task_id}/time-entries", **other_auth)
        self.assertEqual(get_res.status_code, 404)

        # PATCH forbidden / 404
        patch_res = self.client.patch(
            f"/api/kanban/time-entries/{entry.id}",
            data=json.dumps({"note": "Hacked"}),
            content_type="application/json",
            **other_auth,
        )
        self.assertEqual(patch_res.status_code, 404)

        # DELETE forbidden / 404
        del_res = self.client.delete(f"/api/kanban/time-entries/{entry.id}", **other_auth)
        self.assertEqual(del_res.status_code, 404)
        self.assertTrue(TaskTimeEntry.objects.filter(id=entry.id).exists())

    def test_create_time_entry_with_valid_and_invalid_user_id(self):
        """POST /tasks/{id}/time-entries accepts board member user_id and rejects non-member user_id."""
        collaborator = User.objects.create_user(
            email="collab_chronicle@example.com",
            password=PASSWORD,
            display_name="Collab User",
        )
        non_member = User.objects.create_user(
            email="stranger@example.com",
            password=PASSWORD,
            display_name="Stranger",
        )

        # Add collaborator to board
        board = Board.objects.get(id=self.board_id)
        board.collaborators.add(collaborator)

        now = timezone.now()
        start = (now - timedelta(minutes=45)).isoformat()
        end = now.isoformat()

        # 1. Valid collaborator user_id -> 201 Created
        valid_res = self.client.post(
            f"/api/kanban/tasks/{self.task_id}/time-entries",
            data=json.dumps({
                "started_at": start,
                "ended_at": end,
                "duration_seconds": 2700,
                "note": "Logged on behalf of collaborator",
                "user_id": collaborator.id,
            }),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(valid_res.status_code, 201)
        data = valid_res.json()
        self.assertEqual(data["user_id"], collaborator.id)
        self.assertEqual(data["user"]["id"], collaborator.id)
        self.assertEqual(data["user"]["display_name"], "Collab User")

        # 2. Invalid non-member user_id -> 400 Bad Request
        invalid_res = self.client.post(
            f"/api/kanban/tasks/{self.task_id}/time-entries",
            data=json.dumps({
                "started_at": start,
                "ended_at": end,
                "duration_seconds": 2700,
                "note": "Attributed to stranger",
                "user_id": non_member.id,
            }),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(invalid_res.status_code, 400)

        # 3. Omitted user_id -> defaults to authenticated user
        omitted_res = self.client.post(
            f"/api/kanban/tasks/{self.task_id}/time-entries",
            data=json.dumps({
                "started_at": start,
                "ended_at": end,
                "duration_seconds": 2700,
                "note": "Self logged work",
            }),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(omitted_res.status_code, 201)
        omitted_data = omitted_res.json()
        self.assertEqual(omitted_data["user_id"], self.user.id)
        self.assertEqual(omitted_data["user"]["id"], self.user.id)

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

        # GET /tasks/{id}/time-entries
        get_res = self.client.get(f"/api/kanban/tasks/{self.task_id}/time-entries", **self.auth)
        self.assertEqual(get_res.status_code, 200)
        entries = get_res.json()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["id"], data["id"])

    def test_patch_time_entry_duration_recalculates_end(self):
        """PATCHing duration_seconds recalculates ended_at = started_at + duration."""
        now = timezone.now()
        start = now - timedelta(minutes=30)
        entry = TaskTimeEntry.objects.create(
            task_id=self.task_id,
            user=self.user,
            started_at=start,
            ended_at=now,
            duration_seconds=1800,
            note="Original note",
        )

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
        self.assertEqual(entry.note, "Updated note")
        # ended_at was shifted by 45 minutes from start
        self.assertEqual(int((entry.ended_at - entry.started_at).total_seconds()), 2700)

    def test_patch_time_entry_timestamps_recalculates_duration(self):
        """PATCHing timestamps recalculates duration_seconds = ended_at - started_at."""
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

        patch_res = self.client.patch(
            f"/api/kanban/time-entries/{entry.id}",
            data=json.dumps({"started_at": new_start, "ended_at": new_end}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(patch_res.status_code, 200)
        data = patch_res.json()
        self.assertEqual(data["duration_seconds"], 2700)

        entry.refresh_from_db()
        self.assertEqual(entry.duration_seconds, 2700)

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

"""Tests for board sharing, collaboration schemas, and permissions."""
import json
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from kanban.models import Board, BoardColumn, Task
from users.models import Friendship, FriendshipStatus, UserBlock

User = get_user_model()
PASSWORD = "TestPassword123!"

class BoardSharingApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.owner = User.objects.create_user(email="owner@example.com", password=PASSWORD, display_name="Owner")
        self.friend = User.objects.create_user(email="friend@example.com", password=PASSWORD, display_name="Friend")
        self.stranger = User.objects.create_user(email="stranger@example.com", password=PASSWORD, display_name="Stranger")
        Friendship.objects.create(requester=self.owner, receiver=self.friend, status=FriendshipStatus.ACCEPTED)
        self.board = Board.objects.create(owner=self.owner, title="Project X")
        self.col = BoardColumn.objects.create(board=self.board, title="To Do")
        self.task = Task.objects.create(column=self.col, title="Task 1")

    def auth_headers(self, email):
        login = self.client.post("/api/auth/login", data=json.dumps({"email": email, "password": PASSWORD}), content_type="application/json")
        return {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

    def test_board_serialization_includes_owner_and_collaborators(self):
        res = self.client.get(f"/api/kanban/boards/{self.board.id}", **self.auth_headers("owner@example.com"))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["owner"]["id"], self.owner.id)
        self.assertEqual(data["collaborators"], [])

    def test_owner_shares_board_with_friend(self):
        res = self.client.post(
            f"/api/kanban/boards/{self.board.id}/collaborators",
            data=json.dumps({"friend_id": self.friend.id}),
            content_type="application/json",
            **self.auth_headers("owner@example.com"),
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(self.board.collaborators.filter(id=self.friend.id).exists())

        # Check serialization includes collaborator
        get_res = self.client.get(f"/api/kanban/boards/{self.board.id}", **self.auth_headers("owner@example.com"))
        self.assertEqual(len(get_res.json()["collaborators"]), 1)
        self.assertEqual(get_res.json()["collaborators"][0]["id"], self.friend.id)

    def test_collaborator_can_leave_board(self):
        self.board.collaborators.add(self.friend)
        res = self.client.delete(
            f"/api/kanban/boards/{self.board.id}/collaborators/{self.friend.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(self.board.collaborators.filter(id=self.friend.id).exists())

    def test_collaborator_cannot_remove_other_collaborators(self):
        other = User.objects.create_user(email="other@example.com", password=PASSWORD, display_name="Other")
        self.board.collaborators.add(self.friend, other)
        res = self.client.delete(
            f"/api/kanban/boards/{self.board.id}/collaborators/{other.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(res.status_code, 403)

    def test_collaborator_cannot_invite_friends(self):
        self.board.collaborators.add(self.friend)
        res = self.client.post(
            f"/api/kanban/boards/{self.board.id}/collaborators",
            data=json.dumps({"friend_id": self.stranger.id}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(res.status_code, 404)

    def test_blocked_user_loses_board_access(self):
        self.board.collaborators.add(self.friend)
        UserBlock.objects.create(blocker=self.owner, blocked=self.friend)
        res = self.client.get(f"/api/kanban/boards/{self.board.id}", **self.auth_headers("friend@example.com"))
        self.assertEqual(res.status_code, 404)

    def test_collaborator_can_access_timers_and_time_entries(self):
        self.board.collaborators.add(self.friend)
        # list time entries
        res = self.client.get(f"/api/kanban/tasks/{self.task.id}/time-entries", **self.auth_headers("friend@example.com"))
        self.assertEqual(res.status_code, 200)
        # create time entry
        entry_res = self.client.post(
            f"/api/kanban/tasks/{self.task.id}/time-entries",
            data=json.dumps({"started_at": "2026-11-02T10:00:00Z", "duration_seconds": 60, "note": "Collaborator work"}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(entry_res.status_code, 201)
        self.assertEqual(entry_res.json()["user_id"], self.friend.id)

    def test_collaborator_can_update_and_delete_own_time_entry(self):
        self.board.collaborators.add(self.friend)
        from kanban.models import TaskTimeEntry
        from django.utils import timezone
        from datetime import timedelta
        entry = TaskTimeEntry.objects.create(
            task=self.task,
            user=self.friend,
            started_at=timezone.now() - timedelta(minutes=10),
            ended_at=timezone.now(),
            duration_seconds=600,
            note="Original note",
        )
        # Update note
        update_res = self.client.patch(
            f"/api/kanban/time-entries/{entry.id}",
            data=json.dumps({"note": "Updated note"}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["note"], "Updated note")

        # Delete entry
        del_res = self.client.delete(
            f"/api/kanban/time-entries/{entry.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(del_res.status_code, 200)
        self.assertFalse(TaskTimeEntry.objects.filter(id=entry.id).exists())

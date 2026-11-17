
"""Tests for board sharing, collaboration schemas, and permissions."""
import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from kanban.models import (
    Board,
    BoardColumn,
    Task,
    BoardMembership,
    RecurringTask,
    TaskTimeEntry,
)
from users.models import Friendship, FriendshipStatus, UserBlock

User = get_user_model()
PASSWORD = "TestPassword123!"


class BoardSharingApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password=PASSWORD,
            display_name="Owner",
        )
        self.friend = User.objects.create_user(
            email="friend@example.com",
            password=PASSWORD,
            display_name="Friend",
        )
        self.stranger = User.objects.create_user(
            email="stranger@example.com",
            password=PASSWORD,
            display_name="Stranger",
        )

        Friendship.objects.create(
            requester=self.owner,
            receiver=self.friend,
            status=FriendshipStatus.ACCEPTED,
        )

        self.board = Board.objects.create(
            owner=self.owner,
            title="Project X",
        )
        self.col = BoardColumn.objects.create(
            board=self.board,
            title="To Do",
        )
        self.task = Task.objects.create(
            column=self.col,
            title="Task 1",
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

    def add_collaborator(self, user=None, role=BoardMembership.Role.EDITOR):
        user = user or self.friend
        BoardMembership.objects.update_or_create(
            board=self.board,
            user=user,
            defaults={"role": role},
        )

    def test_board_serialization_includes_owner_and_collaborators(self):
        res = self.client.get(
            f"/api/kanban/boards/{self.board.id}",
            **self.auth_headers("owner@example.com"),
        )
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
        self.assertTrue(
            BoardMembership.objects.filter(
                board=self.board,
                user=self.friend,
            ).exists()
        )

        get_res = self.client.get(
            f"/api/kanban/boards/{self.board.id}",
            **self.auth_headers("owner@example.com"),
        )
        self.assertEqual(len(get_res.json()["collaborators"]), 1)
        self.assertEqual(
            get_res.json()["collaborators"][0]["id"],
            self.friend.id,
        )

    def test_collaborator_can_leave_board(self):
        self.add_collaborator()
        res = self.client.delete(
            f"/api/kanban/boards/{self.board.id}/collaborators/{self.friend.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(
            BoardMembership.objects.filter(
                board=self.board,
                user=self.friend,
            ).exists()
        )

    def test_collaborator_cannot_remove_other_collaborators(self):
        other = User.objects.create_user(
            email="other@example.com",
            password=PASSWORD,
            display_name="Other",
        )
        self.add_collaborator()
        self.add_collaborator(other)

        res = self.client.delete(
            f"/api/kanban/boards/{self.board.id}/collaborators/{other.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(res.status_code, 403)

    def test_collaborator_cannot_invite_friends(self):
        self.add_collaborator()
        res = self.client.post(
            f"/api/kanban/boards/{self.board.id}/collaborators",
            data=json.dumps({"friend_id": self.stranger.id}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(res.status_code, 404)

    def test_blocked_user_loses_board_access(self):
        self.add_collaborator()
        UserBlock.objects.create(
            blocker=self.owner,
            blocked=self.friend,
        )
        res = self.client.get(
            f"/api/kanban/boards/{self.board.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(res.status_code, 404)

    def test_collaborator_can_access_timers_and_time_entries(self):
        self.add_collaborator()

        res = self.client.get(
            f"/api/kanban/tasks/{self.task.id}/time-entries",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(res.status_code, 200)

        entry_res = self.client.post(
            f"/api/kanban/tasks/{self.task.id}/time-entries",
            data=json.dumps({
                "started_at": "2026-11-02T10:00:00Z",
                "duration_seconds": 60,
                "note": "Collaborator work",
            }),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(entry_res.status_code, 201)
        self.assertEqual(entry_res.json()["user_id"], self.friend.id)

    def test_collaborator_can_update_and_delete_own_time_entry(self):
        self.add_collaborator()

        entry = TaskTimeEntry.objects.create(
            task=self.task,
            user=self.friend,
            started_at=timezone.now() - timedelta(minutes=10),
            ended_at=timezone.now(),
            duration_seconds=600,
            note="Original note",
        )

        update_res = self.client.patch(
            f"/api/kanban/time-entries/{entry.id}",
            data=json.dumps({"note": "Updated note"}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["note"], "Updated note")

        del_res = self.client.delete(
            f"/api/kanban/time-entries/{entry.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(del_res.status_code, 200)
        self.assertFalse(
            TaskTimeEntry.objects.filter(id=entry.id).exists()
        )

    def test_owner_can_share_board_with_viewer_role(self):
        response = self.client.post(
            f"/api/kanban/boards/{self.board.id}/collaborators",
            data=json.dumps({
                "friend_id": self.friend.id,
                "role": "VIEWER",
            }),
            content_type="application/json",
            **self.auth_headers("owner@example.com"),
        )
        self.assertEqual(response.status_code, 200)

        membership = BoardMembership.objects.get(
            board=self.board,
            user=self.friend,
        )
        self.assertEqual(membership.role, BoardMembership.Role.VIEWER)

    def test_sharing_board_defaults_to_editor_role(self):
        response = self.client.post(
            f"/api/kanban/boards/{self.board.id}/collaborators",
            data=json.dumps({"friend_id": self.friend.id}),
            content_type="application/json",
            **self.auth_headers("owner@example.com"),
        )
        self.assertEqual(response.status_code, 200)

        membership = BoardMembership.objects.get(
            board=self.board,
            user=self.friend,
        )
        self.assertEqual(membership.role, BoardMembership.Role.EDITOR)

    def test_owner_can_change_role_when_sharing_existing_collaborator(self):
        self.add_collaborator()

        response = self.client.post(
            f"/api/kanban/boards/{self.board.id}/collaborators",
            data=json.dumps({
                "friend_id": self.friend.id,
                "role": "VIEWER",
            }),
            content_type="application/json",
            **self.auth_headers("owner@example.com"),
        )
        self.assertEqual(response.status_code, 200)

        self.assertEqual(
            BoardMembership.objects.filter(
                board=self.board,
                user=self.friend,
            ).count(),
            1,
        )
        membership = BoardMembership.objects.get(
            board=self.board,
            user=self.friend,
        )
        self.assertEqual(membership.role, BoardMembership.Role.VIEWER)

    def test_board_serializes_membership_users_and_roles(self):
        for role in BoardMembership.Role.values:
            with self.subTest(role=role):
                self.add_collaborator(role=role)

                response = self.client.get(
                    f"/api/kanban/boards/{self.board.id}",
                    **self.auth_headers("owner@example.com"),
                )

                self.assertEqual(response.status_code, 200)
                collaborators = response.json()["collaborators"]
                self.assertEqual(len(collaborators), 1)
                self.assertEqual(collaborators[0]["id"], self.friend.id)
                self.assertEqual(collaborators[0]["role"], role)
                self.assertTrue(response.json()["is_owner"])

    def test_viewer_can_read_board(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        response = self.client.get(
            f"/api/kanban/boards/{self.board.id}",
            **self.auth_headers("friend@example.com"),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], self.board.id)
        self.assertFalse(response.json()["is_owner"])

    def test_stranger_cannot_update_task(self):
        response = self.client.patch(
            f"/api/kanban/tasks/{self.task.id}",
            data=json.dumps({"title": "Unauthorized change"}),
            content_type="application/json",
            **self.auth_headers("stranger@example.com"),
        )

        self.assertEqual(response.status_code, 404)

        self.task.refresh_from_db()
        self.assertEqual(self.task.title, "Task 1")

    def test_viewer_cannot_update_board(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        response = self.client.patch(
            f"/api/kanban/boards/{self.board.id}",
            data=json.dumps({
                "title": "Changed title",
                "description": "",
            }),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)

        self.board.refresh_from_db()
        self.assertEqual(self.board.title, "Project X")

    def test_viewer_cannot_create_column(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        response = self.client.post(
            f"/api/kanban/boards/{self.board.id}/columns",
            data=json.dumps({"title": "In Progress"}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            BoardColumn.objects.filter(
                board=self.board,
                title="In Progress",
            ).exists()
        )

    def test_viewer_cannot_update_column(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        response = self.client.patch(
            f"/api/kanban/columns/{self.col.id}",
            data=json.dumps({"title": "Updated Column"}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)

        self.col.refresh_from_db()
        self.assertEqual(self.col.title, "To Do")

    def test_viewer_cannot_delete_column(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        response = self.client.delete(
            f"/api/kanban/columns/{self.col.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(
            BoardColumn.objects.filter(id=self.col.id).exists()
        )

    def test_viewer_cannot_create_task(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        response = self.client.post(
            f"/api/kanban/columns/{self.col.id}/tasks",
            data=json.dumps({"title": "New Task"}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            Task.objects.filter(
                column=self.col,
                title="New Task",
            ).exists()
        )

    def test_viewer_cannot_update_task(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        response = self.client.patch(
            f"/api/kanban/tasks/{self.task.id}",
            data=json.dumps({"title": "Updated Task"}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)

        self.task.refresh_from_db()
        self.assertEqual(self.task.title, "Task 1")

    def test_viewer_cannot_delete_task(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        response = self.client.delete(
            f"/api/kanban/tasks/{self.task.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Task.objects.filter(id=self.task.id).exists())

    def test_viewer_cannot_move_task(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        destination = BoardColumn.objects.create(
            board=self.board,
            title="In Progress",
            position=1,
        )

        response = self.client.post(
            f"/api/kanban/tasks/{self.task.id}/move",
            data=json.dumps({
                "to_column_id": destination.id,
                "target_position": 0,
            }),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)

        self.task.refresh_from_db()
        self.assertEqual(self.task.column_id, self.col.id)

    def test_viewer_cannot_update_task_timer(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        response = self.client.patch(
            f"/api/kanban/tasks/{self.task.id}/timer",
            data=json.dumps({"state": "RUNNING"}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)

    def test_viewer_cannot_create_time_entry(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        response = self.client.post(
            f"/api/kanban/tasks/{self.task.id}/time-entries",
            data=json.dumps({
                "started_at": "2026-11-02T10:00:00Z",
                "duration_seconds": 600,
                "note": "Viewer work",
            }),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            TaskTimeEntry.objects.filter(task=self.task).count(),
            0,
        )

    def test_viewer_cannot_update_time_entry(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        entry = TaskTimeEntry.objects.create(
            task=self.task,
            user=self.friend,
            started_at=timezone.now() - timedelta(minutes=10),
            ended_at=timezone.now(),
            duration_seconds=600,
            note="Original note",
        )

        response = self.client.patch(
            f"/api/kanban/time-entries/{entry.id}",
            data=json.dumps({"note": "Changed by viewer"}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)

        entry.refresh_from_db()
        self.assertEqual(entry.note, "Original note")

    def test_viewer_cannot_delete_time_entry(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        entry = TaskTimeEntry.objects.create(
            task=self.task,
            user=self.friend,
            started_at=timezone.now() - timedelta(minutes=10),
            ended_at=timezone.now(),
            duration_seconds=600,
            note="Original note",
        )

        response = self.client.delete(
            f"/api/kanban/time-entries/{entry.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(
            TaskTimeEntry.objects.filter(id=entry.id).exists()
        )

    def test_viewer_cannot_update_recurring_task(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        recurring_task = RecurringTask.objects.create(
            board=self.board,
            creator=self.owner,
            title="Daily report",
            next_run_at=timezone.now(),
        )

        response = self.client.patch(
            f"/api/kanban/recurring-tasks/{recurring_task.id}",
            data=json.dumps({"title": "Modified report"}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)

        recurring_task.refresh_from_db()
        self.assertEqual(recurring_task.title, "Daily report")

    def test_viewer_cannot_delete_recurring_task(self):
        self.add_collaborator(role=BoardMembership.Role.VIEWER)

        recurring_task = RecurringTask.objects.create(
            board=self.board,
            creator=self.owner,
            title="Daily report",
            next_run_at=timezone.now(),
        )

        response = self.client.delete(
            f"/api/kanban/recurring-tasks/{recurring_task.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(
            RecurringTask.objects.filter(id=recurring_task.id).exists()
        )

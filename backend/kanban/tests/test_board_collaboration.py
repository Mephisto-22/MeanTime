
"""API and event-stream tests for board sharing and live collaboration."""

import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import Client, TestCase, TransactionTestCase

from kanban.event_schemas import BoardEvent, BoardEventType
from kanban.models import Board, BoardColumn, Task, BoardMembership
from kanban.sse import format_sse_comment, format_sse_event, format_sse_retry
from users.models import Friendship, FriendshipStatus, UserBlock

User = get_user_model()
PASSWORD = "TestPassword123!"


class BoardCollaborationTestMixin:
    """Shared fixtures and authentication helpers for board collaboration tests."""

    def setUp(self):
        super().setUp()
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
        self.column = BoardColumn.objects.create(
            board=self.board,
            title="To Do",
            position=0,
        )
        self.task = Task.objects.create(
            column=self.column,
            title="Task 1",
            position=0,
        )

    def add_collaborator(self, user, role=BoardMembership.Role.EDITOR):
        return BoardMembership.objects.create(
            board=self.board,
            user=user,
            role=role,
        )

    def auth_headers(self, email):
        response = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": email, "password": PASSWORD}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)

        return {
            "HTTP_AUTHORIZATION": (
                f"Bearer {response.json()['access_token']}"
            )
        }


class BoardCollaborationApiTests(BoardCollaborationTestMixin, TestCase):
    @patch("kanban.api.publish_board_event")
    def test_collaborator_creation_and_role_changes_publish_after_commit(self, publish):
        headers = self.auth_headers("owner@example.com")
        for role in ("VIEWER", "EDITOR", "VIEWER"):
            with self.subTest(role=role):
                publish.reset_mock()
                with self.captureOnCommitCallbacks(execute=True):
                    response = self.client.post(
                        f"/api/kanban/boards/{self.board.id}/collaborators",
                        data=json.dumps({"friend_id": self.friend.id, "role": role}),
                        content_type="application/json",
                        **headers,
                    )
                    publish.assert_not_called()
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(
                        BoardMembership.objects.get(board=self.board, user=self.friend).role,
                        role,
                    )

                publish.assert_called_once_with(
                    board_id=self.board.id,
                    actor_id=self.owner.id,
                    event_type=BoardEventType.BOARD_COLLABORATOR_UPDATED,
                    data={"user_id": self.friend.id, "role": role},
                )

    @patch("kanban.api.publish_board_event")
    def test_unchanged_collaborator_role_does_not_publish(self, publish):
        self.add_collaborator(self.friend)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/kanban/boards/{self.board.id}/collaborators",
                data=json.dumps({"friend_id": self.friend.id, "role": "EDITOR"}),
                content_type="application/json",
                **self.auth_headers("owner@example.com"),
            )
        self.assertEqual(response.status_code, 200)
        publish.assert_not_called()

    @patch("kanban.api.publish_board_event")
    def test_rolled_back_role_change_does_not_publish(self, publish):
        self.add_collaborator(self.friend)
        headers = self.auth_headers("owner@example.com")
        with self.captureOnCommitCallbacks(execute=True):
            with transaction.atomic():
                response = self.client.post(
                    f"/api/kanban/boards/{self.board.id}/collaborators",
                    data=json.dumps({"friend_id": self.friend.id, "role": "VIEWER"}),
                    content_type="application/json",
                    **headers,
                )
                self.assertEqual(response.status_code, 200)
                transaction.set_rollback(True)
        self.assertEqual(
            BoardMembership.objects.get(board=self.board, user=self.friend).role,
            "EDITOR",
        )
        publish.assert_not_called()

    def test_shared_board_appears_in_collaborators_board_list(self):
        self.add_collaborator(self.friend)

        response = self.client.get(
            "/api/kanban/boards",
            **self.auth_headers("friend@example.com"),
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            self.board.id,
            [board["id"] for board in response.json()],
        )

    def test_stranger_cannot_retrieve_board(self):
        response = self.client.get(
            f"/api/kanban/boards/{self.board.id}",
            **self.auth_headers("stranger@example.com"),
        )

        self.assertEqual(response.status_code, 404)

    def test_owner_cannot_share_board_with_non_friend(self):
        response = self.client.post(
            f"/api/kanban/boards/{self.board.id}/collaborators",
            data=json.dumps({"friend_id": self.stranger.id}),
            content_type="application/json",
            **self.auth_headers("owner@example.com"),
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            BoardMembership.objects.filter(
                board=self.board,
                user=self.stranger,
            ).exists()
        )

    def test_owner_can_revoke_collaborator_access(self):
        self.add_collaborator(self.friend)

        response = self.client.delete(
            f"/api/kanban/boards/{self.board.id}/collaborators/{self.friend.id}",
            **self.auth_headers("owner@example.com"),
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(
            BoardMembership.objects.filter(
                board=self.board,
                user=self.friend,
            ).exists()
        )

        denied = self.client.get(
            f"/api/kanban/boards/{self.board.id}",
            **self.auth_headers("friend@example.com"),
        )

        self.assertEqual(denied.status_code, 404)

    def test_block_in_either_direction_denies_shared_board_access(self):
        self.add_collaborator(self.friend)

        for blocker, blocked in (
            (self.owner, self.friend),
            (self.friend, self.owner),
        ):
            with self.subTest(blocker=blocker.email):
                UserBlock.objects.get_or_create(
                    blocker=blocker,
                    blocked=blocked,
                )

                response = self.client.get(
                    f"/api/kanban/boards/{self.board.id}",
                    **self.auth_headers("friend@example.com"),
                )

                self.assertEqual(response.status_code, 404)

                UserBlock.objects.filter(
                    blocker=blocker,
                    blocked=blocked,
                ).delete()

    @patch("kanban.api.publish_board_event")
    def test_board_update_publishes_event_after_commit(self, publish):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(
                f"/api/kanban/boards/{self.board.id}",
                data=json.dumps({
                    "title": "Updated",
                    "description": "Details",
                }),
                content_type="application/json",
                **self.auth_headers("owner@example.com"),
            )

        self.assertEqual(response.status_code, 200)
        publish.assert_called_once()
        self.assertEqual(
            publish.call_args.kwargs["board_id"],
            self.board.id,
        )
        self.assertEqual(
            publish.call_args.kwargs["event_type"],
            BoardEventType.BOARD_UPDATED,
        )
        self.assertEqual(
            publish.call_args.kwargs["data"]["board"]["title"],
            "Updated",
        )


class BoardEventsApiTests(BoardCollaborationTestMixin, TransactionTestCase):
    """SSE endpoint tests use TransactionTestCase for response cleanup."""

    def test_collaborator_can_subscribe_to_board_events(self):
        self.add_collaborator(self.friend)

        response = self.client.get(
            f"/api/kanban/boards/{self.board.id}/events",
            **self.auth_headers("friend@example.com"),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/event-stream")
        self.assertEqual(
            response["Cache-Control"],
            "no-cache, no-transform",
        )
        self.assertEqual(response["X-Accel-Buffering"], "no")

        response.close()

    def test_user_without_board_access_cannot_subscribe(self):
        response = self.client.get(
            f"/api/kanban/boards/{self.board.id}/events",
            **self.auth_headers("stranger@example.com"),
        )

        self.assertEqual(response.status_code, 404)


class BoardEventSchemaTests(TestCase):
    def test_event_has_common_envelope_and_serializes_enum(self):
        event = BoardEvent(
            type=BoardEventType.TASK_CREATED,
            board_id=12,
            actor_id=34,
            data={"task": {"id": 56}},
        )

        payload = json.loads(event.model_dump_json())

        self.assertEqual(payload["type"], "task.created")
        self.assertEqual(payload["board_id"], 12)
        self.assertEqual(payload["actor_id"], 34)
        self.assertEqual(payload["data"], {"task": {"id": 56}})
        self.assertTrue(payload["id"])
        self.assertTrue(payload["timestamp"])

    def test_all_declared_event_types_have_string_values(self):
        self.assertEqual(
            {event.value for event in BoardEventType},
            {
                "board.updated",
                "board.deleted",
                "board.access_revoked",
                "board.collaborator_updated",
                "column.created",
                "column.updated",
                "column.deleted",
                "task.created",
                "task.updated",
                "task.deleted",
                "task.moved",
                "task.timer_updated",
                "time_entry.created",
                "time_entry.updated",
                "time_entry.deleted",
            },
        )


class ServerSentEventFormattingTests(TestCase):
    def test_event_format_includes_id_type_and_json_data(self):
        event = {
            "id": "event-1",
            "type": "task.created",
            "board_id": 2,
            "data": {"task": {"title": "A task"}},
        }

        formatted = format_sse_event(event)

        self.assertIn("id: event-1\n", formatted)
        self.assertIn("event: task.created\n", formatted)
        self.assertIn('data: {"id":"event-1"', formatted)
        self.assertTrue(formatted.endswith("\n\n"))

    def test_event_format_rejects_newlines_in_sse_fields(self):
        with self.assertRaises(ValueError):
            format_sse_event({
                "id": "bad\nid",
                "type": "task.created",
            })

    def test_retry_and_heartbeat_comment_format(self):
        self.assertEqual(
            format_sse_retry(2500),
            "retry: 2500\n\n",
        )
        self.assertEqual(
            format_sse_comment(),
            ": keep-alive\n\n",
        )

    def test_retry_rejects_negative_interval(self):
        with self.assertRaises(ValueError):
            format_sse_retry(-1)

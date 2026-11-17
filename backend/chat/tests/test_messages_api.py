import json
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from ninja_jwt.tokens import RefreshToken

from chat.models import Message
from kanban.models import Board
from users.models import UserBlock

User = get_user_model()


class BoardMessagesAPITests(TestCase):
    def setUp(self):
        self.client = Client()
        self.owner = User.objects.create_user(
            email="alice@example.com",
            password="password123",
            display_name="Alice Owner",
        )
        self.collab_a = User.objects.create_user(
            email="bob@example.com",
            password="password123",
            display_name="Bob Collab",
        )
        self.collab_b = User.objects.create_user(
            email="charlie@example.com",
            password="password123",
            display_name="Charlie Collab",
        )
        self.stranger = User.objects.create_user(
            email="stranger@example.com",
            password="password123",
            display_name="Stranger Danger",
        )

        self.board = Board.objects.create(owner=self.owner, title="Shared Board")
        self.board.collaborators.add(self.collab_a, self.collab_b)

        self.owner_auth = self._auth_headers(self.owner)
        self.collab_a_auth = self._auth_headers(self.collab_a)
        self.collab_b_auth = self._auth_headers(self.collab_b)
        self.stranger_auth = self._auth_headers(self.stranger)

    def _auth_headers(self, user):
        token = RefreshToken.for_user(user).access_token
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def test_owner_and_collaborator_can_send_and_list_messages(self):
        res_post = self.client.post(
            f"/api/chat/boards/{self.board.id}/messages",
            data=json.dumps({"content": "Hello team!"}),
            content_type="application/json",
            **self.owner_auth,
        )
        self.assertEqual(res_post.status_code, 201)
        body = res_post.json()
        self.assertEqual(body["board_id"], self.board.id)
        self.assertEqual(body["sender_id"], self.owner.id)
        self.assertEqual(body["sender_name"], "Alice Owner")
        self.assertEqual(body["content"], "Hello team!")
        self.assertIn("id", body)
        self.assertIn("created_at", body)

        res_collab_post = self.client.post(
            f"/api/chat/boards/{self.board.id}/messages",
            data=json.dumps({"content": "Hi Alice!"}),
            content_type="application/json",
            **self.collab_a_auth,
        )
        self.assertEqual(res_collab_post.status_code, 201)

        res_get = self.client.get(
            f"/api/chat/boards/{self.board.id}/messages",
            **self.collab_b_auth,
        )
        self.assertEqual(res_get.status_code, 200)
        messages = res_get.json()
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["content"], "Hello team!")
        self.assertEqual(messages[1]["content"], "Hi Alice!")

    def test_non_collaborator_gets_404(self):
        res_get = self.client.get(
            f"/api/chat/boards/{self.board.id}/messages",
            **self.stranger_auth,
        )
        self.assertEqual(res_get.status_code, 404)

        res_post = self.client.post(
            f"/api/chat/boards/{self.board.id}/messages",
            data=json.dumps({"content": "Let me in"}),
            content_type="application/json",
            **self.stranger_auth,
        )
        self.assertEqual(res_post.status_code, 404)

    def test_since_id_returns_only_newer_messages(self):
        m1 = Message.objects.create(board=self.board, sender=self.owner, content="First")
        m2 = Message.objects.create(board=self.board, sender=self.collab_a, content="Second")
        m3 = Message.objects.create(board=self.board, sender=self.collab_b, content="Third")

        res = self.client.get(
            f"/api/chat/boards/{self.board.id}/messages?since_id={m1.id}",
            **self.owner_auth,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual([m["id"] for m in data], [m2.id, m3.id])

    def test_limit_caps_initial_history_chronologically(self):
        m1 = Message.objects.create(board=self.board, sender=self.owner, content="M1")
        m2 = Message.objects.create(board=self.board, sender=self.owner, content="M2")
        m3 = Message.objects.create(board=self.board, sender=self.owner, content="M3")
        m4 = Message.objects.create(board=self.board, sender=self.owner, content="M4")

        res = self.client.get(
            f"/api/chat/boards/{self.board.id}/messages?limit=2",
            **self.owner_auth,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual([m["id"] for m in data], [m3.id, m4.id])

    def test_empty_or_too_long_message_rejected_with_422(self):
        res_empty = self.client.post(
            f"/api/chat/boards/{self.board.id}/messages",
            data=json.dumps({"content": "   "}),
            content_type="application/json",
            **self.owner_auth,
        )
        self.assertEqual(res_empty.status_code, 422)

        res_long = self.client.post(
            f"/api/chat/boards/{self.board.id}/messages",
            data=json.dumps({"content": "x" * 2001}),
            content_type="application/json",
            **self.owner_auth,
        )
        self.assertEqual(res_long.status_code, 422)

    def test_bidirectional_block_suppresses_messages_between_collaborators(self):
        Message.objects.create(board=self.board, sender=self.owner, content="From Owner")
        Message.objects.create(board=self.board, sender=self.collab_a, content="From Bob")
        Message.objects.create(board=self.board, sender=self.collab_b, content="From Charlie")

        UserBlock.objects.create(blocker=self.collab_a, blocked=self.collab_b)

        # Bob sees Owner and Bob, not Charlie
        res_bob = self.client.get(
            f"/api/chat/boards/{self.board.id}/messages",
            **self.collab_a_auth,
        )
        self.assertEqual(
            [m["content"] for m in res_bob.json()],
            ["From Owner", "From Bob"],
        )

        # Charlie sees Owner and Charlie, not Bob
        res_charlie = self.client.get(
            f"/api/chat/boards/{self.board.id}/messages",
            **self.collab_b_auth,
        )
        self.assertEqual(
            [m["content"] for m in res_charlie.json()],
            ["From Owner", "From Charlie"],
        )

        # Owner sees all 3
        res_owner = self.client.get(
            f"/api/chat/boards/{self.board.id}/messages",
            **self.owner_auth,
        )
        self.assertEqual(
            [m["content"] for m in res_owner.json()],
            ["From Owner", "From Bob", "From Charlie"],
        )

    def test_unauthenticated_request_returns_401(self):
        res_get = self.client.get(f"/api/chat/boards/{self.board.id}/messages")
        self.assertEqual(res_get.status_code, 401)

        res_post = self.client.post(
            f"/api/chat/boards/{self.board.id}/messages",
            data=json.dumps({"content": "Hello"}),
            content_type="application/json",
        )
        self.assertEqual(res_post.status_code, 401)

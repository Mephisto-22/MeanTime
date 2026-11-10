import json
import time
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from ninja_jwt.tokens import RefreshToken

from chat.models import (
    Conversation,
    ConversationParticipant,
    ConversationType,
    Message,
    ParticipantStatus,
)
from users.models import Friendship, FriendshipStatus, UserBlock

User = get_user_model()


class MessagesAPITests(TestCase):
    def setUp(self):
        self.client = Client()
        self.alice = User.objects.create_user(
            email="alice@example.com",
            password="password123",
            display_name="Alice Smith",
        )
        self.bob = User.objects.create_user(
            email="bob@example.com",
            password="password123",
            display_name="Bob Jones",
        )
        self.charlie = User.objects.create_user(
            email="charlie@example.com",
            password="password123",
            display_name="Charlie Brown",
        )
        self.stranger = User.objects.create_user(
            email="stranger@example.com",
            password="password123",
            display_name="Stranger Danger",
        )

        # Friendships
        Friendship.objects.create(
            requester=self.alice,
            receiver=self.bob,
            status=FriendshipStatus.ACCEPTED,
        )
        Friendship.objects.create(
            requester=self.bob,
            receiver=self.charlie,
            status=FriendshipStatus.ACCEPTED,
        )
        Friendship.objects.create(
            requester=self.alice,
            receiver=self.charlie,
            status=FriendshipStatus.ACCEPTED,
        )

        self.alice_auth = self._auth_headers(self.alice)
        self.bob_auth = self._auth_headers(self.bob)
        self.charlie_auth = self._auth_headers(self.charlie)
        self.stranger_auth = self._auth_headers(self.stranger)

    def _auth_headers(self, user):
        token = RefreshToken.for_user(user).access_token
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def _create_direct_conv(self, user1, user2):
        conv = Conversation.objects.create(
            type=ConversationType.DIRECT,
            created_by=user1,
        )
        ConversationParticipant.objects.create(
            conversation=conv,
            user=user1,
            status=ParticipantStatus.ACCEPTED,
        )
        ConversationParticipant.objects.create(
            conversation=conv,
            user=user2,
            status=ParticipantStatus.ACCEPTED,
            invited_by=user1,
        )
        return conv

    def _create_group_conv(self, creator, members, title="Project Group"):
        conv = Conversation.objects.create(
            type=ConversationType.GROUP,
            title=title,
            created_by=creator,
        )
        ConversationParticipant.objects.create(
            conversation=conv,
            user=creator,
            status=ParticipantStatus.ACCEPTED,
        )
        for m in members:
            ConversationParticipant.objects.create(
                conversation=conv,
                user=m,
                status=ParticipantStatus.ACCEPTED,
                invited_by=creator,
            )
        return conv

    def test_send_and_retrieve_messages(self):
        """Accepted members can send messages and retrieve them in chronological order."""
        conv = self._create_direct_conv(self.alice, self.bob)

        # Alice sends a message
        res1 = self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Hello Bob!"}),
            content_type="application/json",
            **self.alice_auth,
        )
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json()
        self.assertEqual(data1["conversation_id"], conv.id)
        self.assertEqual(data1["sender_id"], self.alice.id)
        self.assertEqual(data1["sender_name"], "Alice Smith")
        self.assertEqual(data1["content"], "Hello Bob!")
        self.assertIn("created_at", data1)

        # Bob replies
        res2 = self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Hi Alice!"}),
            content_type="application/json",
            **self.bob_auth,
        )
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertEqual(data2["sender_name"], "Bob Jones")
        self.assertEqual(data2["content"], "Hi Alice!")

        # Alice retrieves messages
        get_res = self.client.get(
            f"/api/chat/conversations/{conv.id}/messages",
            **self.alice_auth,
        )
        self.assertEqual(get_res.status_code, 200)
        messages = get_res.json()
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["content"], "Hello Bob!")
        self.assertEqual(messages[1]["content"], "Hi Alice!")

        # Conversation updated_at was bumped
        conv.refresh_from_db()
        self.assertGreaterEqual(conv.updated_at, conv.created_at)

    def test_empty_or_whitespace_message_rejected(self):
        """Empty or whitespace-only messages are rejected with 400 Bad Request."""
        conv = self._create_direct_conv(self.alice, self.bob)

        for empty_payload in [{"content": ""}, {"content": "   \n\t  "}]:
            res = self.client.post(
                f"/api/chat/conversations/{conv.id}/messages",
                data=json.dumps(empty_payload),
                content_type="application/json",
                **self.alice_auth,
            )
            self.assertIn(res.status_code, [400, 422])

    def test_pending_or_declined_participant_cannot_send_message(self):
        """Pending or declined participants receive 403 Forbidden when trying to send messages."""
        conv = Conversation.objects.create(
            type=ConversationType.DIRECT,
            created_by=self.alice,
        )
        ConversationParticipant.objects.create(
            conversation=conv,
            user=self.alice,
            status=ParticipantStatus.ACCEPTED,
        )
        bob_p = ConversationParticipant.objects.create(
            conversation=conv,
            user=self.bob,
            status=ParticipantStatus.PENDING,
            invited_by=self.alice,
        )

        # Pending Bob tries to send message
        res = self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Can I talk?"}),
            content_type="application/json",
            **self.bob_auth,
        )
        self.assertEqual(res.status_code, 403)

        # Declined Bob tries to send message
        bob_p.status = ParticipantStatus.DECLINED
        bob_p.save()
        res_declined = self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Still trying"}),
            content_type="application/json",
            **self.bob_auth,
        )
        self.assertEqual(res_declined.status_code, 403)

    def test_non_participant_cannot_read_or_send_messages(self):
        """Non-participants receive 403 Forbidden for both reading and sending messages."""
        conv = self._create_direct_conv(self.alice, self.bob)

        # Read
        get_res = self.client.get(
            f"/api/chat/conversations/{conv.id}/messages",
            **self.stranger_auth,
        )
        self.assertEqual(get_res.status_code, 403)

        # Send
        post_res = self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Sneaky message"}),
            content_type="application/json",
            **self.stranger_auth,
        )
        self.assertEqual(post_res.status_code, 403)

    def test_individual_history_clearing_isolation(self):
        """Clearing history affects only the caller's view of previous messages."""
        conv = self._create_direct_conv(self.alice, self.bob)

        # Alice and Bob exchange messages
        self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Message 1"}),
            content_type="application/json",
            **self.alice_auth,
        )
        self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Message 2"}),
            content_type="application/json",
            **self.bob_auth,
        )

        # Alice clears her history
        clear_res = self.client.post(
            f"/api/chat/conversations/{conv.id}/clear",
            **self.alice_auth,
        )
        self.assertEqual(clear_res.status_code, 200)
        clear_data = clear_res.json()
        self.assertTrue(clear_data["success"])
        self.assertIn("cleared_at", clear_data)

        # Alice now sees 0 messages
        alice_msgs_1 = self.client.get(
            f"/api/chat/conversations/{conv.id}/messages",
            **self.alice_auth,
        ).json()
        self.assertEqual(len(alice_msgs_1), 0)

        # Bob still sees both messages
        bob_msgs = self.client.get(
            f"/api/chat/conversations/{conv.id}/messages",
            **self.bob_auth,
        ).json()
        self.assertEqual(len(bob_msgs), 2)

        # Alice sends a new message after clearing
        self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Message 3 after clear"}),
            content_type="application/json",
            **self.alice_auth,
        )

        # Alice now sees only the new message
        alice_msgs_2 = self.client.get(
            f"/api/chat/conversations/{conv.id}/messages",
            **self.alice_auth,
        ).json()
        self.assertEqual(len(alice_msgs_2), 1)
        self.assertEqual(alice_msgs_2[0]["content"], "Message 3 after clear")

        # Bob sees all 3 messages
        bob_msgs_2 = self.client.get(
            f"/api/chat/conversations/{conv.id}/messages",
            **self.bob_auth,
        ).json()
        self.assertEqual(len(bob_msgs_2), 3)

    def test_clear_history_on_empty_conversation(self):
        """Clearing history on an empty conversation succeeds."""
        conv = self._create_direct_conv(self.alice, self.bob)
        res = self.client.post(
            f"/api/chat/conversations/{conv.id}/clear",
            **self.alice_auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["success"])

        msgs = self.client.get(
            f"/api/chat/conversations/{conv.id}/messages",
            **self.alice_auth,
        ).json()
        self.assertEqual(msgs, [])

    def test_mark_as_read_updates_unread_count(self):
        """Marking as read updates last_read_at and resets unread count in conversations list."""
        conv = self._create_direct_conv(self.alice, self.bob)

        # Alice sends 2 messages to Bob
        self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Hey Bob"}),
            content_type="application/json",
            **self.alice_auth,
        )
        self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Are you online?"}),
            content_type="application/json",
            **self.alice_auth,
        )

        # Bob lists conversations: unread_count should be 2
        list_res1 = self.client.get("/api/chat/conversations", **self.bob_auth)
        self.assertEqual(list_res1.status_code, 200)
        conv_item = next(
            c for c in list_res1.json()["conversations"] if c["id"] == conv.id
        )
        self.assertEqual(conv_item["unread_count"], 2)

        # Bob marks conversation as read
        read_res = self.client.post(
            f"/api/chat/conversations/{conv.id}/read",
            **self.bob_auth,
        )
        self.assertEqual(read_res.status_code, 200)
        self.assertTrue(read_res.json()["success"])
        self.assertIn("last_read_at", read_res.json())

        # Bob lists conversations again: unread_count should be 0
        list_res2 = self.client.get("/api/chat/conversations", **self.bob_auth)
        self.assertEqual(list_res2.status_code, 200)
        conv_item2 = next(
            c for c in list_res2.json()["conversations"] if c["id"] == conv.id
        )
        self.assertEqual(conv_item2["unread_count"], 0)

    def test_messages_since_id_pagination(self):
        """since_id query param filters out older messages; limit limits output count."""
        conv = self._create_direct_conv(self.alice, self.bob)

        # Create 3 messages
        r1 = self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Msg 1"}),
            content_type="application/json",
            **self.alice_auth,
        ).json()
        r2 = self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Msg 2"}),
            content_type="application/json",
            **self.alice_auth,
        ).json()
        r3 = self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Msg 3"}),
            content_type="application/json",
            **self.alice_auth,
        ).json()

        # since_id = r1["id"] -> should return only Msg 2 and Msg 3
        res = self.client.get(
            f"/api/chat/conversations/{conv.id}/messages?since_id={r1['id']}",
            **self.bob_auth,
        )
        self.assertEqual(res.status_code, 200)
        items = res.json()
        self.assertEqual(len(items), 2)
        self.assertEqual([m["id"] for m in items], [r2["id"], r3["id"]])

        # limit = 2 on all messages -> should return first 2 messages
        limit_res = self.client.get(
            f"/api/chat/conversations/{conv.id}/messages?limit=2",
            **self.bob_auth,
        )
        self.assertEqual(limit_res.status_code, 200)
        limit_items = limit_res.json()
        self.assertEqual(len(limit_items), 2)
        self.assertEqual([m["id"] for m in limit_items], [r1["id"], r2["id"]])

    def test_blocked_messages_suppressed_in_group(self):
        """In a group conversation, messages from blocked users are suppressed."""
        conv = self._create_group_conv(self.alice, [self.bob, self.charlie])

        # Alice, Bob, and Charlie send messages
        self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "From Alice"}),
            content_type="application/json",
            **self.alice_auth,
        )
        self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "From Charlie"}),
            content_type="application/json",
            **self.charlie_auth,
        )
        self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "From Bob"}),
            content_type="application/json",
            **self.bob_auth,
        )

        # Alice blocks Charlie
        UserBlock.objects.create(blocker=self.alice, blocked=self.charlie)

        # Alice retrieves messages: should see Alice & Bob, but NOT Charlie
        alice_msgs = self.client.get(
            f"/api/chat/conversations/{conv.id}/messages",
            **self.alice_auth,
        ).json()
        alice_senders = [m["sender_name"] for m in alice_msgs]
        self.assertIn("Alice Smith", alice_senders)
        self.assertIn("Bob Jones", alice_senders)
        self.assertNotIn("Charlie Brown", alice_senders)

        # Charlie retrieves messages: Alice blocked Charlie, so Charlie should not see Alice
        charlie_msgs = self.client.get(
            f"/api/chat/conversations/{conv.id}/messages",
            **self.charlie_auth,
        ).json()
        charlie_senders = [m["sender_name"] for m in charlie_msgs]
        self.assertNotIn("Alice Smith", charlie_senders)
        self.assertIn("Charlie Brown", charlie_senders)
        self.assertIn("Bob Jones", charlie_senders)

        # Bob (no blocks) sees all 3
        bob_msgs = self.client.get(
            f"/api/chat/conversations/{conv.id}/messages",
            **self.bob_auth,
        ).json()
        self.assertEqual(len(bob_msgs), 3)

    def test_blocked_direct_chat_cannot_send_messages(self):
        """Users in a direct chat where one user blocked the other cannot send messages."""
        conv = self._create_direct_conv(self.alice, self.bob)

        # Alice blocks Bob
        UserBlock.objects.create(blocker=self.alice, blocked=self.bob)

        # Alice tries to send message
        res_alice = self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Blocked message from Alice"}),
            content_type="application/json",
            **self.alice_auth,
        )
        self.assertIn(res_alice.status_code, [400, 403])

        # Bob tries to send message
        res_bob = self.client.post(
            f"/api/chat/conversations/{conv.id}/messages",
            data=json.dumps({"content": "Blocked message from Bob"}),
            content_type="application/json",
            **self.bob_auth,
        )
        self.assertIn(res_bob.status_code, [400, 403])

    def test_non_participant_cannot_rename_or_invite_even_on_direct(self):
        """Task 2 Review Finding: Non-participants receive 403 Forbidden on update or invite even if direct."""
        conv = self._create_direct_conv(self.alice, self.bob)

        # Stranger attempts rename
        res_rename = self.client.patch(
            f"/api/chat/conversations/{conv.id}",
            data=json.dumps({"title": "New Title"}),
            content_type="application/json",
            **self.stranger_auth,
        )
        self.assertEqual(res_rename.status_code, 403)

        # Stranger attempts invite
        res_invite = self.client.post(
            f"/api/chat/conversations/{conv.id}/invites",
            data=json.dumps({"user_ids": [self.charlie.id]}),
            content_type="application/json",
            **self.stranger_auth,
        )
        self.assertEqual(res_invite.status_code, 403)

    def test_accepted_participant_cannot_decline_must_leave(self):
        """Task 2 Review Finding: Accepted participants cannot decline, they must leave."""
        conv = self._create_direct_conv(self.alice, self.bob)

        # Bob is already ACCEPTED
        res = self.client.post(
            f"/api/chat/conversations/{conv.id}/decline",
            **self.bob_auth,
        )
        self.assertEqual(res.status_code, 400)

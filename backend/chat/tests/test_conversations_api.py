import json
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from ninja_jwt.tokens import RefreshToken

from chat.models import (
    Conversation,
    ConversationParticipant,
    ConversationType,
    ParticipantStatus,
)
from users.models import Friendship, FriendshipStatus, UserBlock

User = get_user_model()


class ConversationsAPITests(TestCase):
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

        # Make Alice & Bob friends
        Friendship.objects.create(
            requester=self.alice,
            receiver=self.bob,
            status=FriendshipStatus.ACCEPTED,
        )

        # Make Bob & Charlie friends
        Friendship.objects.create(
            requester=self.bob,
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

    def test_create_direct_conversation_with_friend(self):
        """Alice creates a direct conversation with Bob (friend). Alice is ACCEPTED, Bob is PENDING."""
        payload = {
            "type": "DIRECT",
            "participant_ids": [self.bob.id],
        }
        response = self.client.post(
            "/api/chat/conversations",
            data=json.dumps(payload),
            content_type="application/json",
            **self.alice_auth,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["type"], "DIRECT")
        self.assertTrue(data["is_active"])

        # Check participants
        alice_p = ConversationParticipant.objects.get(
            conversation_id=data["id"], user=self.alice
        )
        bob_p = ConversationParticipant.objects.get(
            conversation_id=data["id"], user=self.bob
        )
        self.assertEqual(alice_p.status, ParticipantStatus.ACCEPTED)
        self.assertEqual(bob_p.status, ParticipantStatus.PENDING)
        self.assertEqual(bob_p.invited_by, self.alice)

    def test_create_conversation_with_non_friend_fails(self):
        """Alice cannot create a conversation with stranger (not friends)."""
        payload = {
            "type": "DIRECT",
            "participant_ids": [self.stranger.id],
        }
        response = self.client.post(
            "/api/chat/conversations",
            data=json.dumps(payload),
            content_type="application/json",
            **self.alice_auth,
        )
        self.assertEqual(response.status_code, 400)

    def test_create_conversation_with_blocked_user_fails(self):
        """Alice cannot create conversation with friend if blocked."""
        UserBlock.objects.create(blocker=self.alice, blocked=self.bob)
        payload = {
            "type": "DIRECT",
            "participant_ids": [self.bob.id],
        }
        response = self.client.post(
            "/api/chat/conversations",
            data=json.dumps(payload),
            content_type="application/json",
            **self.alice_auth,
        )
        self.assertEqual(response.status_code, 400)

    def test_accept_invitation(self):
        """Bob accepts an invitation from Alice; Bob's status becomes ACCEPTED."""
        conv = Conversation.objects.create(
            type=ConversationType.DIRECT, created_by=self.alice
        )
        ConversationParticipant.objects.create(
            conversation=conv, user=self.alice, status=ParticipantStatus.ACCEPTED
        )
        bob_p = ConversationParticipant.objects.create(
            conversation=conv,
            user=self.bob,
            status=ParticipantStatus.PENDING,
            invited_by=self.alice,
        )

        response = self.client.post(
            f"/api/chat/conversations/{conv.id}/accept",
            **self.bob_auth,
        )
        self.assertEqual(response.status_code, 200)
        bob_p.refresh_from_db()
        self.assertEqual(bob_p.status, ParticipantStatus.ACCEPTED)

    def test_decline_invitation(self):
        """Bob declines an invitation from Alice; Bob's status becomes DECLINED."""
        conv = Conversation.objects.create(
            type=ConversationType.DIRECT, created_by=self.alice
        )
        ConversationParticipant.objects.create(
            conversation=conv, user=self.alice, status=ParticipantStatus.ACCEPTED
        )
        bob_p = ConversationParticipant.objects.create(
            conversation=conv,
            user=self.bob,
            status=ParticipantStatus.PENDING,
            invited_by=self.alice,
        )

        response = self.client.post(
            f"/api/chat/conversations/{conv.id}/decline",
            **self.bob_auth,
        )
        self.assertEqual(response.status_code, 200)
        bob_p.refresh_from_db()
        self.assertEqual(bob_p.status, ParticipantStatus.DECLINED)

    def test_reinvite_declined_dm(self):
        """If Bob declined earlier, Alice re-requesting direct chat resets Bob to PENDING."""
        conv = Conversation.objects.create(
            type=ConversationType.DIRECT, created_by=self.alice
        )
        ConversationParticipant.objects.create(
            conversation=conv, user=self.alice, status=ParticipantStatus.ACCEPTED
        )
        bob_p = ConversationParticipant.objects.create(
            conversation=conv,
            user=self.bob,
            status=ParticipantStatus.DECLINED,
            invited_by=self.alice,
        )

        payload = {
            "type": "DIRECT",
            "participant_ids": [self.bob.id],
        }
        response = self.client.post(
            "/api/chat/conversations",
            data=json.dumps(payload),
            content_type="application/json",
            **self.alice_auth,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], conv.id)

        bob_p.refresh_from_db()
        self.assertEqual(bob_p.status, ParticipantStatus.PENDING)

    def test_group_invite_and_rename_permissions(self):
        """Any accepted group participant can rename the group and invite mutual friends."""
        conv = Conversation.objects.create(
            type=ConversationType.GROUP,
            title="Alpha Team",
            created_by=self.alice,
        )
        ConversationParticipant.objects.create(
            conversation=conv, user=self.alice, status=ParticipantStatus.ACCEPTED
        )
        ConversationParticipant.objects.create(
            conversation=conv, user=self.bob, status=ParticipantStatus.ACCEPTED
        )

        # Bob renames group
        rename_response = self.client.patch(
            f"/api/chat/conversations/{conv.id}",
            data=json.dumps({"title": "Bravo Team"}),
            content_type="application/json",
            **self.bob_auth,
        )
        self.assertEqual(rename_response.status_code, 200)
        conv.refresh_from_db()
        self.assertEqual(conv.title, "Bravo Team")

        # Bob invites Charlie (Bob's friend)
        invite_response = self.client.post(
            f"/api/chat/conversations/{conv.id}/invites",
            data=json.dumps({"user_ids": [self.charlie.id]}),
            content_type="application/json",
            **self.bob_auth,
        )
        self.assertEqual(invite_response.status_code, 200)
        charlie_p = ConversationParticipant.objects.get(
            conversation=conv, user=self.charlie
        )
        self.assertEqual(charlie_p.status, ParticipantStatus.PENDING)
        self.assertEqual(charlie_p.invited_by, self.bob)

        # Non-accepted stranger cannot rename or invite
        fail_rename = self.client.patch(
            f"/api/chat/conversations/{conv.id}",
            data=json.dumps({"title": "Hacked"}),
            content_type="application/json",
            **self.stranger_auth,
        )
        self.assertEqual(fail_rename.status_code, 403)

    def test_unauthorized_user_cannot_access_conversation(self):
        """Stranger cannot view conversation details."""
        conv = Conversation.objects.create(
            type=ConversationType.DIRECT, created_by=self.alice
        )
        ConversationParticipant.objects.create(
            conversation=conv, user=self.alice, status=ParticipantStatus.ACCEPTED
        )
        ConversationParticipant.objects.create(
            conversation=conv, user=self.bob, status=ParticipantStatus.ACCEPTED
        )

        response = self.client.get(
            f"/api/chat/conversations/{conv.id}",
            **self.stranger_auth,
        )
        self.assertEqual(response.status_code, 403)

    def test_list_conversations_and_pending_invites(self):
        """GET /api/chat/conversations returns active accepted chats and pending invites."""
        # Conversation 1: Accepted chat between Alice & Bob
        conv1 = Conversation.objects.create(
            type=ConversationType.DIRECT, created_by=self.alice
        )
        ConversationParticipant.objects.create(
            conversation=conv1, user=self.alice, status=ParticipantStatus.ACCEPTED
        )
        ConversationParticipant.objects.create(
            conversation=conv1, user=self.bob, status=ParticipantStatus.ACCEPTED
        )

        # Conversation 2: Pending invite from Bob to Alice
        conv2 = Conversation.objects.create(
            type=ConversationType.GROUP,
            title="Design Review",
            created_by=self.bob,
        )
        ConversationParticipant.objects.create(
            conversation=conv2, user=self.bob, status=ParticipantStatus.ACCEPTED
        )
        ConversationParticipant.objects.create(
            conversation=conv2,
            user=self.alice,
            status=ParticipantStatus.PENDING,
            invited_by=self.bob,
        )

        response = self.client.get("/api/chat/conversations", **self.alice_auth)
        self.assertEqual(response.status_code, 200)
        data = response.json()

        conv_ids = [c["id"] for c in data["conversations"]]
        self.assertIn(conv1.id, conv_ids)
        self.assertNotIn(conv2.id, conv_ids)

        pending_conv_ids = [i["conversation_id"] for i in data["pending_invites"]]
        self.assertIn(conv2.id, pending_conv_ids)
        self.assertNotIn(conv1.id, pending_conv_ids)

    def test_leave_conversation_deactivates_when_all_leave(self):
        """Leaving conversation sets participant status to DECLINED. If 0 accepted participants remain, is_active=False."""
        conv = Conversation.objects.create(
            type=ConversationType.GROUP,
            title="Project X",
            created_by=self.alice,
        )
        p_alice = ConversationParticipant.objects.create(
            conversation=conv, user=self.alice, status=ParticipantStatus.ACCEPTED
        )
        p_bob = ConversationParticipant.objects.create(
            conversation=conv, user=self.bob, status=ParticipantStatus.ACCEPTED
        )

        # Alice leaves
        res_alice = self.client.post(
            f"/api/chat/conversations/{conv.id}/leave", **self.alice_auth
        )
        self.assertEqual(res_alice.status_code, 200)
        p_alice.refresh_from_db()
        self.assertEqual(p_alice.status, ParticipantStatus.DECLINED)
        conv.refresh_from_db()
        self.assertTrue(conv.is_active)

        # Bob leaves
        res_bob = self.client.post(
            f"/api/chat/conversations/{conv.id}/leave", **self.bob_auth
        )
        self.assertEqual(res_bob.status_code, 200)
        p_bob.refresh_from_db()
        self.assertEqual(p_bob.status, ParticipantStatus.DECLINED)
        conv.refresh_from_db()
        self.assertFalse(conv.is_active)

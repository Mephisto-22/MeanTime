from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils import timezone
from kanban.models import Board
from chat.models import (
    Conversation,
    ConversationParticipant,
    Message,
    ConversationType,
    ParticipantStatus,
)

User = get_user_model()


class ChatModelTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(
            email="alice@example.com",
            display_name="Alice",
            password="password123",
        )
        self.user2 = User.objects.create_user(
            email="bob@example.com",
            display_name="Bob",
            password="password123",
        )

    def test_create_conversation_and_participants(self):
        conv = Conversation.objects.create(
            type=ConversationType.DIRECT,
            created_by=self.user1,
        )
        p1 = ConversationParticipant.objects.create(
            conversation=conv,
            user=self.user1,
            status=ParticipantStatus.ACCEPTED,
        )
        p2 = ConversationParticipant.objects.create(
            conversation=conv,
            user=self.user2,
            status=ParticipantStatus.PENDING,
            invited_by=self.user1,
        )

        self.assertEqual(conv.participants.count(), 2)
        self.assertEqual(p1.status, ParticipantStatus.ACCEPTED)
        self.assertEqual(p2.status, ParticipantStatus.PENDING)
        self.assertTrue(conv.is_active)
        self.assertEqual(conv.type, ConversationType.DIRECT)

    def test_message_creation_and_ordering(self):
        conv = Conversation.objects.create(
            type=ConversationType.GROUP,
            title="Sprint Team",
            created_by=self.user1,
        )
        m1 = Message.objects.create(
            conversation=conv,
            sender=self.user1,
            content="Hello",
        )
        m2 = Message.objects.create(
            conversation=conv,
            sender=self.user2,
            content="World",
        )

        messages = list(conv.messages.all())
        self.assertEqual(messages, [m1, m2])

    def test_unique_conversation_participant_constraint(self):
        conv = Conversation.objects.create(
            type=ConversationType.DIRECT,
            created_by=self.user1,
        )
        ConversationParticipant.objects.create(
            conversation=conv,
            user=self.user1,
            status=ParticipantStatus.ACCEPTED,
        )
        with self.assertRaises(IntegrityError):
            ConversationParticipant.objects.create(
                conversation=conv,
                user=self.user1,
                status=ParticipantStatus.ACCEPTED,
            )

    def test_conversation_with_board_link(self):
        board = Board.objects.create(owner=self.user1, title="Project Board")
        conv = Conversation.objects.create(
            type=ConversationType.GROUP,
            title="Board Discussion",
            created_by=self.user1,
            board=board,
        )
        self.assertEqual(conv.board, board)
        self.assertIn(conv, board.board_chats.all())

    def test_participant_cleared_at_and_last_read_at(self):
        conv = Conversation.objects.create(
            type=ConversationType.DIRECT,
            created_by=self.user1,
        )
        now = timezone.now()
        participant = ConversationParticipant.objects.create(
            conversation=conv,
            user=self.user1,
            status=ParticipantStatus.ACCEPTED,
            cleared_at=now,
            last_read_at=now,
        )
        participant.refresh_from_db()
        self.assertIsNotNone(participant.cleared_at)
        self.assertIsNotNone(participant.last_read_at)

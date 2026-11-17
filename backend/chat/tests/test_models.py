from django.contrib.auth import get_user_model
from django.test import TestCase
from kanban.models import Board
from chat.models import Message

User = get_user_model()


class ChatModelTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="alice@example.com",
            display_name="Alice",
            password="password123",
        )
        self.collaborator = User.objects.create_user(
            email="bob@example.com",
            display_name="Bob",
            password="password123",
        )
        self.board = Board.objects.create(owner=self.owner, title="Sprint Board")
        self.board.collaborators.add(self.collaborator)

    def test_create_board_message_and_ordering(self):
        m1 = Message.objects.create(
            board=self.board,
            sender=self.owner,
            content="Hello board",
        )
        m2 = Message.objects.create(
            board=self.board,
            sender=self.collaborator,
            content="Ready to work",
        )

        messages = list(self.board.chat_messages.all())
        self.assertEqual(messages, [m1, m2])
        self.assertEqual(m1.board_id, self.board.id)
        self.assertEqual(m1.sender_id, self.owner.id)
        self.assertIsNotNone(m1.created_at)

    def test_cascade_delete_when_board_deleted(self):
        Message.objects.create(
            board=self.board,
            sender=self.owner,
            content="Will be deleted with board",
        )
        self.assertEqual(Message.objects.count(), 1)
        self.board.delete()
        self.assertEqual(Message.objects.count(), 0)

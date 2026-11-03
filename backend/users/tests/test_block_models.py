from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from users.models import UserBlock

User = get_user_model()


class UserBlockModelTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(email="alice@example.com", password="password123", display_name="Alice")
        self.user2 = User.objects.create_user(email="bob@example.com", password="password123", display_name="Bob")

    def test_create_user_block(self):
        block = UserBlock.objects.create(blocker=self.user1, blocked=self.user2)
        self.assertEqual(block.blocker, self.user1)
        self.assertEqual(block.blocked, self.user2)
        self.assertIsNotNone(block.created_at)
        self.assertTrue(self.user1.is_blocking(self.user2))
        self.assertTrue(self.user2.is_blocked_by(self.user1))
        self.assertFalse(self.user2.is_blocking(self.user1))

    def test_prevent_self_blocking_constraint(self):
        with self.assertRaises(IntegrityError):
            UserBlock.objects.create(blocker=self.user1, blocked=self.user1)

    def test_unique_user_block_constraint(self):
        UserBlock.objects.create(blocker=self.user1, blocked=self.user2)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                UserBlock.objects.create(blocker=self.user1, blocked=self.user2)

    def test_mutual_blocking_allowed(self):
        UserBlock.objects.create(blocker=self.user1, blocked=self.user2)
        UserBlock.objects.create(blocker=self.user2, blocked=self.user1)
        self.assertTrue(self.user1.is_blocking(self.user2))
        self.assertTrue(self.user2.is_blocking(self.user1))

    def test_cascade_delete_on_user_removal(self):
        UserBlock.objects.create(blocker=self.user1, blocked=self.user2)
        self.user1.delete()
        self.assertEqual(UserBlock.objects.count(), 0)

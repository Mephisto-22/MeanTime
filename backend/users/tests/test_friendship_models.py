from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from users.models import Friendship, FriendshipStatus

User = get_user_model()


class FriendshipModelTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(
            email="alice@example.com",
            password="password123",
            display_name="Alice",
        )
        self.user2 = User.objects.create_user(
            email="bob@example.com",
            password="password123",
            display_name="Bob",
        )

    def test_create_friendship_default_status_is_pending(self):
        friendship = Friendship.objects.create(
            requester=self.user1,
            receiver=self.user2,
        )
        self.assertEqual(friendship.status, FriendshipStatus.PENDING)
        self.assertIsNotNone(friendship.created_at)
        self.assertIsNotNone(friendship.updated_at)
        self.assertIn("Alice", str(friendship))
        self.assertIn("Bob", str(friendship))

    def test_friendship_status_choices(self):
        friendship = Friendship.objects.create(
            requester=self.user1,
            receiver=self.user2,
            status=FriendshipStatus.ACCEPTED,
        )
        self.assertEqual(friendship.status, FriendshipStatus.ACCEPTED)

    def test_prevent_self_friending_constraint(self):
        with self.assertRaises(IntegrityError):
            Friendship.objects.create(
                requester=self.user1,
                receiver=self.user1,
            )

    def test_unique_requester_receiver_constraint(self):
        Friendship.objects.create(
            requester=self.user1,
            receiver=self.user2,
        )
        with self.assertRaises(IntegrityError):
            Friendship.objects.create(
                requester=self.user1,
                receiver=self.user2,
            )

    def test_cascade_delete_on_user_removal(self):
        Friendship.objects.create(
            requester=self.user1,
            receiver=self.user2,
        )
        self.assertEqual(Friendship.objects.count(), 1)
        self.user1.delete()
        self.assertEqual(Friendship.objects.count(), 0)

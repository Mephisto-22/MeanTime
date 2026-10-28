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

    def test_get_friends_returns_accepted_friends_symmetrically(self):
        # Alice invites Bob; accepted
        Friendship.objects.create(
            requester=self.user1,
            receiver=self.user2,
            status=FriendshipStatus.ACCEPTED,
        )
        self.assertIn(self.user2, self.user1.get_friends())
        self.assertIn(self.user1, self.user2.get_friends())
        self.assertTrue(self.user1.is_friends_with(self.user2))
        self.assertTrue(self.user2.is_friends_with(self.user1))

    def test_get_friends_ignores_pending_and_declined(self):
        # Alice invites Bob; still pending
        Friendship.objects.create(
            requester=self.user1,
            receiver=self.user2,
            status=FriendshipStatus.PENDING,
        )
        self.assertNotIn(self.user2, self.user1.get_friends())
        self.assertNotIn(self.user1, self.user2.get_friends())
        self.assertFalse(self.user1.is_friends_with(self.user2))
        self.assertFalse(self.user2.is_friends_with(self.user1))

    def test_user_can_have_zero_friends(self):
        self.assertEqual(self.user1.get_friends().count(), 0)
        self.assertFalse(self.user1.is_friends_with(self.user2))

    def test_user_can_have_multiple_friends(self):
        user3 = User.objects.create_user(
            email="carol@example.com",
            password="password123",
            display_name="Carol",
        )
        # Alice invites Bob (accepted)
        Friendship.objects.create(
            requester=self.user1,
            receiver=self.user2,
            status=FriendshipStatus.ACCEPTED,
        )
        # Carol invites Alice (accepted)
        Friendship.objects.create(
            requester=user3,
            receiver=self.user1,
            status=FriendshipStatus.ACCEPTED,
        )
        alice_friends = self.user1.get_friends()
        self.assertEqual(alice_friends.count(), 2)
        self.assertIn(self.user2, alice_friends)
        self.assertIn(user3, alice_friends)

    def test_friendship_model_does_not_have_friend_methods(self):
        self.assertFalse(hasattr(Friendship, "get_friends"))
        self.assertFalse(hasattr(Friendship, "is_friends_with"))

    def test_get_friends_ignores_declined_and_blocked(self):
        Friendship.objects.create(
            requester=self.user1,
            receiver=self.user2,
            status=FriendshipStatus.DECLINED,
        )
        self.assertNotIn(self.user2, self.user1.get_friends())
        self.assertFalse(self.user1.is_friends_with(self.user2))

        user3 = User.objects.create_user(
            email="blocked@example.com",
            password="password123",
            display_name="Blocked",
        )
        Friendship.objects.create(
            requester=self.user1,
            receiver=user3,
            status=FriendshipStatus.BLOCKED,
        )
        self.assertNotIn(user3, self.user1.get_friends())
        self.assertFalse(self.user1.is_friends_with(user3))

    def test_cascade_delete_on_receiver_removal(self):
        Friendship.objects.create(
            requester=self.user1,
            receiver=self.user2,
        )
        self.assertEqual(Friendship.objects.count(), 1)
        self.user2.delete()
        self.assertEqual(Friendship.objects.count(), 0)

    def test_is_friends_with_guards_invalid_users(self):
        from django.contrib.auth.models import AnonymousUser
        self.assertFalse(self.user1.is_friends_with(None))
        self.assertFalse(self.user1.is_friends_with(self.user1))
        self.assertFalse(self.user1.is_friends_with(AnonymousUser()))

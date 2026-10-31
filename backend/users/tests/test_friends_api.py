import json
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from ninja_jwt.tokens import RefreshToken
from users.models import Friendship, FriendshipStatus, UserBlock

User = get_user_model()


class UserSearchAPITests(TestCase):
    def setUp(self):
        self.client = Client()
        self.me = User.objects.create_user(email="me@example.com", password="password123", display_name="My User")
        self.target = User.objects.create_user(email="alice@example.com", password="password123", display_name="Alice Smith")
        self.bob = User.objects.create_user(email="bob@example.com", password="password123", display_name="Bob Jones")
        self.inactive = User.objects.create_user(email="inactive@example.com", password="password123", display_name="Inactive User", is_active=False)

        refresh = RefreshToken.for_user(self.me)
        self.auth_headers = {"HTTP_AUTHORIZATION": f"Bearer {str(refresh.access_token)}"}
        self.search_url = "/api/users/search"

    def test_search_unauthenticated_returns_401(self):
        response = self.client.get(f"{self.search_url}?q=alice@example.com")
        self.assertEqual(response.status_code, 401)

    def test_search_empty_query_returns_400(self):
        response = self.client.get(f"{self.search_url}?q=%20%20", **self.auth_headers)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"detail": "Search query cannot be empty."})

    def test_search_exact_match_email_case_insensitive(self):
        response = self.client.get(f"{self.search_url}?q=ALICE@EXAMPLE.COM", **self.auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], self.target.id)
        self.assertEqual(data[0]["relationship_status"], "none")

    def test_search_exact_match_display_name_case_insensitive(self):
        response = self.client.get(f"{self.search_url}?q=alice%20smith", **self.auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], self.target.id)

    def test_search_partial_query_returns_empty(self):
        response = self.client.get(f"{self.search_url}?q=alice", **self.auth_headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_search_excludes_self_and_inactive(self):
        response = self.client.get(f"{self.search_url}?q=me@example.com", **self.auth_headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

        response_inactive = self.client.get(f"{self.search_url}?q=inactive@example.com", **self.auth_headers)
        self.assertEqual(response_inactive.status_code, 200)
        self.assertEqual(response_inactive.json(), [])

    def test_search_excludes_blocked_users_in_both_directions(self):
        UserBlock.objects.create(blocker=self.me, blocked=self.target)
        UserBlock.objects.create(blocker=self.bob, blocked=self.me)

        # target blocked by me
        res1 = self.client.get(f"{self.search_url}?q=alice@example.com", **self.auth_headers)
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.json(), [])

        # bob who blocked me
        res2 = self.client.get(f"{self.search_url}?q=bob@example.com", **self.auth_headers)
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json(), [])

    def test_search_annotates_relationship_status(self):
        # Friendship accepted
        Friendship.objects.create(requester=self.me, receiver=self.target, status=FriendshipStatus.ACCEPTED)
        res = self.client.get(f"{self.search_url}?q=alice@example.com", **self.auth_headers)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()[0]["relationship_status"], "friend")

        # Pending outgoing
        Friendship.objects.filter(requester=self.me, receiver=self.target).delete()
        Friendship.objects.create(requester=self.me, receiver=self.target, status=FriendshipStatus.PENDING)
        res2 = self.client.get(f"{self.search_url}?q=alice@example.com", **self.auth_headers)
        self.assertEqual(res2.json()[0]["relationship_status"], "pending_outgoing")

        # Pending incoming
        Friendship.objects.filter(requester=self.me, receiver=self.target).delete()
        Friendship.objects.create(requester=self.target, receiver=self.me, status=FriendshipStatus.PENDING)
        res3 = self.client.get(f"{self.search_url}?q=alice@example.com", **self.auth_headers)
        self.assertEqual(res3.json()[0]["relationship_status"], "pending_incoming")

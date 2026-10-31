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


class FriendRequestAPITests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user1 = User.objects.create_user(email="u1@example.com", password="password123", display_name="User 1")
        self.user2 = User.objects.create_user(email="u2@example.com", password="password123", display_name="User 2")
        refresh1 = RefreshToken.for_user(self.user1)
        self.auth1 = {"HTTP_AUTHORIZATION": f"Bearer {str(refresh1.access_token)}"}
        refresh2 = RefreshToken.for_user(self.user2)
        self.auth2 = {"HTTP_AUTHORIZATION": f"Bearer {str(refresh2.access_token)}"}

    def test_send_request_success(self):
        res = self.client.post(f"/api/users/friends/requests/{self.user2.id}", **self.auth1)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["user"]["id"], self.user2.id)
        self.assertTrue(Friendship.objects.filter(requester=self.user1, receiver=self.user2, status=FriendshipStatus.PENDING).exists())

    def test_send_request_to_self_returns_400(self):
        res = self.client.post(f"/api/users/friends/requests/{self.user1.id}", **self.auth1)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"detail": "You cannot send a friend request to yourself."})

    def test_send_request_nonexistent_user_returns_404(self):
        res = self.client.post("/api/users/friends/requests/99999", **self.auth1)
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json(), {"detail": "User not found."})

    def test_send_request_when_blocked_returns_400(self):
        UserBlock.objects.create(blocker=self.user2, blocked=self.user1)
        res = self.client.post(f"/api/users/friends/requests/{self.user2.id}", **self.auth1)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"detail": "Unable to send friend request."})

    def test_send_request_already_friends_returns_400(self):
        Friendship.objects.create(requester=self.user1, receiver=self.user2, status=FriendshipStatus.ACCEPTED)
        res = self.client.post(f"/api/users/friends/requests/{self.user2.id}", **self.auth1)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"detail": "You are already friends with this user."})

    def test_send_request_duplicate_pending_returns_409(self):
        Friendship.objects.create(requester=self.user1, receiver=self.user2, status=FriendshipStatus.PENDING)
        res = self.client.post(f"/api/users/friends/requests/{self.user2.id}", **self.auth1)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json(), {"detail": "Friend request already sent."})

    def test_send_request_reciprocal_pending_returns_400(self):
        Friendship.objects.create(requester=self.user2, receiver=self.user1, status=FriendshipStatus.PENDING)
        res = self.client.post(f"/api/users/friends/requests/{self.user2.id}", **self.auth1)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"detail": "This user has already sent you a friend request. Accept their request instead."})

    def test_accept_request_success(self):
        Friendship.objects.create(requester=self.user1, receiver=self.user2, status=FriendshipStatus.PENDING)
        res = self.client.post(f"/api/users/friends/requests/{self.user1.id}/accept", **self.auth2)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["id"], self.user1.id)
        self.assertTrue(self.user1.is_friends_with(self.user2))

    def test_accept_nonexistent_request_returns_404(self):
        res = self.client.post(f"/api/users/friends/requests/{self.user1.id}/accept", **self.auth2)
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json(), {"detail": "Pending friend request not found."})

    def test_decline_request_success_deletes_record(self):
        Friendship.objects.create(requester=self.user1, receiver=self.user2, status=FriendshipStatus.PENDING)
        res = self.client.post(f"/api/users/friends/requests/{self.user1.id}/decline", **self.auth2)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"detail": "Friend request declined."})
        self.assertFalse(Friendship.objects.filter(requester=self.user1, receiver=self.user2).exists())

    def test_cancel_outgoing_request_success_deletes_record(self):
        Friendship.objects.create(requester=self.user1, receiver=self.user2, status=FriendshipStatus.PENDING)
        res = self.client.delete(f"/api/users/friends/requests/{self.user2.id}", **self.auth1)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"detail": "Friend request cancelled."})
        self.assertFalse(Friendship.objects.filter(requester=self.user1, receiver=self.user2).exists())

    def test_list_requests_grouped_incoming_outgoing(self):
        user3 = User.objects.create_user(email="u3@example.com", password="password123", display_name="User 3")
        Friendship.objects.create(requester=self.user1, receiver=self.user2, status=FriendshipStatus.PENDING)
        Friendship.objects.create(requester=user3, receiver=self.user1, status=FriendshipStatus.PENDING)

        res = self.client.get("/api/users/friends/requests", **self.auth1)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["incoming"]), 1)
        self.assertEqual(data["incoming"][0]["user"]["id"], user3.id)
        self.assertEqual(len(data["outgoing"]), 1)
        self.assertEqual(data["outgoing"][0]["user"]["id"], self.user2.id)


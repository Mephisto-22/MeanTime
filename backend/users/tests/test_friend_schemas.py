from datetime import datetime
from django.test import TestCase
from pydantic import ValidationError
from users.schemas import UserSearchResultOut, FriendRequestOut, FriendRequestsListOut, UserOut


class FriendSchemaTests(TestCase):
    def test_user_search_result_out_valid(self):
        payload = {
            "id": 1,
            "email": "alice@example.com",
            "display_name": "Alice",
            "timezone": "UTC",
            "relationship_status": "friend",
        }
        obj = UserSearchResultOut(**payload)
        self.assertEqual(obj.relationship_status, "friend")

    def test_user_search_result_out_invalid_relationship_status(self):
        with self.assertRaises(ValidationError):
            UserSearchResultOut(
                id=1,
                email="alice@example.com",
                display_name="Alice",
                timezone="UTC",
                relationship_status="invalid_status",
            )

    def test_friend_request_out_and_list_out(self):
        user_data = {
            "id": 2,
            "email": "bob@example.com",
            "display_name": "Bob",
            "timezone": "UTC",
            "created_at": datetime.now(),
        }
        user_out = UserOut(**user_data)
        req_out = FriendRequestOut(id=10, user=user_out, created_at=datetime.now())
        list_out = FriendRequestsListOut(incoming=[req_out], outgoing=[])
        self.assertEqual(len(list_out.incoming), 1)
        self.assertEqual(len(list_out.outgoing), 0)

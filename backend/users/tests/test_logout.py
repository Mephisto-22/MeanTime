import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from ninja_jwt.tokens import AccessToken, RefreshToken
from ninja_jwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from ninja_jwt.utils import datetime_from_epoch

User = get_user_model()


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class LogoutTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="logout@example.com", password="SecurePassword982!", display_name="Logout User")
        self.tokens = self.login()

    def post(self, route, data):
        return self.client.post(f"/api/auth/{route}", json.dumps(data), content_type="application/json")

    def login(self, email="logout@example.com"):
        return self.post("login", {"email": email, "password": "SecurePassword982!"}).json()

    def logout(self, **changes):
        return self.post("logout", {"refresh_token": self.tokens["refresh_token"], "access_token": self.tokens["access_token"], **changes})

    def me(self, token):
        return self.client.get("/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_logout_persists_blacklist_and_revokes_both_tokens(self):
        self.assertEqual(self.logout().status_code, 200)
        refresh = RefreshToken(self.tokens["refresh_token"], verify=False)
        self.assertTrue(BlacklistedToken.objects.filter(token__jti=refresh["jti"]).exists())
        self.assertEqual(self.me(self.tokens["access_token"]).status_code, 401)
        self.assertEqual(self.post("refresh", {"refresh_token": self.tokens["refresh_token"]}).status_code, 401)

    def test_refresh_only_logout_also_revokes_linked_access(self):
        self.assertEqual(self.post("logout", {"refresh_token": self.tokens["refresh_token"]}).status_code, 200)
        self.assertEqual(self.me(self.tokens["access_token"]).status_code, 401)

    def test_access_created_by_refresh_before_logout_is_also_revoked(self):
        renewed = self.post("refresh", {"refresh_token": self.tokens["refresh_token"]}).json()["access_token"]
        self.assertEqual(self.logout().status_code, 200)
        self.assertEqual(self.me(renewed).status_code, 401)

    def test_other_sessions_and_new_logins_remain_valid(self):
        other_session = self.login()
        self.logout()
        self.assertEqual(self.me(other_session["access_token"]).status_code, 200)
        self.assertEqual(self.post("refresh", {"refresh_token": other_session["refresh_token"]}).status_code, 200)
        self.assertEqual(self.me(self.login()["access_token"]).status_code, 200)

    def test_repeated_logout_is_idempotent(self):
        self.assertEqual(self.logout().status_code, 200)
        count = BlacklistedToken.objects.count()
        self.assertEqual(self.logout().status_code, 200)
        self.assertEqual(BlacklistedToken.objects.count(), count)

    def test_logout_works_with_an_expired_access_token(self):
        access = AccessToken(self.tokens["access_token"])
        access["exp"] = int((timezone.now() - timedelta(seconds=1)).timestamp())
        self.assertEqual(self.logout(access_token=str(access)).status_code, 200)
        self.assertEqual(self.me(self.tokens["access_token"]).status_code, 401)

    def test_other_user_or_session_tokens_cannot_be_blacklisted_together(self):
        User.objects.create_user(email="other@example.com", password="SecurePassword982!")
        for access in [self.login("other@example.com")["access_token"], self.login()["access_token"]]:
            self.assertEqual(self.logout(access_token=access).status_code, 400)
            self.assertEqual(self.me(access).status_code, 200)
        self.assertEqual(BlacklistedToken.objects.count(), 0)

    def test_invalid_token_types_and_signatures_are_rejected(self):
        self.assertEqual(self.logout(refresh_token=self.tokens["access_token"]).status_code, 400)
        self.assertEqual(self.logout(refresh_token=self.tokens["refresh_token"] + "tampered").status_code, 401)
        self.assertEqual(self.post("logout", {}).status_code, 422)
        self.assertEqual(BlacklistedToken.objects.count(), 0)

    def test_expired_refresh_is_rejected(self):
        refresh = RefreshToken(self.tokens["refresh_token"])
        refresh["exp"] = int((timezone.now() - timedelta(seconds=1)).timestamp())
        self.assertEqual(self.logout(refresh_token=str(refresh)).status_code, 401)

    def test_legacy_tokens_can_be_revoked_and_refreshed_access_is_linked(self):
        legacy = RefreshToken.for_user(self.user)
        access = str(legacy.access_token)
        renewed = self.post("refresh", {"refresh_token": str(legacy)}).json()["access_token"]
        self.assertEqual(self.post("logout", {"refresh_token": str(legacy), "access_token": access}).status_code, 200)
        self.assertEqual(self.me(access).status_code, 401)
        self.assertEqual(self.me(renewed).status_code, 401)

    def test_blacklist_retention_covers_access_that_outlives_refresh(self):
        refresh = RefreshToken(self.tokens["refresh_token"])
        self.logout()
        outstanding = OutstandingToken.objects.get(jti=refresh["jti"])
        self.assertGreater(outstanding.expires_at, datetime_from_epoch(refresh["exp"]))

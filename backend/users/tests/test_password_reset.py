import json
import re
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    FRONTEND_URL="http://localhost:3000",
)
class PasswordResetTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="reset@example.com", password="OriginalSecure482!", display_name="Reset User"
        )
        self.link = {
            "uid": urlsafe_base64_encode(force_bytes(self.user.pk)),
            "token": default_token_generator.make_token(self.user),
        }

    def post(self, path, payload):
        return self.client.post(f"/api/auth/{path}", json.dumps(payload), content_type="application/json")

    def confirm(self, **changes):
        return self.post("password-reset/confirm", {
            **self.link, "password": "ReplacementSecure759!", "password_confirm": "ReplacementSecure759!", **changes,
        })

    def login(self, password="OriginalSecure482!"):
        return self.post("login", {"email": self.user.email, "password": password})

    def test_request_is_generic_does_not_lock_and_delivers_valid_link(self):
        known = self.post("password-reset", {"email": " RESET@example.com "})
        unknown = self.post("password-reset", {"email": "unknown@example.com"})
        self.assertEqual(known.status_code, 200)
        self.assertEqual(known.json(), unknown.json())
        self.assertEqual(len(mail.outbox), 1)
        self.assertNotIn("token", known.json())
        self.user.refresh_from_db()
        self.assertFalse(self.user.resetting_password)
        url = re.search(r"http://localhost:3000/reset-password#[^\s]+", mail.outbox[0].body).group()
        parsed = urlsplit(url)
        self.assertEqual(parsed.query, "")
        fragment = parse_qs(parsed.fragment)
        self.assertTrue(default_token_generator.check_token(self.user, fragment["token"][0]))
        self.assertEqual(self.login().status_code, 200)

    def test_inactive_or_unusable_accounts_do_not_receive_links(self):
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.post("password-reset", {"email": self.user.email}).status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_delivery_failure_does_not_reveal_account_or_lock_it(self):
        with patch("users.api.deliver_reset_link", side_effect=RuntimeError("Delivery down")):
            with self.assertLogs("users.api", level="ERROR"):
                response = self.post("password-reset", {"email": self.user.email})
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.resetting_password)

    def test_verified_link_sets_flag_and_blocks_login_refresh_and_me(self):
        tokens = self.login().json()
        response = self.post("password-reset/validate", self.link)
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.resetting_password)
        self.assertIsNotNone(self.user.password_reset_started_at)
        self.assertEqual(self.login().status_code, 403)
        self.assertEqual(self.post("refresh", {"refresh_token": tokens["refresh_token"]}).status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}").status_code, 401)

    def test_validation_does_not_extend_active_reset(self):
        self.post("password-reset/validate", self.link)
        self.user.refresh_from_db()
        started = self.user.password_reset_started_at
        self.post("password-reset/validate", self.link)
        self.user.refresh_from_db()
        self.assertEqual(self.user.password_reset_started_at, started)

    def test_abandoned_reset_expires_and_login_recovers(self):
        self.user.resetting_password = True
        self.user.password_reset_started_at = timezone.now() - timedelta(seconds=settings.PASSWORD_RESET_TIMEOUT + 1)
        self.user.save()
        self.assertEqual(self.login().status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.resetting_password)

    def test_confirm_changes_password_clears_flag_and_invalidates_link(self):
        self.post("password-reset/validate", self.link)
        self.assertEqual(self.confirm().status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("ReplacementSecure759!"))
        self.assertNotEqual(self.user.password, "ReplacementSecure759!")
        self.assertFalse(self.user.resetting_password)
        self.assertIsNone(self.user.password_reset_started_at)
        self.assertEqual(self.user.password_version, 1)
        self.assertEqual(self.confirm().status_code, 400)
        self.assertEqual(self.post("password-reset/validate", self.link).status_code, 400)
        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(self.login("ReplacementSecure759!").status_code, 200)

    def test_old_jwt_tokens_rejected_after_reset_and_new_tokens_work(self):
        old = self.login().json()
        self.assertEqual(self.confirm().status_code, 200)
        self.assertEqual(self.post("refresh", {"refresh_token": old["refresh_token"]}).status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {old['access_token']}").status_code, 401)
        new = self.login("ReplacementSecure759!").json()
        self.assertEqual(self.client.get("/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {new['access_token']}").status_code, 200)
        self.assertEqual(self.post("refresh", {"refresh_token": new["refresh_token"]}).status_code, 200)

    def test_invalid_links_do_not_change_password_or_flag(self):
        for link in [{**self.link, "token": "invalid"}, {**self.link, "uid": "invalid"}]:
            self.assertEqual(self.post("password-reset/validate", link).status_code, 400)
            self.assertEqual(self.confirm(**link).status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.resetting_password)
        self.assertTrue(self.user.check_password("OriginalSecure482!"))

    def test_expired_link_rejected(self):
        future = default_token_generator._now() + timedelta(seconds=settings.PASSWORD_RESET_TIMEOUT + 1)
        with patch.object(default_token_generator, "_now", return_value=future):
            self.assertEqual(self.post("password-reset/validate", self.link).status_code, 400)
            self.assertEqual(self.confirm().status_code, 400)

    def test_mismatch_and_weak_password_leave_existing_password_unchanged(self):
        self.assertEqual(self.confirm(password_confirm="DoesNotMatch982!").status_code, 400)
        self.assertEqual(self.confirm(password="123456789", password_confirm="123456789").status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OriginalSecure482!"))

    def test_other_account_cannot_use_reset_link(self):
        other = User.objects.create_user(email="other@example.com", password="AnotherSecure482!")
        self.assertEqual(self.confirm(uid=urlsafe_base64_encode(force_bytes(other.pk))).status_code, 400)

    def test_inactive_account_cannot_confirm_existing_link(self):
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.confirm().status_code, 400)

    def test_bad_email_and_short_password_rejected(self):
        self.assertEqual(self.post("password-reset", {"email": "invalid"}).status_code, 422)
        self.assertEqual(self.confirm(password="short", password_confirm="short").status_code, 422)

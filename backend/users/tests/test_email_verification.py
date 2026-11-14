import re
from datetime import timedelta
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from ninja_jwt.tokens import RefreshToken


User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EmailVerificationTests(TestCase):
    def post(self, route, data):
        return self.client.post(f"/api/auth/{route}", data, content_type="application/json")

    def register(self):
        return self.post("register", {"email": "new@example.com", "password": "Cedar!Orbit72", "display_name": "New User"})

    def token(self):
        link = re.search(r"http://localhost:3000/confirm-email#[^\s]+", mail.outbox[-1].body).group()
        return parse_qs(urlsplit(link).fragment)["token"][0]

    def login(self):
        return self.post("login", {"email": "new@example.com", "password": "Cedar!Orbit72"})

    def test_registration_mail_confirmation_and_login(self):
        response = self.register()
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.json()["is_verified"])
        self.assertNotIn("access_token", response.json())
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["new@example.com"])
        self.assertEqual(self.login().status_code, 403)
        token = self.token()
        self.assertEqual(self.post("email-verification/confirm", {"token": token}).status_code, 200)
        self.assertEqual(self.post("email-verification/confirm", {"token": token}).status_code, 200)
        self.assertEqual(self.login().status_code, 200)

    def test_unverified_users_cannot_use_refresh_or_protected_routes(self):
        self.register()
        user = User.objects.get(email="new@example.com")
        refresh = RefreshToken.for_user(user)
        self.assertEqual(self.post("refresh", {"refresh_token": str(refresh)}).status_code, 401)
        response = self.client.get("/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.assertEqual(response.status_code, 401)

    def test_tampered_expired_wrong_purpose_and_changed_email_links(self):
        from django.core import signing
        self.register()
        token = self.token()
        self.assertEqual(self.post("email-verification/confirm", {"token": token + "bad"}).status_code, 400)
        with override_settings(EMAIL_VERIFICATION_TIMEOUT=-1):
            self.assertEqual(self.post("email-verification/confirm", {"token": token}).status_code, 400)
        wrong = signing.dumps({"uid": 1}, salt="password-reset")
        self.assertEqual(self.post("email-verification/confirm", {"token": wrong}).status_code, 400)
        User.objects.filter(email="new@example.com").update(email="changed@example.com")
        self.assertEqual(self.post("email-verification/confirm", {"token": token}).status_code, 400)

    def test_resend_cooldown_generic_response_and_old_link_revocation(self):
        self.register()
        old = self.token()
        url = "email-verification/resend"
        unknown = self.post(url, {"email": "unknown@example.com"})
        known = self.post(url, {"email": "new@example.com"})
        self.assertEqual(known.json(), unknown.json())
        self.assertEqual(len(mail.outbox), 1)
        User.objects.filter(email="new@example.com").update(email_verification_sent_at=timezone.now() - timedelta(minutes=2))
        self.assertEqual(self.post(url, {"email": " NEW@example.com "}).status_code, 200)
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(self.post("email-verification/confirm", {"token": old}).status_code, 400)
        self.assertEqual(self.post("email-verification/confirm", {"token": self.token()}).status_code, 200)
        self.post(url, {"email": "new@example.com"})
        self.assertEqual(len(mail.outbox), 2)

    def test_delivery_failure_rolls_back_account_and_resend_keeps_old_link(self):
        with patch("users.api.send_transactional_email", side_effect=RuntimeError("Offline")):
            self.assertEqual(self.register().status_code, 503)
        self.assertFalse(User.objects.filter(email="new@example.com").exists())
        self.register()
        old = self.token()
        User.objects.filter(email="new@example.com").update(email_verification_sent_at=None)
        with patch("users.api.send_transactional_email", side_effect=RuntimeError("Offline")):
            self.assertEqual(self.post("email-verification/resend", {"email": "new@example.com"}).status_code, 503)
        self.assertEqual(self.post("email-verification/confirm", {"token": old}).status_code, 200)

    def test_inactive_user_cannot_confirm(self):
        self.register()
        token = self.token()
        User.objects.filter(email="new@example.com").update(is_active=False)
        self.assertEqual(self.post("email-verification/confirm", {"token": token}).status_code, 400)

    def test_resetting_password_does_not_bypass_email_confirmation(self):
        self.register()
        self.post("password-reset", {"email": "new@example.com"})
        url = re.search(r"http://localhost:3000/reset-password#[^\s]+", mail.outbox[-1].body).group()
        values = parse_qs(urlsplit(url).fragment)
        link = {"uid": values["uid"][0], "token": values["token"][0]}
        self.assertEqual(self.post("password-reset/confirm", {**link, "password": "NewCedar!Orbit82", "password_confirm": "NewCedar!Orbit82"}).status_code, 200)
        self.assertFalse(User.objects.get(email="new@example.com").is_verified)
        self.assertEqual(self.post("login", {"email": "new@example.com", "password": "NewCedar!Orbit82"}).status_code, 403)

    def test_console_url_is_not_mime_wrapped(self):
        from contextlib import redirect_stdout
        from io import StringIO
        output = StringIO()
        with override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"), redirect_stdout(output):
            self.assertEqual(self.register().status_code, 201)
        token = parse_qs(urlsplit(re.search(r"http://localhost:3000/confirm-email#[^\s]+", output.getvalue()).group()).fragment)["token"][0]
        self.assertEqual(self.post("email-verification/confirm", {"token": token}).status_code, 200)


class SESDeliveryTests(TestCase):
    @override_settings(AWS_SES_REGION="us-east-2", DEFAULT_FROM_EMAIL="noreply@example.com")
    def test_backend_uses_sdk_without_static_credentials(self):
        from django.core.mail import EmailMessage
        from services.mail import SESBackend
        with patch("boto3.client") as client:
            self.assertEqual(SESBackend().send_messages([EmailMessage("Confirm", "Link", "noreply@example.com", ["user@example.com"])]), 1)
        self.assertEqual(client.call_args.args, ("sesv2",))
        self.assertEqual(client.call_args.kwargs["region_name"], "us-east-2")
        payload = client.return_value.send_email.call_args.kwargs
        self.assertEqual(payload["Destination"]["ToAddresses"], ["user@example.com"])
        self.assertIn(b"Link", payload["Content"]["Raw"]["Data"])

    @override_settings(AWS_SES_REGION="")
    def test_missing_configuration_and_provider_failure_are_not_silent(self):
        from django.core.exceptions import ImproperlyConfigured
        from django.core.mail import EmailMessage
        from services.mail import SESBackend
        with self.assertRaises(ImproperlyConfigured):
            SESBackend().send_messages([EmailMessage("Confirm", "Link", to=["user@example.com"])])
        with override_settings(AWS_SES_REGION="us-east-2", DEFAULT_FROM_EMAIL="noreply@example.com"), patch("boto3.client") as client:
            client.return_value.send_email.side_effect = RuntimeError("SES unavailable")
            with self.assertRaises(RuntimeError):
                SESBackend().send_messages([EmailMessage("Confirm", "Link", to=["user@example.com"])] )

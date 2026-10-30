import base64
import hashlib
import io
import json
import time
import urllib.error
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from users.models import ExternalAccount

User = get_user_model()

START_URL = "/api/auth/oauth/google/start"
CALLBACK_URL = "/api/auth/oauth/google/callback"
REDIRECT_URI = "http://localhost:3000/api/auth/oauth/google/callback"
URLOPEN = "users.oauth.urllib.request.urlopen"


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def id_token(claims):
    """An ID token as Google's token endpoint returns it. The signature isn't checked."""
    header = b64url(json.dumps({"alg": "RS256"}).encode())
    return f"{header}.{b64url(json.dumps(claims).encode())}.signature"


def token_response(token):
    body = {"id_token": token, "access_token": "google-access"}
    return io.BytesIO(json.dumps(body).encode())


def address(url):
    """The URL without its query or fragment."""
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}{parts.path}"


def query(url):
    return {key: values[0] for key, values in parse_qs(urlsplit(url).query).items()}


@override_settings(
    GOOGLE_OAUTH_CLIENT_ID="client-id",
    GOOGLE_OAUTH_CLIENT_SECRET="client-secret",
    FRONTEND_URL="http://localhost:3000",
)
class GoogleSignInTests(TestCase):
    def start(self):
        """Starts sign-in and returns the query Django sent to Google."""
        response = self.client.get(START_URL)
        self.assertEqual(response.status_code, 302)
        return query(response["Location"])

    def claims(self, sent_nonce, **changes):
        return {
            "iss": "https://accounts.google.com",
            "aud": "client-id",
            "exp": time.time() + 300,
            "nonce": sent_nonce,
            "sub": "google-user-1",
            "email": "Person@Example.com",
            "email_verified": True,
            "name": "Pat Person",
            **changes,
        }

    def sign_in(self, **claim_changes):
        """Runs start and callback with Google mocked, and returns the callback's response."""
        google = self.start()
        token = id_token(self.claims(google["nonce"], **claim_changes))
        params = {"state": google["state"], "code": "auth-code"}
        with patch(URLOPEN, return_value=token_response(token)) as urlopen:
            response = self.client.get(CALLBACK_URL, params)
        self.urlopen = urlopen
        return response

    def assertLoginError(self, response, reason):
        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response["Location"], f"http://localhost:3000/login?oauth_error={reason}"
        )

    def test_providers_lists_google_only_when_configured(self):
        providers = self.client.get("/api/auth/oauth/providers")
        self.assertEqual(providers.json(), {"providers": ["google"]})
        with override_settings(GOOGLE_OAUTH_CLIENT_SECRET=""):
            providers = self.client.get("/api/auth/oauth/providers")
            self.assertEqual(providers.json(), {"providers": []})

    def test_start_redirects_to_google_with_state_nonce_and_pkce(self):
        response = self.client.get(START_URL)
        sent = query(response["Location"])
        saved = self.client.session["google_oauth"]
        challenge = b64url(hashlib.sha256(saved["verifier"].encode()).digest())

        self.assertEqual(
            address(response["Location"]), "https://accounts.google.com/o/oauth2/v2/auth"
        )
        self.assertEqual(sent["client_id"], "client-id")
        self.assertEqual(sent["redirect_uri"], REDIRECT_URI)
        self.assertEqual(sent["scope"], "openid email profile")
        self.assertEqual(sent["state"], saved["state"])
        self.assertEqual(sent["nonce"], saved["nonce"])
        self.assertEqual(sent["code_challenge_method"], "S256")
        self.assertEqual(sent["code_challenge"], challenge)
        self.assertNotIn("client-secret", response["Location"])

    def test_start_when_not_configured_returns_to_login(self):
        with override_settings(GOOGLE_OAUTH_CLIENT_ID=""):
            self.assertLoginError(self.client.get(START_URL), "unavailable")

    def test_first_sign_in_creates_user_without_password_and_returns_tokens(self):
        response = self.sign_in()

        user = User.objects.get(email="person@example.com")
        self.assertEqual(user.display_name, "Pat Person")
        self.assertFalse(user.has_usable_password())
        account = ExternalAccount.objects.get(user=user)
        self.assertEqual((account.provider, account.subject), ("google", "google-user-1"))

        self.assertEqual(address(response["Location"]), "http://localhost:3000/oauth/callback")
        self.assertEqual(urlsplit(response["Location"]).query, "")
        tokens = parse_qs(urlsplit(response["Location"]).fragment)
        me = self.client.get(
            "/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {tokens['access_token'][0]}"
        )
        self.assertEqual(me.json()["email"], "person@example.com")
        refreshed = self.client.post(
            "/api/auth/refresh",
            json.dumps({"refresh_token": tokens["refresh_token"][0]}),
            content_type="application/json",
        )
        self.assertEqual(refreshed.status_code, 200)

    def test_token_exchange_sends_code_verifier_and_secret_to_google(self):
        self.sign_in()
        url = self.urlopen.call_args.args[0]
        body = parse_qs(self.urlopen.call_args.kwargs["data"].decode())
        self.assertEqual(url, "https://oauth2.googleapis.com/token")
        self.assertEqual(body["code"], ["auth-code"])
        self.assertEqual(body["client_secret"], ["client-secret"])
        self.assertEqual(body["grant_type"], ["authorization_code"])
        self.assertEqual(body["redirect_uri"], [REDIRECT_URI])
        self.assertTrue(body["code_verifier"][0])

    def test_second_sign_in_returns_the_same_user(self):
        self.sign_in()
        # Google keeps "sub" when the email changes, so the link doesn't depend on email.
        response = self.sign_in(email="new-address@example.com")
        self.assertIn("/oauth/callback#", response["Location"])
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(ExternalAccount.objects.count(), 1)

    def test_display_name_falls_back_to_the_email_name(self):
        self.sign_in(name="")
        self.assertEqual(User.objects.get().display_name, "person")

    def test_wrong_state_is_rejected(self):
        google = self.start()
        with patch(URLOPEN) as urlopen:
            response = self.client.get(
                CALLBACK_URL, {"state": google["state"] + "x", "code": "auth-code"}
            )
        self.assertLoginError(response, "failed")
        urlopen.assert_not_called()

    def test_callback_without_start_is_rejected(self):
        with patch(URLOPEN) as urlopen:
            response = self.client.get(CALLBACK_URL, {"state": "anything", "code": "auth-code"})
        self.assertLoginError(response, "failed")
        urlopen.assert_not_called()

    def test_replayed_callback_is_rejected(self):
        google = self.start()
        token = id_token(self.claims(google["nonce"]))
        params = {"state": google["state"], "code": "auth-code"}
        with patch(URLOPEN, return_value=token_response(token)):
            self.client.get(CALLBACK_URL, params)
            self.assertLoginError(self.client.get(CALLBACK_URL, params), "failed")

    def test_cancelled_at_google(self):
        google = self.start()
        response = self.client.get(
            CALLBACK_URL, {"state": google["state"], "error": "access_denied"}
        )
        self.assertLoginError(response, "cancelled")

    def test_failed_token_exchange_is_rejected(self):
        google = self.start()
        error = urllib.error.HTTPError(
            "https://oauth2.googleapis.com/token", 400, "Bad Request", {}, None
        )
        with patch(URLOPEN, side_effect=error), self.assertLogs("users.oauth", "WARNING"):
            response = self.client.get(CALLBACK_URL, {"state": google["state"], "code": "bad-code"})
        self.assertLoginError(response, "failed")
        self.assertFalse(User.objects.exists())

    def test_invalid_id_tokens_are_rejected(self):
        cases = {
            "wrong audience": {"aud": "someone-elses-client"},
            "wrong issuer": {"iss": "https://evil.example.com"},
            "expired": {"exp": time.time() - 1},
            "wrong nonce": {"nonce": "replayed"},
            "no subject": {"sub": ""},
            "no email": {"email": None},
        }
        for name, changes in cases.items():
            with self.subTest(name):
                self.assertLoginError(self.sign_in(**changes), "failed")
        self.assertFalse(User.objects.exists())

    def test_malformed_id_token_is_rejected(self):
        google = self.start()
        params = {"state": google["state"], "code": "auth-code"}
        with patch(URLOPEN, return_value=token_response("not-a-jwt")):
            response = self.client.get(CALLBACK_URL, params)
        self.assertLoginError(response, "failed")

    def test_unverified_email_is_rejected(self):
        self.assertLoginError(self.sign_in(email_verified=False), "email_unverified")
        self.assertFalse(User.objects.exists())

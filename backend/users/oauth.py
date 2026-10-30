"""Sign in with Google: OpenID Connect's authorization code flow with PKCE.

1. /google/start saves a random state, nonce and PKCE verifier in the Django
   session and sends the browser to Google.
2. Google sends the browser back to /google/callback with a code, which Django
   exchanges for an ID token directly with Google.
3. Django finds or creates the user and sends the browser to the frontend's
   /oauth/callback page with the same JWTs as /api/auth/login. They go in the
   URL fragment, which browsers never send to a server, so no log records them.

Any failure sends the browser to /login?oauth_error=<reason> instead.
"""

import base64
import hashlib
import json
import logging
import secrets
import time
import urllib.request
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.http import HttpResponseRedirect
from ninja import Router, Schema

from users.api import issue_tokens
from users.models import ExternalAccount, User

logger = logging.getLogger(__name__)
oauth_router = Router()

GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_ISSUERS = ("https://accounts.google.com", "accounts.google.com")
SESSION_KEY = "google_oauth"


class OAuthError(Exception):
    """Sign-in failed. The reason is passed to the login page, which explains it."""

    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


class ProvidersOut(Schema):
    providers: list[str]


def google_enabled():
    return bool(settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET)


def redirect_uri():
    # Must match an "Authorized redirect URI" on the Google OAuth client exactly.
    return f"{settings.FRONTEND_URL}/api/auth/oauth/google/callback"


def login_error(reason):
    query = urlencode({"oauth_error": reason})
    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/login?{query}")


def exchange_code(code, verifier):
    """Trades the authorization code for Google's ID token, server to server."""
    data = urlencode({
        "code": code,
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
        "redirect_uri": redirect_uri(),
        "grant_type": "authorization_code",
        "code_verifier": verifier,
    }).encode()
    try:
        with urllib.request.urlopen(GOOGLE_TOKEN_URL, data=data, timeout=10) as response:
            return json.load(response)["id_token"]
    except (OSError, ValueError, KeyError, TypeError) as err:
        # OSError covers HTTP errors and timeouts; the message never includes the secret.
        logger.warning("Google token exchange failed: %s", err)
        raise OAuthError("failed") from err


def verified_claims(id_token, nonce):
    """Checks the ID token's claims and returns them.

    The signature isn't checked: the token came straight from Google's token
    endpoint over HTTPS, which OpenID Connect Core 1.0 section 3.1.3.7 accepts
    in its place.
    """
    try:
        payload = id_token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (AttributeError, IndexError, ValueError) as err:
        raise OAuthError("failed") from err
    if not isinstance(claims, dict):
        raise OAuthError("failed")
    expires = claims.get("exp")
    valid = (
        claims.get("iss") in GOOGLE_ISSUERS
        and claims.get("aud") == settings.GOOGLE_OAUTH_CLIENT_ID
        and isinstance(expires, (int, float)) and expires > time.time()
        and claims.get("nonce") == nonce
        and all(isinstance(claims.get(name), str) and claims[name] for name in ("sub", "email"))
    )
    if not valid:
        raise OAuthError("failed")
    if claims.get("email_verified") is not True:
        raise OAuthError("email_unverified")
    return claims


@transaction.atomic
def user_for(claims):
    """The user linked to this Google account, or a new one without a password."""
    account = ExternalAccount.objects.select_related("user").filter(
        provider=ExternalAccount.Provider.GOOGLE, subject=claims["sub"]
    ).first()
    if account:
        return account.user
    email = claims["email"].strip().lower()
    name = (claims.get("name") or "").strip() or email.split("@")[0]
    user = User.objects.create_user(email=email, password=None, display_name=name[:50])
    ExternalAccount.objects.create(
        user=user, provider=ExternalAccount.Provider.GOOGLE, subject=claims["sub"]
    )
    return user


@oauth_router.get(
    "/providers", response=ProvidersOut, auth=None, summary="List the sign-in providers set up"
)
def providers(request):
    """The frontend shows a sign-in button for each provider listed."""
    return {"providers": [ExternalAccount.Provider.GOOGLE] if google_enabled() else []}


@oauth_router.get("/google/start", auth=None, summary="Start signing in with Google")
def google_start(request):
    """Sends the browser to Google's sign-in page."""
    if not google_enabled():
        return login_error("unavailable")
    state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
    request.session[SESSION_KEY] = {"state": state, "nonce": nonce, "verifier": verifier}
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    query = urlencode({
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    })
    return HttpResponseRedirect(f"{GOOGLE_AUTHORIZE_URL}?{query}")


@oauth_router.get("/google/callback", auth=None, summary="Finish signing in with Google")
def google_callback(request, state: str = "", code: str = "", error: str = ""):
    """Google sends the browser here after sign-in, with a code or an error."""
    # Popped, so each start allows one callback and a replayed one fails.
    saved = request.session.pop(SESSION_KEY, None)
    try:
        if error:
            raise OAuthError("cancelled" if error == "access_denied" else "failed")
        if not saved or not code:
            raise OAuthError("failed")
        if not secrets.compare_digest(state.encode(), saved["state"].encode()):
            raise OAuthError("failed")
        claims = verified_claims(exchange_code(code, saved["verifier"]), saved["nonce"])
        user = user_for(claims)
    except OAuthError as err:
        return login_error(err.reason)
    tokens = issue_tokens(user)
    fragment = urlencode(
        {"access_token": tokens["access_token"], "refresh_token": tokens["refresh_token"]}
    )
    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/oauth/callback#{fragment}")

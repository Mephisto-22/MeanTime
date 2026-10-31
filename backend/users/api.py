import logging
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password, get_default_password_validators
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from ninja import Router
from ninja_jwt.tokens import RefreshToken

from users.schemas import (
    PasswordRequirementsIn,
    PasswordRequirementsOut,
    AuthTokenOut,
    DeleteAccountIn,
    ErrorDetail,
    LoginIn,
    RefreshIn,
    RegisterIn,
    TokenRefreshOut,
    UserOut,
    PasswordResetRequestIn,
    PasswordResetLinkIn,
    PasswordResetConfirmIn,
    UserUpdateIn,
)

User = get_user_model()
auth_router = Router()
users_router = Router(tags=["Users"])


INVALID_RESET_LINK = "This password reset link is invalid or expired. Request a new link."


def issue_tokens(user):
    """JWTs for a user who just signed in, by password or through Google."""
    refresh = RefreshToken.for_user(user)
    # Changing the password bumps password_version, which revokes these tokens.
    refresh["password_version"] = user.password_version
    return {
        "access_token": str(refresh.access_token),
        "refresh_token": str(refresh),
        "token_type": "bearer",
        "expires_in": 900,
    }


def deliver_reset_link(user):
    # The fragment keeps the secret out of frontend HTTP access logs.
    fragment = urlencode({
        "uid": urlsafe_base64_encode(force_bytes(user.pk)),
        "token": default_token_generator.make_token(user),
    })
    link = f"{settings.FRONTEND_URL}/reset-password#{fragment}"
    if settings.EMAIL_BACKEND == "django.core.mail.backends.console.EmailBackend":
        # MIME quoted-printable output wraps long URLs with '=\n', corrupting
        # clickable console links. Development delivery must print the raw URL.
        print(f"MeanTime password reset link (development only):\n{link}", flush=True)
        return
    send_mail(
        "Reset your MeanTime password",
        f"Open this link to reset your password:\n{link}\n\n"
        "If you did not request this, ignore this message.\n"
        f"This link expires in {settings.PASSWORD_RESET_TIMEOUT // 60} minutes.",
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
    )


def get_reset_user(uid, token, *, lock=False):
    try:
        pk = force_str(urlsafe_base64_decode(uid))
        users = User.objects.select_for_update() if lock else User.objects
        user = users.get(pk=pk, is_active=True)
    except (ValueError, TypeError, OverflowError, UnicodeDecodeError, User.DoesNotExist):
        return None
    return user if user.has_usable_password() and default_token_generator.check_token(user, token) else None


@auth_router.post("/password-requirements", response=PasswordRequirementsOut, auth=None)
def password_requirements(request, payload: PasswordRequirementsIn):
    """Evaluate the same configured validators used during registration; persist nothing."""
    user = User(email=payload.email.strip().lower(), display_name=payload.display_name.strip())
    requirements = []
    for validator in get_default_password_validators():
        try:
            validator.validate(payload.password, user=user)
            met = bool(payload.password)
        except ValidationError:
            met = False
        requirements.append({
            "id": type(validator).__name__,
            "description": str(validator.get_help_text()),
            "met": met,
        })
    requirements.append({
        "id": "MaximumLength",
        "description": "Use no more than 128 characters.",
        "met": bool(payload.password) and len(payload.password) <= 128,
    })
    return JsonResponse({"requirements": requirements}, headers={"Cache-Control": "no-store"})


@auth_router.post(
    "/register",
    response={201: UserOut, 400: ErrorDetail, 409: ErrorDetail},
    auth=None,
    summary="Register a new user account",
)
def register(request, payload: RegisterIn):
    """
    Register a new user account.
    Validates email uniqueness and password constraints.
    Returns 201 Created with the created user profile (no auto-login).
    """
    normalized_email = payload.email.strip().lower()

    if User.objects.filter(email=normalized_email).exists():
        return 409, {"detail": "An account with this email address already exists."}

    # Validate password against Django password validators
    temp_user = User(email=normalized_email, display_name=payload.display_name.strip())
    try:
        validate_password(payload.password, user=temp_user)
    except ValidationError as err:
        return 400, {"detail": " ".join(err.messages)}

    user = User.objects.create_user(
        email=normalized_email,
        password=payload.password,
        display_name=payload.display_name.strip(),
        timezone=payload.timezone,
    )
    return 201, user


@auth_router.post(
    "/login",
    response={200: AuthTokenOut, 401: ErrorDetail, 403: ErrorDetail},
    auth=None,
    summary="Log in with email and password",
)
def login(request, payload: LoginIn):
    """
    Authenticate a user with email and password.
    Returns JWT access and refresh tokens, token metadata, and user profile.
    """
    normalized_email = payload.email.strip().lower()

    user = authenticate(request, username=normalized_email, password=payload.password)
    if user is None:
        # Check if user exists with matching password but is inactive
        existing = User.objects.filter(email=normalized_email).first()
        if existing and existing.check_password(payload.password) and not existing.is_active:
            return 403, {"detail": "This account is inactive."}
        return 401, {"detail": "Invalid email or password."}

    if not user.is_active:
        return 403, {"detail": "This account is inactive."}

    if user.password_reset_active():
        return 403, {"detail": "Password reset is in progress. Complete the reset before logging in."}

    return 200, {**issue_tokens(user), "user": user}


@auth_router.post(
    "/refresh",
    response={200: TokenRefreshOut, 401: ErrorDetail},
    auth=None,
    summary="Refresh an expired access token",
)
def refresh_token(request, payload: RefreshIn):
    """
    Exchange a valid refresh token for a new access token.
    """
    try:
        token = RefreshToken(payload.refresh_token)
        user = User.objects.get(pk=token["user_id"], is_active=True)
        if user.password_reset_active() or token.get("password_version", 0) != user.password_version:
            return 401, {"detail": "Complete your password reset before signing in again."}
        return 200, {
            "access_token": str(token.access_token),
            "token_type": "bearer",
            "expires_in": 900,
        }
    except Exception:
        return 401, {"detail": "Invalid or expired refresh token."}


@auth_router.get(
    "/me",
    response={200: UserOut, 401: ErrorDetail},
    summary="Get current authenticated user profile",
)
def me(request):
    """
    Return the profile of the currently authenticated user.
    """
    user = request.auth if isinstance(request.auth, User) else getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return 401, {"detail": "Authentication required."}
    return 200, user


@auth_router.post("/password-reset", response={200: ErrorDetail}, auth=None)
def request_password_reset(request, payload: PasswordResetRequestIn):
    """Always respond identically; requesting a link never locks the account."""
    user = User.objects.filter(email=payload.email, is_active=True).first()
    if user and user.has_usable_password():
        try:
            deliver_reset_link(user)
        except Exception:
            # Do not expose account existence or delivery details in the response.
            logging.getLogger(__name__).error("Password reset delivery failed.")
    return {"detail": "If an account exists for this email, password reset instructions will be sent."}


@auth_router.post("/password-reset/validate", response={200: ErrorDetail, 400: ErrorDetail}, auth=None)
@transaction.atomic
def validate_password_reset(request, payload: PasswordResetLinkIn):
    """Only possession of a valid reset link activates the login restriction."""
    user = get_reset_user(payload.uid, payload.token, lock=True)
    if user is None:
        return 400, {"detail": INVALID_RESET_LINK}
    if not user.password_reset_active():
        user.resetting_password = True
        user.password_reset_started_at = timezone.now()
        user.save(update_fields=["resetting_password", "password_reset_started_at"])
    return {"detail": "Reset link verified. Enter your new password."}


@auth_router.post("/password-reset/confirm", response={200: ErrorDetail, 400: ErrorDetail}, auth=None)
@transaction.atomic
def confirm_password_reset(request, payload: PasswordResetConfirmIn):
    user = get_reset_user(payload.uid, payload.token, lock=True)
    if user is None:
        return 400, {"detail": INVALID_RESET_LINK}
    if payload.password != payload.password_confirm:
        return 400, {"detail": "Passwords do not match."}
    try:
        validate_password(payload.password, user=user)
    except ValidationError as error:
        return 400, {"detail": " ".join(error.messages)}
    user.set_password(payload.password)
    user.resetting_password = False
    user.password_reset_started_at = None
    user.password_version += 1
    user.save(update_fields=["password", "resetting_password", "password_reset_started_at", "password_version"])
    # Changing the password also invalidates all outstanding Django reset links.
    return {"detail": "Password updated. You can now log in with your new password."}

@users_router.patch(
    "/me",
    response={200: UserOut, 400: ErrorDetail, 401: ErrorDetail},
    summary="Update current user profile",
)
def update_me(request, payload: UserUpdateIn):
    """
    Partially update the authenticated user's display_name or timezone.
    Email is immutable and password updates are not supported here.
    """
    user = request.auth if isinstance(request.auth, User) else getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return 401, {"detail": "Authentication required."}

    update_data = payload.dict(exclude_unset=True)
    if not update_data:
        return 200, user

    for field, value in update_data.items():
        setattr(user, field, value)

    user.save(update_fields=list(update_data.keys()))
    return 200, user


@users_router.delete(
    "/me",
    response={200: ErrorDetail, 400: ErrorDetail, 401: ErrorDetail},
    summary="Deactivate user account (soft delete)",
)
def delete_me(request, payload: DeleteAccountIn):
    """
    Soft-delete the user account by setting is_active to False.
    Requires the password to prevent accidental deactivation, or the account's
    email address for accounts created through Google, which have no password.
    """
    user = request.auth if isinstance(request.auth, User) else getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return 401, {"detail": "Authentication required."}

    if user.has_usable_password():
        if not user.check_password(payload.password):
            return 400, {"detail": "Incorrect password. Account deactivation cancelled."}
    elif payload.email.strip().lower() != user.email:
        return 400, {
            "detail": "Enter your account's email to confirm. Account deactivation cancelled."
        }

    user.is_active = False
    user.save(update_fields=["is_active"])

    return 200, {"detail": "Account successfully deactivated."}

import zoneinfo
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from ninja import Router
from ninja_jwt.tokens import RefreshToken

from users.schemas import (
    AuthTokenOut,
    DeleteAccountIn,
    ErrorDetail,
    LoginIn,
    RefreshIn,
    RegisterIn,
    TokenRefreshOut,
    UserOut,
    UserUpdateIn,
)

User = get_user_model()
auth_router = Router()
users_router = Router(tags=["Users"])


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

    refresh = RefreshToken.for_user(user)
    return 200, {
        "access_token": str(refresh.access_token),
        "refresh_token": str(refresh),
        "token_type": "bearer",
        "expires_in": 900,
        "user": user,
    }


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
    Requires password verification to prevent accidental deactivation.
    """
    user = request.auth if isinstance(request.auth, User) else getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return 401, {"detail": "Authentication required."}

    if not user.check_password(payload.password):
        return 400, {"detail": "Incorrect password. Account deactivation cancelled."}

    user.is_active = False
    user.save(update_fields=["is_active"])

    return 200, {"detail": "Account successfully deactivated."}

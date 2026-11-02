import zoneinfo
from datetime import datetime
from typing import Literal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from ninja import Schema
from pydantic import Field, field_validator


class RegisterIn(Schema):
    """Payload for user registration."""

    email: str
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str = Field(..., min_length=1, max_length=50)
    timezone: str = "UTC"

    @field_validator("email")
    @classmethod
    def validate_email_field(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Email is required.")
        normalized = v.strip().lower()
        try:
            validate_email(normalized)
        except DjangoValidationError as err:
            raise ValueError("Enter a valid email address.") from err
        return normalized

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        if not v or v not in zoneinfo.available_timezones():
            return "UTC"
        return v


class LoginIn(Schema):
    """Payload for user login."""

    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_login_email(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Email is required.")
        return v.strip().lower()


class RefreshIn(Schema):
    """Payload for refreshing an access token."""

    refresh_token: str


class UserOut(Schema):
    """Public user profile returned in responses."""

    id: int
    email: str
    display_name: str
    timezone: str
    created_at: datetime


class TokenRefreshOut(Schema):
    """Response containing a new access token."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = 900


class AuthTokenOut(TokenRefreshOut):
    """Response returned upon successful login."""

    refresh_token: str
    user: UserOut


class ErrorDetail(Schema):
    """Standard single error message response."""

    detail: str


class PasswordRequirementsIn(Schema):
    password: str = Field(default="", max_length=128)
    email: str = Field(default="", max_length=254)
    display_name: str = Field(default="", max_length=50)


class PasswordRequirementOut(Schema):
    id: str
    description: str
    met: bool


class PasswordRequirementsOut(Schema):
    requirements: list[PasswordRequirementOut]


class PasswordResetRequestIn(Schema):
    email: str = Field(..., max_length=254)

    @field_validator("email")
    @classmethod
    def validate_reset_email(cls, value: str) -> str:
        return RegisterIn.validate_email_field(value)


class PasswordResetLinkIn(Schema):
    uid: str = Field(..., min_length=1, max_length=64)
    token: str = Field(..., min_length=1, max_length=128)


class PasswordResetConfirmIn(PasswordResetLinkIn):
    password: str = Field(..., min_length=8, max_length=128)
    password_confirm: str = Field(..., min_length=8, max_length=128)


class UserUpdateIn(Schema):
    """Payload for partial user profile update."""

    display_name: str | None = Field(None, min_length=1, max_length=50)
    timezone: str | None = None

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip()
            if not cleaned:
                raise ValueError("Display name cannot be blank.")
            return cleaned
        return v

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str | None) -> str | None:
        if v is not None and v not in zoneinfo.available_timezones():
            raise ValueError("Enter a valid IANA timezone.")
        return v


class DeleteAccountIn(Schema):
    """Payload for confirming account deletion.

    Accounts with a password confirm with it. Accounts created through Google
    have none, so they confirm by typing their email address instead.
    """

    password: str = ""
    email: str = ""


class UserSearchResultOut(Schema):
    """User profile returned by exact search with relationship state."""

    id: int
    email: str
    display_name: str
    timezone: str
    relationship_status: Literal["none", "friend", "pending_incoming", "pending_outgoing"]


class FriendRequestOut(Schema):
    """Outgoing or incoming pending friend request."""

    id: int
    user: UserOut
    created_at: datetime


class FriendRequestsListOut(Schema):
    """Grouped pending requests for the authenticated user."""

    incoming: list[FriendRequestOut]
    outgoing: list[FriendRequestOut]

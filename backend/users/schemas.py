import uuid
import zoneinfo
from datetime import datetime

from ninja import Schema
from pydantic import EmailStr, Field, field_validator


class RegisterIn(Schema):
    """Payload for user registration."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str = Field(..., min_length=1, max_length=50)
    timezone: str = "UTC"

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        if not v or v not in zoneinfo.available_timezones():
            return "UTC"
        return v


class LoginIn(Schema):
    """Payload for user login."""

    email: EmailStr
    password: str


class RefreshIn(Schema):
    """Payload for refreshing an access token."""

    refresh_token: str


class UserOut(Schema):
    """Public user profile returned in responses."""

    id: uuid.UUID
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

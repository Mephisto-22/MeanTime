"""Password reset helpers, independent of the future email provider."""
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

INVALID_RESET_LINK = "This password reset link is invalid or expired. Request a new link."


def deliver_reset_link(user):
    # The fragment keeps the secret out of frontend HTTP access logs.
    fragment = urlencode({
        "uid": urlsafe_base64_encode(force_bytes(user.pk)),
        "token": default_token_generator.make_token(user),
    })
    link = f"{settings.FRONTEND_URL}/reset-password#{fragment}"
    send_mail(
        "Reset your MeanTime password",
        f"Open this link to reset your password:\n{link}\n\n"
        "If you did not request this, ignore this message.\n"
        f"This link expires in {settings.PASSWORD_RESET_TIMEOUT // 60} minutes.",
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
    )


def get_reset_user(uid, token, *, lock=False):
    User = get_user_model()
    try:
        pk = force_str(urlsafe_base64_decode(uid))
        users = User.objects.select_for_update() if lock else User.objects
        user = users.get(pk=pk, is_active=True)
    except (ValueError, TypeError, OverflowError, UnicodeDecodeError, User.DoesNotExist):
        return None
    return user if user.has_usable_password() and default_token_generator.check_token(user, token) else None

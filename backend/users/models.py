from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.conf import settings
from django.utils import timezone as django_timezone
from datetime import timedelta

from users.managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """Custom User model for MeanTime."""

    email = models.EmailField(unique=True, max_length=254, db_index=True)
    display_name = models.CharField(max_length=50)
    timezone = models.CharField(max_length=63, default="UTC")
    created_at = models.DateTimeField(auto_now_add=True, editable=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    resetting_password = models.BooleanField(default=False)
    password_reset_started_at = models.DateTimeField(null=True, blank=True)
    password_version = models.PositiveIntegerField(default=0, editable=False)

    def password_reset_active(self):
        """An abandoned reset stops blocking login after the reset timeout."""
        if not self.resetting_password:
            return False
        if self.password_reset_started_at and (
            django_timezone.now() >= self.password_reset_started_at
            + timedelta(seconds=settings.PASSWORD_RESET_TIMEOUT)
        ):
            self.resetting_password = False
            self.password_reset_started_at = None
            self.save(update_fields=["resetting_password", "password_reset_started_at"])
            return False
        return True

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["display_name"]

    class Meta:
        db_table = "users"
        ordering = ["email"]
        constraints = [
            models.UniqueConstraint(
                models.functions.Lower("email"),
                name="unique_user_email_case_insensitive",
            )
        ]

    def clean(self):
        super().clean()
        if self.email:
            self.email = self.email.lower()

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.display_name} <{self.email}>" if self.display_name else self.email


class ExternalAccount(models.Model):
    """An account at another provider (such as Google) that signs in as a MeanTime user."""

    class Provider(models.TextChoices):
        GOOGLE = "google", "Google"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="external_accounts")
    provider = models.CharField(max_length=20, choices=Provider.choices)
    # The provider's permanent ID for the account (the ID token's "sub"). Emails can change.
    subject = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True, editable=False)

    class Meta:
        db_table = "external_accounts"
        constraints = [
            models.UniqueConstraint(fields=["provider", "subject"], name="unique_external_account"),
        ]

    def __str__(self):
        return f"{self.get_provider_display()} account of {self.user.email}"

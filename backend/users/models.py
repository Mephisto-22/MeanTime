import uuid
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from users.managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """Custom User model for MeanTime."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, max_length=254, db_index=True)
    display_name = models.CharField(max_length=50)
    timezone = models.CharField(max_length=63, default="UTC")
    created_at = models.DateTimeField(auto_now_add=True, editable=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

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


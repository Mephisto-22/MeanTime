from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.db.models.functions import Greatest, Least
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
    # Directional M2M tracking outgoing requests and connections.
    # Note: user.friends.all() returns outgoing connections of all statuses.
    # Use user.get_friends() to retrieve confirmed/accepted mutual friends.
    friends = models.ManyToManyField(
        "self",
        through="Friendship",
        symmetrical=False,
        through_fields=("requester", "receiver"),
        related_name="friended_by",
        blank=True,
    )

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

    def get_friends(self):
        """Return QuerySet of users who have an ACCEPTED friendship with self in either direction."""
        from django.db.models import Q
        return User.objects.filter(
            Q(friendships_received__requester=self, friendships_received__status=FriendshipStatus.ACCEPTED) |
            Q(friendships_initiated__receiver=self, friendships_initiated__status=FriendshipStatus.ACCEPTED)
        ).distinct()

    def is_friends_with(self, user):
        """Check whether self and user have an ACCEPTED friendship."""
        if not user or not user.is_authenticated or user == self:
            return False
        return Friendship.objects.filter(
            models.Q(requester=self, receiver=user) | models.Q(requester=user, receiver=self),
            status=FriendshipStatus.ACCEPTED,
        ).exists()

    def is_blocking(self, user) -> bool:
        if not user or not user.is_authenticated or user == self:
            return False
        return UserBlock.objects.filter(blocker=self, blocked=user).exists()

    def is_blocked_by(self, user) -> bool:
        if not user or not user.is_authenticated or user == self:
            return False
        return UserBlock.objects.filter(blocker=user, blocked=self).exists()

    def __str__(self):
        return f"{self.display_name} <{self.email}>" if self.display_name else self.email


class FriendshipStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    ACCEPTED = "ACCEPTED", "Accepted"
    DECLINED = "DECLINED", "Declined"
    BLOCKED = "BLOCKED", "Blocked"


class Friendship(models.Model):
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="friendships_initiated",
    )
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="friendships_received",
    )
    status = models.CharField(
        max_length=20,
        choices=FriendshipStatus.choices,
        default=FriendshipStatus.PENDING,
        db_index=True,
    )
    blocked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="blocked_friendships",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "friendships"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                Least("requester_id", "receiver_id"),
                Greatest("requester_id", "receiver_id"),
                name="unique_friendship_pair",
            ),
            models.CheckConstraint(
                condition=~models.Q(requester=models.F("receiver")),
                name="prevent_self_friending",
            ),
        ]

    def __str__(self):
        req = self.requester.display_name or self.requester.email
        rec = self.receiver.display_name or self.receiver.email
        return f"{req} -> {rec} ({self.status})"


class UserBlock(models.Model):
    blocker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_user_records",
    )
    blocked = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_by_user_records",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_blocks"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["blocker", "blocked"],
                name="unique_user_block",
            ),
            models.CheckConstraint(
                condition=~models.Q(blocker=models.F("blocked")),
                name="prevent_self_blocking",
            ),
        ]

    def __str__(self):
        return f"{self.blocker} blocked {self.blocked}"


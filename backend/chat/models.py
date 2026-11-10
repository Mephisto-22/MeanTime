from django.conf import settings
from django.db import models


class ConversationType(models.TextChoices):
    DIRECT = "DIRECT", "Direct Message"
    GROUP = "GROUP", "Group Chat"


class ParticipantStatus(models.TextChoices):
    PENDING = "PENDING", "Pending Invite"
    ACCEPTED = "ACCEPTED", "Accepted"
    DECLINED = "DECLINED", "Declined"


class Conversation(models.Model):
    type = models.CharField(
        max_length=10,
        choices=ConversationType.choices,
        default=ConversationType.DIRECT,
    )
    title = models.CharField(
        max_length=100,
        blank=True,
        default="",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_conversations",
    )
    board = models.ForeignKey(
        "kanban.Board",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="board_chats",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        if self.title:
            return self.title
        return f"Conversation {self.pk} ({self.type})"


class ConversationParticipant(models.Model):
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="participants",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_participations",
    )
    status = models.CharField(
        max_length=10,
        choices=ParticipantStatus.choices,
        default=ParticipantStatus.PENDING,
        db_index=True,
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sent_chat_invites",
    )
    cleared_at = models.DateTimeField(null=True, blank=True)
    last_read_at = models.DateTimeField(null=True, blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["conversation", "user"],
                name="unique_conversation_participant",
            )
        ]

    def __str__(self):
        return f"{self.user} in {self.conversation} ({self.status})"


class Message(models.Model):
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_messages",
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Message {self.pk} by {self.sender} in conv {self.conversation_id}"

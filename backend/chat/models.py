from django.conf import settings
from django.db import models


class Message(models.Model):
    board = models.ForeignKey(
        "kanban.Board",
        on_delete=models.CASCADE,
        related_name="chat_messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_board_messages",
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["board", "created_at"]),
        ]

    def __str__(self):
        return f"Message {self.pk} by {self.sender} on Board {self.board_id}"

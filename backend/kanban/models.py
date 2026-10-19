from django.db import models
from django.conf import settings

class Board(models.Model):
    owner = models.ForeignKey(
        to=settings.AUTH_USER_MODEL, # should resolve to users.User
        on_delete=models.CASCADE, # delete a deleted user's boards
        related_name="boards", # allows us to call user.boards in other code
    )

    title = models.CharField(max_length=100)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.title

class BoardColumn(models.Model):
    board = models.ForeignKey(
        to=Board,
        on_delete=models.CASCADE,
        related_name="columns",
    )
    title = models.CharField(max_length=100)
    position = models.PositiveIntegerField(default=0) # horizontal position L -> R
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["board","position"],
                name="unique_column_position_per_board",
                deferrable=models.Deferrable.DEFERRED,
            ),
        ]

    def __str__(self):
        return f"{self.board.title} = {self.title}"

class Task(models.Model):
    column = models.ForeignKey(
        to=BoardColumn,
        on_delete=models.CASCADE,
        related_name="tasks"
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    position = models.PositiveIntegerField(default=0) # vertical position Top -> Bot
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["column", "position"],
                name="unique_task_position_per_column",
                deferrable=models.Deferrable.DEFERRED,
            ),
        ]

    def __str__(self):
        return self.title


class TaskTimeEntry(models.Model):
    task = models.ForeignKey(
        to=Task,
        on_delete=models.CASCADE,
        related_name="time_entries"
    )
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-started_at"] # descending order (newest first)

    def __str__(self):
        return f"Time entry for {self.task.title}"
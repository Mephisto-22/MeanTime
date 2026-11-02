from django.db import models
from django.conf import settings

class TaskPriority(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"

class TimerMode(models.TextChoices):
    NONE = "NONE", "None"
    COUNT_UP = "COUNT_UP", "Count Up"
    COUNT_DOWN = "COUNT_DOWN", "Count Down"

class TimerState(models.TextChoices):
    IDLE = "IDLE", "Idle"
    RUNNING = "RUNNING", "Running"
    PAUSED = "PAUSED", "Paused"

class Tag(models.Model):
    user = models.ForeignKey(
        to=settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tags"
    )
    name = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"],
                name="unique_tag_name_per_user"
            )
        ]
        ordering = ["name"] # tags returned alphabetically by default

    def __str__(self):
        return self.name


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
    priority = models.CharField(
        max_length=10,
        choices=TaskPriority.choices,
        default=None,
        null=True,
        blank=True,
    )
    tags = models.ManyToManyField(
        to=Tag,
        blank=True,
        related_name="tasks"
    )
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


class TaskTimer(models.Model):
    task = models.OneToOneField(
        to=Task,
        on_delete=models.CASCADE,
        related_name="timer",
    )
    mode = models.CharField(
        max_length=20,
        choices=TimerMode.choices,
        default=TimerMode.NONE,
    )
    target_duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    state = models.CharField(
        max_length=20,
        choices=TimerState.choices,
        default=TimerState.IDLE,
    )
    started_at = models.DateTimeField(null=True, blank=True)
    elapsed_seconds = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"Timer for {self.task.title} ({self.state})"


class TaskTimeEntry(models.Model):
    task = models.ForeignKey(
        to=Task,
        on_delete=models.CASCADE,
        related_name="time_entries"
    )
    user = models.ForeignKey(
        to=settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="time_entries",
        null=True,
        blank=True,
    )
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-started_at"] # descending order (newest first)

    def __str__(self):
        return f"Time entry for {self.task.title}"

from __future__ import annotations
from datetime import datetime
from django.db.models import Sum
from django.db.models.functions import Coalesce
from ninja import Schema
from pydantic import Field, field_validator
from users.schemas import UserOut
from .models import TaskPriority, TimerMode, TimerState, RecurrenceCadence

# Timer schemas
class TaskTimerOut(Schema):
    id: int
    task_id: int
    mode: TimerMode
    target_duration_seconds: int | None = None
    state: TimerState
    started_at: datetime | None = None
    last_resumed_at: datetime | None = None
    last_paused_at: datetime | None = None
    elapsed_seconds: int

class TaskTimerPatchIn(Schema):
    mode: TimerMode | None = None
    target_duration_seconds: int | None = None
    state: TimerState | None = None
    started_at: datetime | None = None
    last_resumed_at: datetime | None = None
    last_paused_at: datetime | None = None
    elapsed_seconds: int | None = None

# Time entry schemas
class TaskTimeEntryIn(Schema):
    """Payload expected when manually recording past work."""
    started_at: datetime
    ended_at: datetime | None = None
    duration_seconds: int = 0
    note: str = ""
    user_id: int | None = None

class TaskTimeEntryUpdateIn(Schema):
    """Payload expected when updating a recorded time entry."""
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: int | None = None
    note: str | None = None
    user_id: int | None = None

class TaskTimeEntryOut(Schema):
    """Shape of recorded time entry returned to clients."""
    id: int
    task_id: int
    user_id: int | None = None
    user: UserOut | None = None
    started_at: datetime
    ended_at: datetime | None = None
    duration_seconds: int
    note: str
    created_at: datetime

# Recurrence schemas
class RecurringTaskIn(Schema):
    """Payload expected when configuring recurrence."""
    cadence: RecurrenceCadence = RecurrenceCadence.DAILY
    days_of_week: list[int] = []
    day_of_month: int | None = None
    time_of_day: str = "00:00"
    timezone: str | None = None

class RecurringTaskPatchIn(Schema):
    """Payload expected for partially updating a recurring task schedule or template."""
    is_active: bool | None = None
    cadence: RecurrenceCadence | None = None
    days_of_week: list[int] | None = None
    day_of_month: int | None = None
    time_of_day: str | None = None
    timezone: str | None = None
    title: str | None = None
    description: str | None = None
    priority: TaskPriority | None = None
    tag_ids: list[int] | None = None
    default_timer_mode: TimerMode | None = None
    target_duration_seconds: int | None = None

class RecurringTaskOut(Schema):
    """Shape of a recurring task returned to clients."""
    id: int
    board_id: int
    creator_id: int
    title: str
    description: str = ""
    priority: TaskPriority | None = None
    cadence: RecurrenceCadence
    days_of_week: list[int] = []
    day_of_month: int | None = None
    time_of_day: str
    timezone: str
    default_timer_mode: TimerMode
    target_duration_seconds: int | None = None
    is_active: bool
    next_run_at: datetime
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_time_of_day(obj):
        if hasattr(obj.time_of_day, "strftime"):
            return obj.time_of_day.strftime("%H:%M:%S")
        return str(obj.time_of_day)


# Task schemas
class TaskIn(Schema):
    """Payload expected when creating a task."""
    title: str
    description: str = ""
    priority: TaskPriority | None = None
    tag_ids: list[int] = []
    timer_mode: TimerMode | None = None
    target_duration_seconds: int | None = None
    column_id: int | None = None
    recurrence: RecurringTaskIn | None = None

class TaskOut(Schema):
    """Shape of the task returned to clients."""
    id: int
    title: str
    description: str
    priority: TaskPriority | None = None
    position: int | None = None
    column_id: int
    column_activity_at: datetime | None = None
    archived_at: datetime | None = None
    recurring_task_id: int | None = None
    recurring_task: RecurringTaskOut | None = None
    tags: list[TagOut]
    timer: TaskTimerOut | None = None
    total_seconds: int = 0
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_recurring_task(obj):
        try:
            return obj.recurring_task
        except Exception:
            return None

    @staticmethod
    def resolve_timer(obj):
        try:
            return obj.timer
        except Exception:
            return None

    @staticmethod
    def resolve_total_seconds(obj):
        """Return the sum of the task's time entry durations.

        The board query annotates this total; tasks loaded any other way
        (create, update, move) fall back to one aggregate query.
        """
        total = getattr(obj, "total_seconds", None)
        if total is None:
            total = obj.time_entries.aggregate(total=Sum("duration_seconds"))["total"]
        return total or 0

# Allows us to update only part of a task without having to send a full TaskIn Schema
class TaskUpdateIn(Schema):
    """Payload expected for partially updating a task"""
    title: str | None = None
    description: str | None = None
    priority: TaskPriority | None = None
    tag_ids: list[int] | None = None
    timer_mode: TimerMode | None = None
    target_duration_seconds: int | None = None
    apply_to_future: bool = False
    recurrence: RecurringTaskPatchIn | None = None

# Column Schemas
class BoardColumnIn(Schema):
    """Payload expected when creating or updating a board column."""
    title: str
    position: int = 0
    auto_clear_duration_seconds: int | None = Field(default=None, ge=0)

    @field_validator("auto_clear_duration_seconds")
    @classmethod
    def normalize_auto_clear(cls, v: int | None) -> int | None:
        if v == 0:
            return None
        return v

class BoardColumnOut(Schema):
    """Shape of a board column returned to clients."""
    id: int
    title: str
    position: int
    board_id: int
    auto_clear_duration_seconds: int | None = None
    tasks: list[TaskOut]
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_tasks(obj):
        if isinstance(obj, dict):
            return obj.get("tasks", [])
        if hasattr(obj, "_prefetched_objects_cache") and "tasks" in obj._prefetched_objects_cache:
            return [t for t in obj._prefetched_objects_cache["tasks"] if getattr(t, "archived_at", None) is None]
        tasks_manager = getattr(obj, "tasks", None)
        if tasks_manager is not None and hasattr(tasks_manager, "filter"):
            return (
                tasks_manager.filter(archived_at__isnull=True)
                .select_related("timer", "recurring_task")
                .prefetch_related("tags")
                .annotate(total_seconds=Coalesce(Sum("time_entries__duration_seconds"), 0))
                .order_by("position", "id")
            )
        return tasks_manager or []

class BoardColumnUpdateIn(Schema):
    """Payload expected for partially updating a board column."""
    title: str | None = None
    position: int | None = None
    auto_clear_duration_seconds: int | None = Field(default=None, ge=0)

    @field_validator("auto_clear_duration_seconds")
    @classmethod
    def normalize_auto_clear(cls, v: int | None) -> int | None:
        if v == 0:
            return None
        return v


# Board Schemas
class BoardIn(Schema):
    """Payload expected when creating or updating a board."""
    title: str
    description: str = ""

class BoardOut(Schema):
    """Shape of a board returned to clients."""
    id: int
    title: str
    description: str
    owner: UserOut
    collaborators: list[UserOut] = []
    is_owner: bool = True
    columns: list[BoardColumnOut]
    created_at: datetime
    updated_at: datetime

class TaskMoveIn(Schema):
    """Payload expected when moving a task to another column."""
    to_column_id: int
    target_position: int

class BoardShareIn(Schema):
    """Payload expected when sharing a board with a friend."""
    friend_id: int


# Tag Schemas
class TagIn(Schema):
    """Payload for creating a tag."""
    name: str

class TagOut(Schema):
    """Shape of a tag returned to clients."""
    id: int
    name: str
    created_at: datetime

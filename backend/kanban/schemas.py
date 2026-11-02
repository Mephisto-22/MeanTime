from __future__ import annotations
from datetime import datetime
from ninja import Schema
from .models import TaskPriority, TimerMode, TimerState

# Timer schemas
class TaskTimerOut(Schema):
    id: int
    task_id: int
    mode: TimerMode
    target_duration_seconds: int | None = None
    state: TimerState
    started_at: datetime | None = None
    elapsed_seconds: int

class TaskTimerPatchIn(Schema):
    mode: TimerMode | None = None
    target_duration_seconds: int | None = None
    state: TimerState | None = None
    started_at: datetime | None = None
    elapsed_seconds: int | None = None

# Time entry schemas
class TaskTimeEntryIn(Schema):
    """Payload expected when manually recording past work."""
    started_at: datetime
    ended_at: datetime | None = None
    duration_seconds: int = 0
    note: str = ""

class TaskTimeEntryUpdateIn(Schema):
    """Payload expected when updating a recorded time entry."""
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: int | None = None
    note: str | None = None

class TaskTimeEntryOut(Schema):
    """Shape of recorded time entry returned to clients."""
    id: int
    task_id: int
    user_id: int | None = None
    started_at: datetime
    ended_at: datetime | None = None
    duration_seconds: int
    note: str
    created_at: datetime

# Task schemas
class TaskIn(Schema):
    """Payload expected when creating a task."""
    title: str
    description: str = ""
    priority: TaskPriority | None = None
    tag_ids: list[int] = []

class TaskOut(Schema):
    """Shape of the task returned to clients."""
    id: int
    title: str
    description: str
    priority: TaskPriority | None = None
    position: int
    column_id: int
    tags: list[TagOut]
    timer: TaskTimerOut | None = None
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_timer(obj):
        try:
            return obj.timer
        except Exception:
            return None

# Allows us to update only part of a task without having to send a full TaskIn Schema
class TaskUpdateIn(Schema):
    """Payload expected for partially updating a task"""
    title: str | None = None
    description: str | None = None
    priority: TaskPriority | None = None
    tag_ids: list[int] | None = None

# Column Schemas
class BoardColumnIn(Schema):
    """Payload expected when creating or updating a board column."""
    title: str
    position: int = 0

class BoardColumnOut(Schema):
    """Shape of a board column returned to clients."""
    id: int
    title: str
    position: int
    board_id: int
    tasks: list[TaskOut]
    created_at: datetime
    updated_at: datetime


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
    columns: list[BoardColumnOut]
    created_at: datetime
    updated_at: datetime

class TaskMoveIn(Schema):
    """Payload expected when moving a task to another column."""
    to_column_id: int
    target_position: int


# Tag Schemas
class TagIn(Schema):
    """Payload for creating a tag."""
    name: str

class TagOut(Schema):
    """Shape of a tag returned to clients."""
    id: int
    name: str
    created_at: datetime

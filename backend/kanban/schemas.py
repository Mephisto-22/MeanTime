from __future__ import annotations
from datetime import datetime
from ninja import Schema
from enum import Enum
from .models import TaskPriority

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
    created_at: datetime
    updated_at: datetime

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

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

class BoardEventType(StrEnum):
    """Event types broadcast to Kanban board subscribers."""

    BOARD_UPDATED = "board.updated"

    COLUMN_CREATED = "column.created"
    COLUMN_UPDATED = "column.updated"
    COLUMN_DELETED = "column.deleted"

    TASK_CREATED = "task.created"
    TASK_UPDATED = "task.updated"
    TASK_DELETED = "task.deleted"
    TASK_MOVED = "task.moved"

class BoardEvent(BaseModel):
    """Common structure for all Kanban board events."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    type: BoardEventType
    board_id: int
    actor_id: int
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    data: dict[str, Any] = Field(default_factory=dict)
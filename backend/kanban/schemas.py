from datetime import datetime
from ninja import Schema

# Task schemas
class TaskIn(Schema):
    """Payload expected when creating or updating a task."""
    title: str
    description: str = ""

class TaskOut(Schema):
    """Shape of the task returned to clients."""
    id: int
    title: str
    description: str
    position: int
    column_id: int
    created_at: datetime
    updated_at: datetime


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
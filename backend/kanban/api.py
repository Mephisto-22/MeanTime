from django.shortcuts import get_object_or_404
from ninja import Router
from .models import Board, BoardColumn, Task, TaskTimeEntry
from .schemas import (
    TaskIn, 
    TaskOut, 
    BoardColumnIn, 
    BoardColumnOut, 
    BoardIn, 
    BoardOut, 
    TaskMoveIn,
)

router = Router(tags=["Kanban"])

# Helpers

def get_owned_board(user, board_id: int) -> Board:
    """Retrieve a board owned by the authenticated user."""
    return get_object_or_404(
        Board.objects.filter(owner=user),
        id=board_id
    )

def get_owned_column(user, column_id: int) -> BoardColumn:
    """Retrieve a column belonging to the authenticated user."""
    return get_object_or_404(
        BoardColumn.objects.filter(board_owner=user),
        id=column_id
    )

def get_owned_task(user, task_id: int) -> Task:
    """Retrieve a task belonging to the authenticated user."""
    return get_object_or_404(
        Task.objects.select_related("column__board").filter(
            column__board__owner=user
        ),
        id=task_id
    )


# -----------------
# Board Endpoints
# -----------------

@router.get("/boards", response=list[BoardOut])
def list_boards(request):
    """List boards owned by the authenticated user/"""
    # TODO: require authentication
    pass

@router.post("/boards", response={201: BoardOut})
def create_board(request, payload: BoardIn):
    """Create a board for the authenticated user"""
    # TODO: require authentication
    pass


@router.get("/boards/{board_id}", response=BoardOut)
def get_board(request, board_id: int):
    """Retrieve a board with its columns and tasks."""
    # TODO: require authentication
    # TODO: fetch only a board owned by the authenticated user
    # TODO: use prefetch_related("columns_tasks")
    pass


@router.patch("/boards/{board_id}", response=BoardOut)
def update_board(request, board_id: int, payload: BoardIn):
    """Update a board's title and description."""
    # TODO: require authentication
    # TODO: apply the changes and save
    pass

@router.delete("/boards/{board_id}")
def delete_board(request, board_id: int):
    """Delete a board and its related columns and tasks."""
    # TODO: Require authentication and verify ownership
    # TODO: Delete the board
    return {"success": True}


# -----------------
# Column Endpoints
# -----------------

@router.post("boards/{board_id}/columns", response=BoardColumnOut)
def create_column(request, board_id: int, payload: BoardColumnIn):
    """Create a column on a board owned by the authenticated user."""
    # TODO: require authentication
    # TODO: assign next available position
    # TODO: create and return the column
    pass

@router.patch("/columns/{column_id}", response=BoardColumnOut)
def update_column(request, column_id: int, payload: BoardColumnIn):
    """Update a column's title or position."""
    # TODO: require authentication and verify ownership through board
    # TODO: update the supplied fields
    # TODO: handle position changes
    pass

@router.delete("/columns/{column_id}")
def delete_column(request, column_id: int):
    """Delete a column and its tasks."""
    # TODO: require authentication and verify ownership through board
    # TODO: delete the column
    return {"success": True}


# ------------------
# Task Endpoints
# ------------------

@router.post("/columns/{column_id}/tasks", response=TaskOut)
def create_task(request, column_id: int, payload: TaskIn):
    """Create a task in a column."""
    # TODO: require authentication and verify ownership through the board
    # TODO: assign the next available position in the column
    # TODO: create and return the task
    pass

@router.patch("/tasks/{task_id}", response=TaskOut)
def update_task(request, task_id: int, payload: TaskIn):
    """Update a task's name and description"""
    # TODO: require authentication and verify ownership through the board
    # TODO: update the supplied fields
    pass

@router.delete("/tasks/{task_id}")
def delete_task(request, task_id: int):
    """Delete a task."""
    # TODO: require authenticaiton and verify ownership through the board
    # TODO: delete the task
    return {"success": True}

router.post("/tasks/{task_id}/move", response=TaskOut)
def move_task(request, task_id: int, payload: TaskMoveIn):
    """Move a task to another column and position."""
    # TODO: require authentication and verify task ownership
    # TODO: Verify the destination column belongs to the same user's board
    # TODO: use transaction.atomic() for the move and reordering
    # TODO: update positions in the source and destination columns
    pass

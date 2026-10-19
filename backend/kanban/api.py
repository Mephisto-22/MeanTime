from django.shortcuts import get_object_or_404
from ninja_jwt.authentication import JWTAuth
from django.db.models import Prefetch, Max
from django.db import transaction
from ninja.errors import HttpError
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

router = Router(tags=["Kanban"], auth=JWTAuth())

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
        BoardColumn.objects.filter(board__owner=user),
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

def _reindex(items):
    """Rewrite position 0..n-1."""
    for i, obj in enumerate(items):
        obj.position = i
        obj.save()



# -----------------
# Board Endpoints
# -----------------

@router.get("/boards", response=list[BoardOut])
def list_boards(request):
    """List boards owned by the authenticated user/"""
    return Board.objects.filter(owner=request.auth).prefetch_related("columns__tasks")

@router.post("/boards", response={201: BoardOut})
def create_board(request, payload: BoardIn):
    """Create a board for the authenticated user"""
    board = Board.objects.create(owner=request.auth, **payload.dict())
    return 201, board

@router.get("/boards/{board_id}", response=BoardOut)
def get_board(request, board_id: int):
    """Retrieve a board with its columns and tasks."""
    board = get_object_or_404(
        Board.objects.filter(owner=request.auth).prefetch_related("columns__tasks"),
        id=board_id,
    )
    return board

@router.patch("/boards/{board_id}", response=BoardOut)
def update_board(request, board_id: int, payload: BoardIn):
    """Update a board's title and description."""
    board = get_owned_board(request.auth, board_id)
    board.title = payload.title
    board.description = payload.description
    board.save()
    return board

@router.delete("/boards/{board_id}")
def delete_board(request, board_id: int):
    """Delete a board and its related columns and tasks."""
    get_owned_board(request.auth, board_id).delete()
    return {"success": True}


# -----------------
# Column Endpoints
# -----------------

@router.post("/boards/{board_id}/columns", response=BoardColumnOut)
def create_column(request, board_id: int, payload: BoardColumnIn):
    """Create a column on a board owned by the authenticated user."""
    board = get_owned_board(request.auth, board_id)
    last = board.columns.aggregate(m=Max("position"))["m"]
    return BoardColumn.objects.create(
        board=board,
        title=payload.title,
        position=0 if last is None else last + 1,
    )

@router.patch("/columns/{column_id}", response=BoardColumnOut)
def update_column(request, column_id: int, payload: BoardColumnIn):
    """Update a column's title or position."""
    column = get_owned_column(request.auth, column_id)
    with transaction.atomic():
        column.title = payload.title
        others = [c for c in column.board.columns.all() if c.id != column.id]
        idx = max(0, min(payload.position, len(others)))
        others.insert(idx, column)
        _reindex(others)
    return column

@router.delete("/columns/{column_id}")
def delete_column(request, column_id: int):
    """Delete a column and its tasks."""
    column = get_owned_column(request.auth, column_id)
    board = column.board
    with transaction.atomic():
        column.delete()
        _reindex(list(board.columns.all()))
    return {"success": True}


# ------------------
# Task Endpoints
# ------------------

@router.post("/columns/{column_id}/tasks", response=TaskOut)
def create_task(request, column_id: int, payload: TaskIn):
    """Create a task in a column."""
    column = get_owned_column(request.auth, column_id)
    last = column.tasks.aggregate(m=Max("position"))["m"]
    return Task.objects.create(
        column=column,
        title=payload.title,
        description=payload.description,
        position=0 if last is None else last + 1,
    )

@router.patch("/tasks/{task_id}", response=TaskOut)
def update_task(request, task_id: int, payload: TaskIn):
    """Update a task's name and description."""
    task = get_owned_task(request.auth, task_id)
    task.title = payload.title
    task.description = payload.description
    task.save()
    return task

@router.delete("/tasks/{task_id}")
def delete_task(request, task_id: int):
    """Delete a task."""
    task = get_owned_task(request.auth, task_id)
    column = task.column
    with transaction.atomic():
        task.delete()
        _reindex(list(column.tasks.all()))
    return {"success": True}

@router.post("/tasks/{task_id}/move", response=TaskOut)
def move_task(request, task_id: int, payload: TaskMoveIn):
    """Move a task to another column and position."""
    task = get_owned_task(request.auth, task_id)
    src = task.column
    dest = get_owned_column(request.auth, payload.to_column_id)
    if dest.board_id != src.board.id:
        raise HttpError(400, "Column on different board")

    with transaction.atomic():
        src_tasks = [t for t in src.tasks.all() if t.id != task.id]
        dest_tasks = src_tasks if dest.id == src.id else list(dest.tasks.all())
        idx = max(0, min(payload.target_position, len(dest_tasks)))
        task.column = dest
        dest_tasks.insert(idx, task)
        if dest.id != src.id:
            _reindex(src_tasks)
        _reindex(dest_tasks)
    return task

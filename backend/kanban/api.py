from django.shortcuts import get_object_or_404
from django.db.models import Prefetch, Max, Q
from django.db import IntegrityError, transaction
from django.contrib.auth import get_user_model
from ninja.errors import HttpError
from ninja import Router
from .models import Board, BoardColumn, Task, TaskTimeEntry, Tag
from .schemas import (
    TaskIn, 
    TaskOut, 
    TaskUpdateIn,
    BoardColumnIn, 
    BoardColumnOut,
    BoardColumnUpdateIn, 
    BoardIn, 
    BoardOut,
    BoardShareIn, 
    TaskMoveIn,
    TagIn,
    TagOut,
)

router = Router(tags=["Kanban"])

# get the custom user model
User = get_user_model()

# Every new board starts with these columns, left to right.
DEFAULT_COLUMN_TITLES = ("To Do", "In Progress", "Done")

# Helpers

def get_owned_board(user, board_id: int) -> Board:
    """Retrieve a board owned by the authenticated user."""
    return get_object_or_404(
        Board.objects.filter(owner=user),
        id=board_id
    )

def get_accessible_board(user, board_id: int) -> Board:
    """Retrieve a board owned by or shared with the user."""
    return get_object_or_404(
        Board.objects.filter(
            Q(owner=user) | Q(collaborators=user)
        ).distinct().prefetch_related("columns__tasks__tags"),
        id=board_id,
    )

def get_accessible_column(user, column_id: int) -> BoardColumn:
    """Retrieve a column on a board the user can access."""
    return get_object_or_404(
        BoardColumn.objects.filter(
            Q(board__owner=user) | Q(board__collaborators=user)
        ).distinct(),
        id=column_id,
    )

def get_accessible_task(user, task_id: int) -> Task:
    """Retrieve a task on a board the user can access."""
    return get_object_or_404(
        Task.objects.select_related("column__board").filter(
            Q(column__board__owner=user) | Q(column__board__collaborators=user)
        ).distinct(),
        id=task_id,
    )

def get_owned_tags(user, tag_ids: list[int]) -> list[Tag]:
    """Return the requested tags if they all belong to the user."""
    if len(tag_ids) != len(set(tag_ids)):
        raise HttpError(400, "Duplicate tag IDs are not allowed.")

    tags = list(Tag.objects.filter(user=user, id__in=tag_ids))

    if len(tags) != len(tag_ids):
        raise HttpError(400, "One or more tags are invalid or do not belong to you.")

    return tags

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
    """List boards owned by or shared with the authenticated user."""
    return Board.objects.filter(
        Q(owner=request.auth) | Q(collaborators=request.auth)
    ).distinct().prefetch_related("columns__tasks__tags")

@router.post("/boards", response={201: BoardOut})
def create_board(request, payload: BoardIn):
    """Create a board for the authenticated user, starting with the default columns."""
    with transaction.atomic():
        board = Board.objects.create(owner=request.auth, **payload.dict())
        BoardColumn.objects.bulk_create(
            BoardColumn(board=board, title=title, position=position)
            for position, title in enumerate(DEFAULT_COLUMN_TITLES)
        )
    return 201, board

@router.get("/boards/{board_id}", response=BoardOut)
def get_board(request, board_id: int):
    """Retrieve a board with its columns and tasks."""
    return get_accessible_board(request.auth, board_id)

@router.patch("/boards/{board_id}", response=BoardOut)
def update_board(request, board_id: int, payload: BoardIn):
    """Update a board's title and description."""
    board = get_accessible_board(request.auth, board_id)
    board.title = payload.title
    board.description = payload.description
    board.save()
    return board

@router.delete("/boards/{board_id}")
def delete_board(request, board_id: int):
    """Delete a board and its related columns and tasks."""
    get_owned_board(request.auth, board_id).delete()
    return {"success": True}

@router.post("/boards/{board_id}/collaborators")
def share_board(request, board_id: int, payload: BoardShareIn):
    """Share a board with an accepted friend."""

    # only the board owner can manage collaborators
    board = get_owned_board(request.auth, board_id)

    # retrieve the user who will receive access
    friend = get_object_or_404(User, id=payload.friend_id)

    # verify the user is an accepted friend
    if not request.auth.is_friends_with(friend):
        raise HttpError(403, "You can only share boards with accepted friends.")

    # grant the friend access
    board.collaborators.add(friend)

    return {"success": True, "message": "Board shared successfully."}

@router.delete("/boards/{board_id}/collaborators/{collaborator_id}")
def remove_collaborators(request, board_id: int, collaborator_id: int):
    """Revoke a collaborator's access to a board or leave a shared board."""

    # retrieve the board if the user owns it or has access to it
    board = get_accessible_board(request.auth, board_id)

    # retrieve the collaborator
    friend = get_object_or_404(User, id=collaborator_id)

    # Verify that the user currently has access.
    if not board.collaborators.filter(id=friend.id).exists():
        raise HttpError(404, "User is not a collaborator on this board.")

    # only the owner can remove other collaborators
    # collaborators can only remove themselves
    if request.auth != board.owner and request.auth.id != collaborator_id:
        raise HttpError(403, "You can only remove yourself from a shared board.")

    # remove the relationship from the many-to-many table
    board.collaborators.remove(friend)

    return {"success": True, "message": "Collaborator access successfully revoked."}

# -----------------
# Column Endpoints
# -----------------

@router.post("/boards/{board_id}/columns", response=BoardColumnOut)
def create_column(request, board_id: int, payload: BoardColumnIn):
    """Create a column on a board owned by the authenticated user."""
    board = get_accessible_board(request.auth, board_id)
    last = board.columns.aggregate(m=Max("position"))["m"]
    return BoardColumn.objects.create(
        board=board,
        title=payload.title,
        position=0 if last is None else last + 1,
    )

@router.patch("/columns/{column_id}", response=BoardColumnOut)
def update_column(request, column_id: int, payload: BoardColumnUpdateIn):
    """Update the supplied fields of a column."""
    column = get_accessible_column(request.auth, column_id)
    updates = payload.dict(exclude_unset=True)

    if not updates:
        raise HttpError(400, "No fields provided for update.")

    with transaction.atomic():
        if "title" in updates:
            column.title = updates["title"]
        if "position" in updates:
            others = [c for c in column.board.columns.all() if c.id != column.id]
            idx = max(0, min(updates["position"], len(others)))
            others.insert(idx, column)
            _reindex(others)
        else:
            column.save()

    return column

@router.delete("/columns/{column_id}")
def delete_column(request, column_id: int):
    """Delete a column and its tasks."""
    column = get_accessible_column(request.auth, column_id)
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
    column = get_accessible_column(request.auth, column_id)
    tags = get_owned_tags(request.auth, payload.tag_ids)
    last = column.tasks.aggregate(m=Max("position"))["m"]

    with transaction.atomic():
        task = Task.objects.create(
            column=column,
            title=payload.title,
            description=payload.description,
            priority=payload.priority.value if payload.priority is not None else None,
            position=0 if last is None else last + 1,
        )
        task.tags.set(tags)

    return task

@router.patch("/tasks/{task_id}", response=TaskOut)
def update_task(request, task_id: int, payload: TaskUpdateIn):
    """Update the supplied fields of a task."""
    task = get_accessible_task(request.auth, task_id)
    updates = payload.dict(exclude_unset=True) # get fields included in request

    # get the owned tasks using the helper since tags are a
    # relationship, not a normal task field
    tag_ids = updates.pop("tag_ids", None)
    tags = None

    if tag_ids is not None:
        tags = get_owned_tags(request.auth, tag_ids)

    with transaction.atomic():
        for field, value in updates.items():
            if field == "priority":
                value = value.value if value is not None else None
            elif value is None:
                continue

            setattr(task, field, value)
        if updates:
            task.save()

        if tags is not None:
            task.tags.set(tags)

    return task

@router.delete("/tasks/{task_id}")
def delete_task(request, task_id: int):
    """Delete a task."""
    task = get_accessible_task(request.auth, task_id)
    column = task.column
    with transaction.atomic():
        task.delete()
        _reindex(list(column.tasks.all()))
    return {"success": True}

@router.post("/tasks/{task_id}/move", response=TaskOut)
def move_task(request, task_id: int, payload: TaskMoveIn):
    """Move a task to another column and position."""
    task = get_accessible_task(request.auth, task_id)
    src = task.column
    dest = get_accessible_column(request.auth, payload.to_column_id)
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

# ------------------
# Tag Endpoints
# ------------------
@router.get("/tags", response=list[TagOut])
def list_tags(request):
    """List tags belonging to the authenticated user."""
    return Tag.objects.filter(user=request.auth)

@router.post("/tags", response={201: TagOut})
def create_tag(request, payload: TagIn):
    """Create a tag for the authenticated user."""
    name = payload.name.strip()

    if not name:
        raise HttpError(400, "Tag name cannot be empty.")

    try:
        with transaction.atomic():
            tag = Tag.objects.create(
                user=request.auth,
                name=name,
            )
    except IntegrityError:
        raise HttpError(409, "A tag with this name already exists.")

    return 201, tag

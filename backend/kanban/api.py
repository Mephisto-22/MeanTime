from datetime import timedelta
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja_jwt.authentication import JWTAuth
from django.db.models import Prefetch, Max
from django.db import IntegrityError, transaction
from ninja.errors import HttpError
from ninja import Router
from .models import Board, BoardColumn, Task, TaskTimer, TaskTimeEntry, Tag, TimerMode, TimerState
from .schemas import (
    TaskIn, 
    TaskOut, 
    TaskUpdateIn,
    BoardColumnIn, 
    BoardColumnOut, 
    BoardIn, 
    BoardOut, 
    TaskMoveIn,
    TagIn,
    TagOut,
    TaskTimerOut,
    TaskTimerPatchIn,
    TaskTimeEntryIn,
    TaskTimeEntryUpdateIn,
    TaskTimeEntryOut,
)

router = Router(tags=["Kanban"])

# Every new board starts with these columns, left to right.
DEFAULT_COLUMN_TITLES = ("To Do", "In Progress", "Done")

# Helpers

def reconcile_expired_countdowns(user):
    """
    Find any RUNNING COUNT_DOWN timers belonging to user's boards that have expired,
    commit TaskTimeEntry records capped at target_duration_seconds, and reset timers to IDLE.
    """
    now = timezone.now()
    running_timers = TaskTimer.objects.select_related("task__column__board").filter(
        task__column__board__owner=user,
        state=TimerState.RUNNING,
        mode=TimerMode.COUNT_DOWN,
        started_at__isnull=False,
    )
    for timer in running_timers:
        target = timer.target_duration_seconds or 0
        elapsed_prior = timer.elapsed_seconds or 0
        remaining = max(0, target - elapsed_prior)
        if remaining > 0 and now >= timer.started_at + timedelta(seconds=remaining):
            with transaction.atomic():
                ended_at = timer.started_at + timedelta(seconds=remaining)
                TaskTimeEntry.objects.create(
                    task=timer.task,
                    user=user,
                    started_at=timer.started_at - timedelta(seconds=elapsed_prior),
                    ended_at=ended_at,
                    duration_seconds=target,
                    note="Completed countdown session",
                )
                timer.state = TimerState.IDLE
                timer.started_at = None
                timer.elapsed_seconds = 0
                timer.save()

def get_board_queryset(user):
    task_qs = Task.objects.select_related("timer").prefetch_related("tags", "time_entries")
    col_qs = BoardColumn.objects.prefetch_related(Prefetch("tasks", queryset=task_qs))
    return Board.objects.filter(owner=user).prefetch_related(Prefetch("columns", queryset=col_qs))

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
    reconcile_expired_countdowns(user)
    return get_object_or_404(
        Task.objects.select_related("column__board", "timer").prefetch_related("time_entries").filter(
            column__board__owner=user
        ),
        id=task_id
    )

def get_owned_time_entry(user, entry_id: int) -> TaskTimeEntry:
    """Retrieve a time entry belonging to the authenticated user's task."""
    return get_object_or_404(
        TaskTimeEntry.objects.select_related("task__column__board").filter(
            task__column__board__owner=user
        ),
        id=entry_id
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
    """List boards owned by the authenticated user."""
    reconcile_expired_countdowns(request.auth)
    return get_board_queryset(request.auth)

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
    reconcile_expired_countdowns(request.auth)
    board = get_object_or_404(
        get_board_queryset(request.auth),
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
    task = get_owned_task(request.auth, task_id)
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

# ------------------
# Timer Endpoints
# ------------------

@router.patch("/tasks/{task_id}/timer", response=TaskTimerOut)
def patch_task_timer(request, task_id: int, payload: TaskTimerPatchIn):
    """Configure or transition the execution state of a task's timer."""
    task = get_owned_task(request.auth, task_id)
    with transaction.atomic():
        timer, _ = TaskTimer.objects.select_for_update().get_or_create(task=task)
        data = payload.dict(exclude_unset=True)

        new_state = data.get("state")
        prev_state = timer.state
        elapsed = data.get("elapsed_seconds")
        if elapsed is None:
            elapsed = timer.elapsed_seconds

        # If transitioning to IDLE after an active run (or elapsed_seconds > 0)
        if new_state == TimerState.IDLE and (prev_state in (TimerState.RUNNING, TimerState.PAUSED) or elapsed > 0):
            total_duration = elapsed
            if prev_state == TimerState.RUNNING and timer.started_at:
                anchor_delta = int((timezone.now() - timer.started_at).total_seconds())
                if anchor_delta > 0 and data.get("elapsed_seconds") is None:
                    total_duration += anchor_delta

            if total_duration > 0:
                end_time = timezone.now()
                start_time = timer.started_at or (end_time - timedelta(seconds=total_duration))
                TaskTimeEntry.objects.create(
                    task=task,
                    user=request.auth,
                    started_at=start_time,
                    ended_at=end_time,
                    duration_seconds=total_duration,
                    note="",
                )

            # Reset ephemeral runtime fields
            timer.state = TimerState.IDLE
            timer.started_at = None
            timer.elapsed_seconds = 0
            if "mode" in data and data["mode"] is not None:
                timer.mode = data["mode"]
            if "target_duration_seconds" in data:
                timer.target_duration_seconds = data["target_duration_seconds"]
            timer.save()
            return timer

        for field, value in data.items():
            if field == "state":
                timer.state = value
            elif field == "mode":
                if value is not None:
                    timer.mode = value
            elif field == "target_duration_seconds":
                timer.target_duration_seconds = value
            elif field == "started_at":
                timer.started_at = value
            elif field == "elapsed_seconds":
                if value is not None:
                    timer.elapsed_seconds = value

        timer.save()
        return timer

# ------------------
# Time Entry Endpoints
# ------------------

@router.get("/tasks/{task_id}/time-entries", response=list[TaskTimeEntryOut])
def list_time_entries(request, task_id: int):
    """List historical time entries recorded for a task."""
    task = get_owned_task(request.auth, task_id)
    return task.time_entries.all()

@router.post("/tasks/{task_id}/time-entries", response={201: TaskTimeEntryOut})
def create_time_entry(request, task_id: int, payload: TaskTimeEntryIn):
    """Manually log a past work session for a task."""
    task = get_owned_task(request.auth, task_id)
    data = payload.dict()
    start = data["started_at"]
    end = data.get("ended_at")
    duration = data.get("duration_seconds", 0)

    if end is None and duration > 0:
        end = start + timedelta(seconds=duration)
    elif end is not None and duration <= 0:
        duration = max(0, int((end - start).total_seconds()))

    with transaction.atomic():
        entry = TaskTimeEntry.objects.create(
            task=task,
            user=request.auth,
            started_at=start,
            ended_at=end,
            duration_seconds=duration,
            note=data.get("note", ""),
        )
    return 201, entry

@router.patch("/time-entries/{entry_id}", response=TaskTimeEntryOut)
def update_time_entry(request, entry_id: int, payload: TaskTimeEntryUpdateIn):
    """Partially update a recorded time entry with duration/timestamp synchronization."""
    entry = get_owned_time_entry(request.auth, entry_id)
    updates = payload.dict(exclude_unset=True)

    with transaction.atomic():
        if "duration_seconds" in updates and "ended_at" not in updates:
            new_duration = updates["duration_seconds"]
            entry.duration_seconds = new_duration
            start = updates.get("started_at", entry.started_at)
            entry.started_at = start
            entry.ended_at = start + timedelta(seconds=new_duration)
        elif ("started_at" in updates or "ended_at" in updates) and "duration_seconds" not in updates:
            start = updates.get("started_at", entry.started_at)
            end = updates.get("ended_at", entry.ended_at)
            entry.started_at = start
            entry.ended_at = end
            if start and end:
                entry.duration_seconds = max(0, int((end - start).total_seconds()))
        else:
            for field, val in updates.items():
                setattr(entry, field, val)

        if "note" in updates:
            entry.note = updates["note"]

        entry.save()
    return entry

@router.delete("/time-entries/{entry_id}")
def delete_time_entry(request, entry_id: int):
    """Delete a recorded work session."""
    entry = get_owned_time_entry(request.auth, entry_id)
    entry.delete()
    return {"success": True}

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

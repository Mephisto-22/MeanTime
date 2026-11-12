from datetime import timedelta
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Prefetch, Max, Q, Exists, OuterRef, Case, When, Value, BooleanField, Sum
from django.db.models.functions import Coalesce
from django.db import IntegrityError, transaction
from django.contrib.auth import get_user_model
from ninja.errors import HttpError
from ninja import Router
from users.models import UserBlock
from .models import Board, BoardColumn, Task, TaskTimer, TaskTimeEntry, Tag, TimerMode, TimerState
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
    TaskTimerOut,
    TaskTimerPatchIn,
    TaskTimeEntryIn,
    TaskTimeEntryUpdateIn,
    TaskTimeEntryOut,
)

router = Router(tags=["Kanban"])

# get the custom user model
User = get_user_model()

# Every new board starts with these columns, left to right.
DEFAULT_COLUMN_TITLES = ("To Do", "In Progress", "Done")

# Helpers

def get_accessible_boards(user):
    """
    Return boards owned by or shared with the user,
    excluding boards where either user has blocked the other.
    """

    # Check whether the board owner blocked the requesting user
    owner_blocked_user = UserBlock.objects.filter(
        blocker=OuterRef("owner"),
        blocked=user,
    )

    # Check whether the requesting user blocked the board owner
    user_blocked_owner = UserBlock.objects.filter(
        blocker=user,
        blocked=OuterRef("owner")
    )

    return Board.objects.filter(
        Q(owner=user) | Q(collaborators=user)
    ).annotate(owner_blocked_user=Exists(owner_blocked_user),
               user_blocked_owner=Exists(user_blocked_owner),
               is_owner=Case(
                   When(owner=user, then=Value(True)),
                   default=Value(False),
                   output_field=BooleanField(),
               )
    ).filter(
        owner_blocked_user=False,
        user_blocked_owner=False,
    ).distinct()

def session_already_recorded(task, started_at) -> bool:
    """Return whether a time entry already exists for this timer session.

    An entry keeps its timer's started_at, so saving the same session twice
    (for example, a client stop racing the countdown cleanup) matches exactly.
    """
    return TaskTimeEntry.objects.filter(task=task, started_at=started_at).exists()

def reconcile_expired_countdowns(user):
    """
    Find any RUNNING COUNT_DOWN timers belonging to user's boards that have expired,
    commit TaskTimeEntry records capped at target_duration_seconds, and reset timers to IDLE.
    """
    now = timezone.now()
    candidate_ids = list(TaskTimer.objects.filter(
        task__column__board__owner=user,
        state=TimerState.RUNNING,
        mode=TimerMode.COUNT_DOWN,
        started_at__isnull=False,
    ).values_list("id", flat=True))
    for timer_id in candidate_ids:
        with transaction.atomic():
            # Lock the timer, like the stop endpoint does, so a stop arriving at
            # the same moment waits and then sees the timer already IDLE.
            timer = (
                TaskTimer.objects.select_for_update()
                .select_related("task")
                .filter(id=timer_id, state=TimerState.RUNNING)
                .first()
            )
            if timer is None:
                continue
            target = timer.target_duration_seconds or 0
            elapsed_prior = timer.elapsed_seconds or 0
            remaining = max(0, target - elapsed_prior)
            anchor = timer.last_resumed_at or timer.started_at
            if not (remaining > 0 and anchor and now >= anchor + timedelta(seconds=remaining)):
                continue

            ended_at = anchor + timedelta(seconds=remaining)
            start_time = timer.started_at or (ended_at - timedelta(seconds=target))
            if not session_already_recorded(timer.task, start_time):
                TaskTimeEntry.objects.create(
                    task=timer.task,
                    user=user,
                    started_at=start_time,
                    ended_at=ended_at,
                    duration_seconds=target,
                    note="Completed countdown session",
                )
            timer.state = TimerState.IDLE
            timer.started_at = None
            timer.last_resumed_at = None
            timer.last_paused_at = None
            timer.elapsed_seconds = 0
            timer.save()

def get_board_queryset(user):
    # Each task's tracked time is summed in the same query that loads the tasks,
    # so a board's totals don't cost one extra query per task. Django skips
    # Meta.ordering on aggregated queries, so the order is restated here.
    task_qs = (
        Task.objects.select_related("timer")
        .prefetch_related("tags")
        .annotate(total_seconds=Coalesce(Sum("time_entries__duration_seconds"), 0))
        .order_by(*Task._meta.ordering)
    )
    col_qs = BoardColumn.objects.prefetch_related(Prefetch("tasks", queryset=task_qs))
    return (
        get_accessible_boards(user)
        .select_related("owner")
        .prefetch_related("collaborators", Prefetch("columns", queryset=col_qs))
    )

def get_owned_board(user, board_id: int) -> Board:
    """Retrieve a board owned by the authenticated user."""
    return get_object_or_404(
        Board.objects.filter(owner=user),
        id=board_id
    )

def get_accessible_board(user, board_id: int) -> Board:
    """Retrieve a board owned by or shared with the user."""
    return get_object_or_404(
        get_board_queryset(user),
        id=board_id,
    )

def get_accessible_column(user, column_id: int) -> BoardColumn:
    """Retrieve a column on a board the user can access."""
    return get_object_or_404(
        BoardColumn.objects.filter(
            board__in=get_accessible_boards(user)
        ),
        id=column_id,
    )

def get_accessible_task(user, task_id: int) -> Task:
    """Retrieve a task on a board the user can access."""
    return get_object_or_404(
        Task.objects.select_related("column__board").filter(
            column__board__in=get_accessible_boards(user)
        ),
        id=task_id,
    )

def get_owned_task(user, task_id: int) -> Task:
    """Retrieve a task belonging to the authenticated user."""
    reconcile_expired_countdowns(user)
    return get_object_or_404(
        Task.objects.select_related("column__board", "timer").prefetch_related("time_entries").filter(
            column__board__owner=user
        ),
        id=task_id,
    )

def get_owned_time_entry(user, entry_id: int) -> TaskTimeEntry:
    """Retrieve a time entry belonging to the user, created by the user, or on a board accessible to the user."""
    return get_object_or_404(
        TaskTimeEntry.objects.select_related("task__column__board").filter(
            Q(user=user) | Q(task__column__board__in=get_accessible_boards(user))
        ).distinct(),
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
    """List boards owned by or shared with the authenticated user."""
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
    board.is_owner = True
    return 201, board

@router.get("/boards/{board_id}", response=BoardOut)
def get_board(request, board_id: int):
    """Retrieve a board with its columns and tasks."""
    reconcile_expired_countdowns(request.auth)
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
        auto_clear_duration_seconds=payload.auto_clear_duration_seconds,
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
        if "auto_clear_duration_seconds" in updates:
            column.auto_clear_duration_seconds = updates["auto_clear_duration_seconds"]
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
# Timer Endpoints
# ------------------

@router.patch("/tasks/{task_id}/timer", response=TaskTimerOut)
def patch_task_timer(request, task_id: int, payload: TaskTimerPatchIn):
    """Configure or transition the execution state of a task's timer."""
    task = get_accessible_task(request.auth, task_id)
    with transaction.atomic():
        timer, _ = TaskTimer.objects.select_for_update().get_or_create(task=task)
        data = payload.dict(exclude_unset=True)

        new_state = data.get("state")
        prev_state = timer.state
        elapsed = data.get("elapsed_seconds")
        if elapsed is None:
            elapsed = timer.elapsed_seconds

        # If transitioning to IDLE
        if new_state == TimerState.IDLE:
            if prev_state in (TimerState.RUNNING, TimerState.PAUSED):
                total_duration = elapsed
                if prev_state == TimerState.RUNNING:
                    anchor = timer.last_resumed_at or timer.started_at
                    if anchor:
                        anchor_delta = int((timezone.now() - anchor).total_seconds())
                        if anchor_delta > 0 and data.get("elapsed_seconds") is None:
                            total_duration += anchor_delta
                    end_time = timezone.now()
                else:
                    end_time = timer.last_paused_at or timezone.now()

                if total_duration > 0:
                    start_time = timer.started_at or (end_time - timedelta(seconds=total_duration))
                    default_note = "Completed countdown session" if timer.mode == TimerMode.COUNT_DOWN else ""
                    if not session_already_recorded(task, start_time):
                        TaskTimeEntry.objects.create(
                            task=task,
                            user=request.auth,
                            started_at=start_time,
                            ended_at=end_time,
                            duration_seconds=total_duration,
                            note=default_note,
                        )

            # Reset ephemeral runtime fields
            timer.state = TimerState.IDLE
            timer.started_at = None
            timer.last_resumed_at = None
            timer.last_paused_at = None
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
                if value is not None or prev_state == TimerState.IDLE:
                    timer.started_at = value
            elif field == "last_resumed_at":
                timer.last_resumed_at = value
            elif field == "last_paused_at":
                timer.last_paused_at = value
            elif field == "elapsed_seconds":
                if value is not None:
                    timer.elapsed_seconds = value

        if new_state == TimerState.RUNNING:
            if not timer.started_at:
                timer.started_at = timezone.now()
            if not timer.last_resumed_at:
                timer.last_resumed_at = timezone.now()
            timer.last_paused_at = None
        elif new_state == TimerState.PAUSED:
            if prev_state == TimerState.RUNNING and data.get("elapsed_seconds") is None:
                anchor = timer.last_resumed_at or timer.started_at
                if anchor:
                    delta = max(0, int((timezone.now() - anchor).total_seconds()))
                    timer.elapsed_seconds += delta
            timer.last_resumed_at = None
            if not timer.last_paused_at:
                timer.last_paused_at = timezone.now()

        timer.save()
        return timer

# ------------------
# Time Entry Endpoints
# ------------------

@router.get("/tasks/{task_id}/time-entries", response=list[TaskTimeEntryOut])
def list_time_entries(request, task_id: int):
    """List historical time entries recorded for a task."""
    task = get_accessible_task(request.auth, task_id)
    return task.time_entries.select_related("user").all()

@router.post("/tasks/{task_id}/time-entries", response={201: TaskTimeEntryOut})
def create_time_entry(request, task_id: int, payload: TaskTimeEntryIn):
    """Manually log a past work session for a task."""
    task = get_accessible_task(request.auth, task_id)
    data = payload.dict()
    start = data["started_at"]
    end = data.get("ended_at")
    duration = data.get("duration_seconds", 0)

    if end is not None and end < start:
        raise HttpError(400, "End time cannot precede start time")

    if end is None and duration > 0:
        end = start + timedelta(seconds=duration)
    elif end is not None and duration <= 0:
        duration = max(0, int((end - start).total_seconds()))
    elif end is not None and duration > int((end - start).total_seconds()):
        raise HttpError(400, "Duration cannot exceed elapsed time range")

    board = task.column.board
    target_user = request.auth
    target_user_id = data.get("user_id")

    if target_user_id is not None:
        is_owner = (board.owner_id == target_user_id)
        is_collab = board.collaborators.filter(id=target_user_id).exists()
        if not (is_owner or is_collab):
            raise HttpError(400, "Selected user is not a member of this board")
        if target_user_id == request.auth.id:
            target_user = request.auth
        else:
            target_user = get_object_or_404(User, id=target_user_id)

    with transaction.atomic():
        entry = TaskTimeEntry.objects.create(
            task=task,
            user=target_user,
            started_at=start,
            ended_at=end,
            duration_seconds=duration,
            note=data.get("note", ""),
        )
    return 201, entry

@router.patch("/time-entries/{entry_id}", response=TaskTimeEntryOut)
def update_time_entry(request, entry_id: int, payload: TaskTimeEntryUpdateIn):
    """Partially update a recorded time entry, enforcing duration_seconds <= ended_at - started_at."""
    entry = get_owned_time_entry(request.auth, entry_id)
    updates = payload.dict(exclude_unset=True)

    with transaction.atomic():
        start = updates.get("started_at", entry.started_at)
        end = updates.get("ended_at", entry.ended_at)
        duration = updates.get("duration_seconds", entry.duration_seconds)

        if start and end:
            if end < start:
                raise HttpError(400, "End time cannot precede start time")
            if duration is not None and duration > int((end - start).total_seconds()):
                raise HttpError(400, "Duration cannot exceed elapsed time range")

        if "user_id" in updates:
            new_user_id = updates.pop("user_id")
            if new_user_id is not None:
                board = entry.task.column.board
                is_owner = (board.owner_id == new_user_id)
                is_collab = board.collaborators.filter(id=new_user_id).exists()
                if not (is_owner or is_collab):
                    raise HttpError(400, "Selected user is not a member of this board")
                if new_user_id == request.auth.id:
                    entry.user = request.auth
                else:
                    entry.user = get_object_or_404(User, id=new_user_id)
            else:
                entry.user = None

        for field, val in updates.items():
            setattr(entry, field, val)

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

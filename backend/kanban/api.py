from .events.subscribers import subscribe_to_board
from .events.publisher import publish_board_event
from datetime import timedelta
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Prefetch, Max, Q, Exists, OuterRef, Case, When, Value, BooleanField, Sum
from django.db.models.functions import Coalesce
from django.db import IntegrityError, transaction
from django.contrib.auth import get_user_model
from django.conf import settings
from django.http import StreamingHttpResponse
from ninja.errors import HttpError
from ninja import Router
from users.models import UserBlock
from .models import (
    Board,
    BoardMembership,
    BoardColumn,
    Task,
    TaskTimer,
    TaskTimeEntry,
    Tag,
    TimerMode,
    TimerState,
    RecurringTask,
    RecurrenceCadence,
)
from .recurrence import calculate_next_run_at
from .schemas import (
    TaskIn, 
    TaskOut, 
    TaskUpdateIn,
    RecurringTaskIn,
    RecurringTaskPatchIn,
    RecurringTaskOut,
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
from .event_schemas import BoardEventType
from .sse import (
    SSE_RESPONSE_HEADERS,
    format_sse_comment,
    format_sse_event,
    format_sse_retry,
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
        Q(owner=user) | Q(memberships__user=user)
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

def get_editable_boards(user):
    """
    Return boards the user can modify:
    boards they own or boards where they have the EDITOR role.
    """

    return (
        get_accessible_boards(user)
        .filter(
            Q(owner=user)
            | Q(
                memberships__user=user,
                memberships__role=BoardMembership.Role.EDITOR,
            )
        )
        .distinct()
    )

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
                entry = TaskTimeEntry.objects.create(
                    task=timer.task,
                    user=user,
                    started_at=start_time,
                    ended_at=ended_at,
                    duration_seconds=target,
                    note="Completed countdown session",
                )
                publish_event_on_commit(
                    board_id=timer.task.column.board_id,
                    actor_id=user.id,
                    event_type=BoardEventType.TIME_ENTRY_CREATED,
                    data={
                        "task_id": timer.task.id,
                        "time_entry": serialize_time_entry(entry),
                    },
                )
            timer.state = TimerState.IDLE
            timer.started_at = None
            timer.last_resumed_at = None
            timer.last_paused_at = None
            timer.elapsed_seconds = 0
            timer.save()
            timer.task.column_activity_at = now
            timer.task.save(update_fields=["column_activity_at", "updated_at"])

            # publish updated timer event to subscribers
            publish_event_on_commit(
                board_id=timer.task.column.board_id,
                actor_id=user.id,
                event_type=BoardEventType.TASK_TIMER_UPDATED,
                data=get_timer_event_data(timer.task, timer),
            )

def get_board_queryset(user):
    # Each task's tracked time is summed in the same query that loads the tasks,
    # so a board's totals don't cost one extra query per task. Django skips
    # Meta.ordering on aggregated queries, so the order is restated here.
    task_qs = (
        Task.objects.active()
        .select_related("timer", "recurring_task")
        .prefetch_related("tags")
        .annotate(total_seconds=Coalesce(Sum("time_entries__duration_seconds"), 0))
        .order_by(*Task._meta.ordering)
    )
    col_qs = BoardColumn.objects.prefetch_related(Prefetch("tasks", queryset=task_qs))
    return (
        get_accessible_boards(user)
        .select_related("owner")
        .prefetch_related("memberships__user", Prefetch("columns", queryset=col_qs))
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
        Task.objects.select_related("column__board", "recurring_task", "timer").filter(
            column__board__in=get_accessible_boards(user)
        ),
        id=task_id,
    )

def get_accessible_recurring_task(user, recurring_task_id: int) -> RecurringTask:
    """Retrieve a recurring task blueprint on a board the user can access."""
    return get_object_or_404(
        RecurringTask.objects.select_related("board").prefetch_related("tags").filter(
            board__in=get_accessible_boards(user)
        ),
        id=recurring_task_id,
    )

def require_board_edit_access(user, board_id: int) -> None:
    """Raise 403 when the user cannot edit an already accessible board."""
    if not get_editable_boards(user).filter(id=board_id).exists():
        raise HttpError(403, "You do not have permission to edit this board.")

def get_editable_board(user, board_id: int) -> Board:
    """Retrieve an accessible board and require edit permission."""
    board = get_object_or_404(
        get_accessible_boards(user),
        id=board_id,
    )
    require_board_edit_access(user, board.id)
    return board

def get_editable_column(user, column_id: int) -> BoardColumn:
    """Retrieve a column on a board the user can modify."""
    column = get_accessible_column(user, column_id)
    require_board_edit_access(user, column.board_id)
    return column

def get_editable_task(user, task_id: int) -> Task:
    task = get_accessible_task(user, task_id)
    require_board_edit_access(user, task.column.board_id)
    return task

def get_editable_recurring_task(user, recurring_task_id: int) -> RecurringTask:
    """Retrieve a recurring task on a board the user can modify."""
    recurring_task = get_accessible_recurring_task(user, recurring_task_id)
    require_board_edit_access(user, recurring_task.board_id)
    return recurring_task

def create_recurring_task_blueprint(
    user,
    board: Board,
    title: str,
    description: str,
    priority: str | None,
    cadence: str | RecurrenceCadence,
    days_of_week: list[int],
    day_of_month: int | None,
    time_of_day: str,
    timezone_name: str,
    default_timer_mode: str | TimerMode,
    target_duration_seconds: int | None,
    tags=None,
) -> RecurringTask:
    """Colocated helper to initialize and persist a RecurringTask blueprint."""
    cadence_val = cadence.value if hasattr(cadence, "value") else str(cadence)
    timer_mode_val = default_timer_mode.value if hasattr(default_timer_mode, "value") else str(default_timer_mode)
    priority_val = priority.value if hasattr(priority, "value") else priority

    from kanban.recurrence import get_zone_info, parse_time_of_day
    parsed_time_of_day = parse_time_of_day(time_of_day)

    # When cadence is MONTHLY and day_of_month is omitted, anchor to the current day in user timezone
    if cadence_val == RecurrenceCadence.MONTHLY and day_of_month is None:
        tz = get_zone_info(timezone_name)
        day_of_month = timezone.now().astimezone(tz).day

    rec_task = RecurringTask(
        board=board,
        creator=user,
        title=title,
        description=description,
        priority=priority_val,
        cadence=cadence_val,
        days_of_week=days_of_week,
        day_of_month=day_of_month,
        time_of_day=parsed_time_of_day,
        timezone=timezone_name,
        default_timer_mode=timer_mode_val,
        target_duration_seconds=target_duration_seconds,
        is_active=True,
    )
    rec_task.next_run_at = rec_task.calculate_next_run()
    rec_task.save()
    if tags is not None:
        rec_task.tags.set(tags)
    return rec_task

def create_task_in_column(user, column: BoardColumn, payload: TaskIn) -> Task:
    tags = get_available_board_tags(user, column.board, payload.tag_ids)
    last = column.tasks.filter(archived_at__isnull=True).aggregate(m=Max("position"))["m"]

    with transaction.atomic():
        rec_task = None
        if payload.recurrence is not None:
            tz_name = payload.recurrence.timezone or getattr(user, "timezone", "UTC") or "UTC"
            rec_task = create_recurring_task_blueprint(
                user=user,
                board=column.board,
                title=payload.title,
                description=payload.description,
                priority=payload.priority,
                cadence=payload.recurrence.cadence,
                days_of_week=payload.recurrence.days_of_week,
                day_of_month=payload.recurrence.day_of_month,
                time_of_day=payload.recurrence.time_of_day,
                timezone_name=tz_name,
                default_timer_mode=payload.timer_mode or TimerMode.NONE,
                target_duration_seconds=payload.target_duration_seconds,
                tags=tags,
            )

        task = Task.objects.create(
            column=column,
            recurring_task=rec_task,
            title=payload.title,
            description=payload.description,
            priority=payload.priority.value if payload.priority is not None else None,
            position=0 if last is None else last + 1,
            column_activity_at=timezone.now(),
        )
        task.tags.set(tags)

        if payload.timer_mode is not None and payload.timer_mode != TimerMode.NONE:
            timer = TaskTimer.objects.create(
                task=task,
                mode=payload.timer_mode.value if hasattr(payload.timer_mode, "value") else str(payload.timer_mode),
                target_duration_seconds=payload.target_duration_seconds,
                state=TimerState.IDLE,
            )
            task.timer = timer

    return task

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

def get_available_board_tags(user, board, tag_ids: list[int]) -> list[Tag]:
    """Return requested tags if they belong to the board owner or a collaborator."""
    if len(tag_ids) != len(set(tag_ids)):
        raise HttpError(400, "Duplicate tag IDs are not allowed.")

    member_ids = [board.owner_id]
    member_ids.extend(
        board.memberships.values_list("user_id", flat=True)
    )

    tags = list(Tag.objects.filter(user_id__in=member_ids, id__in=tag_ids))

    if len(tags) != len(tag_ids):
        raise HttpError(400, "One or more tags are invalid or do not belong to a board member.")

    return tags


def _reindex(items):
    """Rewrite position 0..n-1."""
    for i, obj in enumerate(items):
        obj.position = i
        obj.save(update_fields=["position"])

def publish_event_on_commit(board_id: int, actor_id: int, event_type: BoardEventType, data: dict):
    """Schedule a board event tobe published after transaction commit."""

    transaction.on_commit(
        lambda: publish_board_event(
            board_id=board_id,
            actor_id=actor_id,
            event_type=event_type,
            data=data,
        ),
        robust=True,
    )

def serialize_task(task: Task) -> dict:
    """Serialize a task using the existing TaskOut schema."""

    return TaskOut.model_validate(
        task,
        from_attributes=True
    ).model_dump(mode="json")

def serialize_time_entry(entry: TaskTimeEntry) -> dict:
    """Serialize a time entry using the existing output schema."""
    return TaskTimeEntryOut.model_validate(
        entry,
        from_attributes=True,
    ).model_dump(mode="json")

def get_timer_event_data(task, timer):
    return {
        "task_id": task.id,
        "timer": {
            "id": timer.id,
            "mode": timer.mode,
            "state": timer.state,
            "target_duration_seconds": timer.target_duration_seconds,
            "elapsed_seconds": timer.elapsed_seconds,
            "started_at": timer.started_at,
            "last_resumed_at": timer.last_resumed_at,
            "last_paused_at": timer.last_paused_at,
        },
    }

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

@router.get("/boards/{board_id}/events")
def board_events(request, board_id: int):
    """Subscribe to board update events."""
    # Only allow board owners and collaborators to subscribe
    board = get_accessible_board(request.auth, board_id)

    response = StreamingHttpResponse(
        subscribe_to_board(board.id, request.auth.id),
        content_type="text/event-stream"
    )

    for header, value in SSE_RESPONSE_HEADERS.items():
        response[header] = value

    return response
                

@router.patch("/boards/{board_id}", response=BoardOut)
def update_board(request, board_id: int, payload: BoardIn):
    """Update a board's title and description as its owner."""
    board = get_owned_board(request.auth, board_id)
    board.title = payload.title
    board.description = payload.description
    board.save()

    # publish update event to subscribers
    publish_event_on_commit(
        board_id=board.id,
        actor_id=request.auth.id,
        event_type=BoardEventType.BOARD_UPDATED,
        data={
            "board": {
                "id": board.id,
                "title": board.title,
                "description": board.description
            }
        },
    )

    return board

@router.delete("/boards/{board_id}")
def delete_board(request, board_id: int):
    """Delete a board and its related columns and tasks."""
    board = get_owned_board(request.auth, board_id)

    with transaction.atomic():
        # publish deletion event to subscribers
        publish_event_on_commit(
            board_id=board.id,
            actor_id=request.auth.id,
            event_type=BoardEventType.BOARD_DELETED,
            data={},
        )

        # actually delete the board
        board.delete()

    return {"success": True}

@router.post("/boards/{board_id}/collaborators")
def share_board(request, board_id: int, payload: BoardShareIn):
    """Share a board with an accepted friend, or update their role if they are already a collaborator."""

    # only the board owner can manage collaborators
    board = get_owned_board(request.auth, board_id)

    # retrieve the user who will receive access
    friend = get_object_or_404(User, id=payload.friend_id)

    # Lock existing memberships so concurrent role changes are applied in order.
    with transaction.atomic():
        memberships = BoardMembership.objects.select_for_update()
        membership = memberships.filter(board=board, user=friend).first()
        created = False
        if membership is None:
            # Friendship is required for new invitations, not existing role changes.
            if not request.auth.is_friends_with(friend):
                raise HttpError(403, "You can only share boards with accepted friends.")
            membership, created = memberships.get_or_create(
                board=board,
                user=friend,
                defaults={"role": payload.role},
            )
        role_changed = membership.role != payload.role
        if role_changed:
            membership.role = payload.role
            membership.save(update_fields=["role"])

        if created or role_changed:
            publish_event_on_commit(
                board_id=board.id,
                actor_id=request.auth.id,
                event_type=BoardEventType.BOARD_COLLABORATOR_UPDATED,
                data={"user_id": friend.id, "role": membership.role},
            )

    return {"success": True, "message": "Board shared successfully."}

@router.delete("/boards/{board_id}/collaborators/{collaborator_id}")
def remove_collaborators(request, board_id: int, collaborator_id: int):
    """Revoke a collaborator's access to a board or leave a shared board."""

    # retrieve the board if the user owns it or has access to it
    board = get_accessible_board(request.auth, board_id)

    # retrieve the collaborator
    collaborator = get_object_or_404(User, id=collaborator_id)

    # Verify that the user currently has access.
    membership_exists = BoardMembership.objects.filter(
        board=board,
        user=collaborator,
    ).exists()

    if not membership_exists:
        raise HttpError(404, "User is not a collaborator on this board.")

    # only the owner can remove other collaborators
    # collaborators can only remove themselves
    if request.auth != board.owner and request.auth.id != collaborator_id:
        raise HttpError(403, "You can only remove yourself from a shared board.")

    # remove the relationship
    BoardMembership.objects.filter(
        board=board,
        user=collaborator,
    ).delete()

    # publish collaborator removal event. This goes to everyone subscribed to the board,
    # but only the connection belonging to the removed user will be terminated. This is
    # to catch the case that a collaborator is removed after they have already opened an
    # authorized SSE connection
    publish_event_on_commit(
        board_id=board.id,
        actor_id=request.auth.id,
        event_type=BoardEventType.BOARD_ACCESS_REVOKED,
        data={
            "user_id": collaborator.id,
        },
)

    return {"success": True, "message": "Collaborator access successfully revoked."}

# -----------------
# Column Endpoints
# -----------------

@router.post("/boards/{board_id}/columns", response=BoardColumnOut)
def create_column(request, board_id: int, payload: BoardColumnIn):
    """Create a column on a board owned by the authenticated user."""
    board = get_editable_board(request.auth, board_id)
    last = board.columns.aggregate(m=Max("position"))["m"]
    column = BoardColumn.objects.create(
        board=board,
        title=payload.title,
        position=0 if last is None else last + 1,
        auto_clear_duration_seconds=payload.auto_clear_duration_seconds,
    )

    # publish the creation event to subscribers
    publish_event_on_commit(
        board_id=board.id,
        actor_id=request.auth.id,
        event_type=BoardEventType.COLUMN_CREATED,
        data={
            "column": {
                "id": column.id,
                "title": column.title,
                "position": column.position,
                "board_id": board.id,
            }
        },
    )

    return column

@router.patch("/columns/{column_id}", response=BoardColumnOut)
def update_column(request, column_id: int, payload: BoardColumnUpdateIn):
    """Update the supplied fields of a column."""
    column = get_editable_column(request.auth, column_id)
    updates = payload.dict(exclude_unset=True)

    if not updates:
        raise HttpError(400, "No fields provided for update.")

    # atomically handle updating the supplied fields
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

    # publish the update event to subscribers
    publish_event_on_commit(
        board_id=column.board_id,
        actor_id=request.auth.id,
        event_type=BoardEventType.COLUMN_UPDATED,
        data={
            "column": {
                "id": column.id,
                "title": column.title,
                "position": column.position,
                "board_id": column.board_id,
            }
        },
    )

    return column

@router.delete("/columns/{column_id}")
def delete_column(request, column_id: int):
    """Delete a column and its tasks."""
    column = get_editable_column(request.auth, column_id)
    board = column.board
    board_id = column.board_id
    column_id = column.id

    # atomically 
    with transaction.atomic():
        # delete column and reindex any other columns
        column.delete()
        _reindex(list(board.columns.all()))

        # publish deletion event to subscribers
        publish_event_on_commit(
            board_id=board_id,
            actor_id=request.auth.id,
            event_type=BoardEventType.COLUMN_DELETED,
            data={
                "column_id": column_id,
            },
        )
    return {"success": True}


# ------------------
# Task Endpoints
# ------------------

@router.post("/columns/{column_id}/tasks", response=TaskOut)
def create_task(request, column_id: int, payload: TaskIn):
    """Create a task in a column."""
    column = get_editable_column(request.auth, column_id)
    with transaction.atomic():
        task = create_task_in_column(request.auth, column, payload)

        # publish creation event to subscribers
        publish_event_on_commit(
            board_id=column.board_id,
            actor_id=request.auth.id,
            event_type=BoardEventType.TASK_CREATED,
            data={
                "task": serialize_task(task),
            },
        )

    return task

@router.patch("/tasks/{task_id}", response=TaskOut)
def update_task(request, task_id: int, payload: TaskUpdateIn):
    """Update the supplied fields of a task."""
    task = get_editable_task(request.auth, task_id)
    updates = payload.dict(exclude_unset=True) # get fields included in request

    tag_ids = updates.pop("tag_ids", None)
    apply_to_future = updates.pop("apply_to_future", False)
    timer_mode = updates.pop("timer_mode", None)
    target_duration_seconds = updates.pop("target_duration_seconds", None)
    recurrence = updates.pop("recurrence", None)

    tags = None
    if tag_ids is not None:
        tags = get_available_board_tags(request.auth, task.column.board, tag_ids)

    with transaction.atomic():
        # update supplied fields and tags
        for field, value in updates.items():
            if field == "priority":
                value = value.value if value is not None else None
            elif value is None:
                continue

            setattr(task, field, value)
        if updates or tags is not None:
            task.column_activity_at = timezone.now()
            task.save()

        if tags is not None:
            task.tags.set(tags)

        # Handle timer update if provided
        if timer_mode is not None or target_duration_seconds is not None:
            if timer_mode == TimerMode.NONE:
                TaskTimer.objects.filter(task=task).delete()
                task.timer = None
            else:
                timer, _ = TaskTimer.objects.get_or_create(task=task)
                if timer_mode is not None:
                    timer.mode = timer_mode.value if hasattr(timer_mode, "value") else str(timer_mode)
                if target_duration_seconds is not None:
                    timer.target_duration_seconds = target_duration_seconds
                timer.save()
                task.timer = timer

        # Handle explicit unlinking of recurrence if recurring_task_id is None in updates
        if "recurring_task_id" in updates and updates["recurring_task_id"] is None:
            task.recurring_task = None
            task.save(update_fields=["recurring_task", "updated_at"])

        # Handle recurrence if provided
        if recurrence is not None:
            rec_updates = recurrence if isinstance(recurrence, dict) else recurrence.dict(exclude_unset=True)
            if task.recurring_task is None:
                # Add recurrence to previously non-recurring task
                tz_name = (
                    rec_updates.get("timezone")
                    or getattr(request.auth, "timezone", "UTC")
                    or "UTC"
                )
                default_timer = TimerMode.NONE
                timer_duration = None
                if timer_mode is not None:
                    default_timer = timer_mode
                    timer_duration = target_duration_seconds
                elif hasattr(task, "timer") and task.timer:
                    default_timer = task.timer.mode
                    timer_duration = task.timer.target_duration_seconds

                rec = create_recurring_task_blueprint(
                    user=request.auth,
                    board=task.column.board,
                    title=task.title,
                    description=task.description,
                    priority=task.priority,
                    cadence=rec_updates.get("cadence", RecurrenceCadence.DAILY),
                    days_of_week=rec_updates.get("days_of_week", []),
                    day_of_month=rec_updates.get("day_of_month", None),
                    time_of_day=rec_updates.get("time_of_day", "00:00"),
                    timezone_name=tz_name,
                    default_timer_mode=default_timer,
                    target_duration_seconds=timer_duration,
                    tags=tags if tags is not None else task.tags.all(),
                )
                task.recurring_task = rec
                task.save(update_fields=["recurring_task", "column_activity_at", "updated_at"])
            else:
                # Update recurrence schedule on existing blueprint (update_schedule only recalculates next_run_at if fields changed)
                rec = task.recurring_task
                rec.update_schedule(**rec_updates)
                rec.save()

        # If apply_to_future is True and task is linked to RecurringTask, update template fields
        if apply_to_future and task.recurring_task is not None:
            rec = task.recurring_task
            template_kwargs = {}
            if "title" in updates:
                template_kwargs["title"] = updates["title"]
            if "description" in updates:
                template_kwargs["description"] = updates["description"]
            if "priority" in updates:
                template_kwargs["priority"] = updates["priority"]
            if timer_mode is not None:
                template_kwargs["default_timer_mode"] = timer_mode
            if target_duration_seconds is not None:
                template_kwargs["target_duration_seconds"] = target_duration_seconds
            rec.update_template(**template_kwargs)
            if tags is not None:
                rec.tags.set(tags)
            rec.save()

        # publish update event to subscribers
        publish_event_on_commit(
            board_id=task.column.board_id,
            actor_id=request.auth.id,
            event_type=BoardEventType.TASK_UPDATED,
            data={
                "task": serialize_task(task),
            },
        )
    return task

@router.delete("/tasks/{task_id}")
def delete_task(request, task_id: int, cancel_recurrence: bool = False):
    """Delete a task. If cancel_recurrence=True and task is recurring, deactivates the recurrence schedule."""
    task = get_editable_task(request.auth, task_id)
    column = task.column
    board_id = task.column.board_id
    column_id = task.column_id
    task_id = task.id
    with transaction.atomic():
        if cancel_recurrence and task.recurring_task is not None:
            task.recurring_task.is_active = False
            task.recurring_task.save(update_fields=["is_active", "updated_at"])
        task.delete()
        _reindex(list(column.tasks.filter(archived_at__isnull=True)))

        # publish deletion event to subscribers
        publish_event_on_commit(
            board_id=board_id,
            actor_id=request.auth.id,
            event_type=BoardEventType.TASK_DELETED,
            data={
                "task_id": task_id,
                "column_id": column_id,
            },
        )
    return {"success": True}

@router.patch("/recurring-tasks/{recurring_task_id}", response=RecurringTaskOut)
def update_recurring_task(request, recurring_task_id: int, payload: RecurringTaskPatchIn):
    """Update fields or toggle is_active for a recurring task blueprint."""
    rec = get_editable_recurring_task(request.auth, recurring_task_id)
    updates = payload.dict(exclude_unset=True)

    tag_ids = updates.pop("tag_ids", None)
    tags = None
    if tag_ids is not None:
        tags = get_available_board_tags(request.auth, rec.board, tag_ids)

    with transaction.atomic():
        rec.update_schedule(**updates)
        rec.update_template(**updates)
        rec.save()
        if tags is not None:
            rec.tags.set(tags)

    return rec

@router.delete("/recurring-tasks/{recurring_task_id}")
def delete_recurring_task(request, recurring_task_id: int):
    """Delete a recurring task blueprint, leaving past spawned task occurrences intact."""
    rec = get_editable_recurring_task(request.auth, recurring_task_id)
    with transaction.atomic():
        rec.delete()
    return {"success": True}

@router.post("/tasks/{task_id}/move", response=TaskOut)
def move_task(request, task_id: int, payload: TaskMoveIn):
    """Move a task to another column and position."""
    task = get_editable_task(request.auth, task_id)
    src = task.column
    dest = get_editable_column(request.auth, payload.to_column_id)
    if dest.board_id != src.board.id:
        raise HttpError(400, "Column on different board")

    with transaction.atomic():
        # move task, reindexing appropriately
        src_tasks = [t for t in src.tasks.filter(archived_at__isnull=True) if t.id != task.id]
        dest_tasks = src_tasks if dest.id == src.id else list(dest.tasks.filter(archived_at__isnull=True))
        idx = max(0, min(payload.target_position, len(dest_tasks)))
        task.column = dest
        task.column_activity_at = timezone.now()
        task.save(update_fields=["column", "column_activity_at", "updated_at"])
        dest_tasks.insert(idx, task)
        if dest.id != src.id:
            _reindex(src_tasks)
        _reindex(dest_tasks)

        # publish the move event to subscribers
        publish_event_on_commit(
            board_id=task.column.board_id,
            actor_id=request.auth.id,
            event_type=BoardEventType.TASK_MOVED,
            data={
                "task": serialize_task(task),
                "source_column_id": src.id,
                "destination_column_id": dest.id,
                "position": task.position,
            },
        )
    return task

# ------------------
# Timer Endpoints
# ------------------

@router.patch("/tasks/{task_id}/timer", response=TaskTimerOut)
def patch_task_timer(request, task_id: int, payload: TaskTimerPatchIn):
    """Configure or transition the execution state of a task's timer."""
    task = get_editable_task(request.auth, task_id)
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
                        entry = TaskTimeEntry.objects.create(
                            task=task,
                            user=request.auth,
                            started_at=start_time,
                            ended_at=end_time,
                            duration_seconds=total_duration,
                            note=default_note,
                        )
                        publish_event_on_commit(
                            board_id=task.column.board_id,
                            actor_id=request.auth.id,
                            event_type=BoardEventType.TIME_ENTRY_CREATED,
                            data={
                                "task_id": task.id,
                                "time_entry": serialize_time_entry(entry),
                            },
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
            task.column_activity_at = timezone.now()
            task.save(update_fields=["column_activity_at", "updated_at"])

            # publish timer update event to subscribers
            publish_event_on_commit(
                board_id=task.column.board_id,
                actor_id=request.auth.id,
                event_type=BoardEventType.TASK_TIMER_UPDATED,
                data=get_timer_event_data(task, timer),
            )

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
        # publish timer update event to subscribers
        publish_event_on_commit(
            board_id=task.column.board_id,
            actor_id=request.auth.id,
            event_type=BoardEventType.TASK_TIMER_UPDATED,
            data=get_timer_event_data(task, timer),
        )

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
    task = get_editable_task(request.auth, task_id)
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
        is_collab = board.memberships.filter(user_id=target_user_id).exists()
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
        task.column_activity_at = timezone.now()
        task.save(update_fields=["column_activity_at", "updated_at"])

        # publish time entry creation event to subscribers
        publish_event_on_commit(
            board_id=entry.task.column.board_id,
            actor_id=request.auth.id,
            event_type=BoardEventType.TIME_ENTRY_CREATED,
            data={
                "task_id": entry.task_id,
                "time_entry": serialize_time_entry(entry),
            },
        )
    return 201, entry

@router.patch("/time-entries/{entry_id}", response=TaskTimeEntryOut)
def update_time_entry(request, entry_id: int, payload: TaskTimeEntryUpdateIn):
    """Partially update a recorded time entry, enforcing duration_seconds <= ended_at - started_at."""
    entry = get_owned_time_entry(request.auth, entry_id)

    # Require Editor or Owner access to the board containing this entry.
    get_editable_task(request.auth, entry.task_id)

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
                is_collab = board.memberships.filter(user_id=new_user_id).exists()
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

        # publish time entry update event to subscribers
        publish_event_on_commit(
            board_id=entry.task.column.board_id,
            actor_id=request.auth.id,
            event_type=BoardEventType.TIME_ENTRY_UPDATED,
            data={
                "task_id": entry.task_id,
                "time_entry": serialize_time_entry(entry),
            },
        )

    return entry

@router.delete("/time-entries/{entry_id}")
def delete_time_entry(request, entry_id: int):
    """Delete a recorded work session."""
    entry = get_owned_time_entry(request.auth, entry_id)

    # Require Editor or Owner access to the board containing this entry.
    get_editable_task(request.auth, entry.task_id)

    task_id = entry.task_id
    board_id = entry.task.column.board_id

    with transaction.atomic():
        entry.delete()

        # publish time entry deletion event to subscribers
        publish_event_on_commit(
            board_id=board_id,
            actor_id=request.auth.id,
            event_type=BoardEventType.TIME_ENTRY_DELETED,
            data={
                "task_id": task_id,
                "time_entry_id": entry_id,
            },
        )

    return {"success": True}

# ------------------
# Tag Endpoints
# ------------------
@router.get("/tags", response=list[TagOut])
def list_tags(request, board_id: int = None):
    """List tags belonging to participants of an accessible board."""

    if board_id is None:
        return Tag.objects.filter(user=request.auth)

    board = get_accessible_board(request.auth, board_id)

    return Tag.objects.filter(
        Q(user=board.owner) |
        Q(user__in=board.memberships.values_list("user_id", flat=True))
    ).distinct()

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

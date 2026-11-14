from typing import List, Optional
from django.shortcuts import get_object_or_404
from ninja import Router
from ninja.errors import HttpError

from chat.models import Message
from chat.schemas import MessageOut, SendMessageIn
from kanban.api import get_accessible_boards
from users.authentication import AppJWTAuth
from users.models import UserBlock

chat_router = Router(auth=AppJWTAuth())


def _get_accessible_board_or_404(user, board_id: int):
    return get_object_or_404(get_accessible_boards(user), id=board_id)


def _serialize_message(m: Message) -> dict:
    return {
        "id": m.id,
        "board_id": m.board_id,
        "sender_id": m.sender_id,
        "sender_name": m.sender.display_name,
        "content": m.content,
        "created_at": m.created_at,
    }


@chat_router.get(
    "/boards/{board_id}/messages",
    response=List[MessageOut],
    summary="List board chat messages with optional differential since_id and limit",
)
def get_board_messages(
    request,
    board_id: int,
    since_id: Optional[int] = None,
    limit: int = 50,
):
    user = request.auth
    board = _get_accessible_board_or_404(user, board_id)

    qs = Message.objects.filter(board=board).select_related("sender")

    blocked_ids = set(
        UserBlock.objects.filter(blocker=user).values_list("blocked_id", flat=True)
    ) | set(
        UserBlock.objects.filter(blocked=user).values_list("blocker_id", flat=True)
    )
    if blocked_ids:
        qs = qs.exclude(sender_id__in=blocked_ids)

    clamped_limit = max(1, min(limit, 200))

    if since_id is not None:
        qs = qs.filter(id__gt=since_id).order_by("created_at", "id")[:clamped_limit]
        messages = list(qs)
    else:
        recent = list(qs.order_by("-created_at", "-id")[:clamped_limit])
        recent.reverse()
        messages = recent

    return [_serialize_message(m) for m in messages]


@chat_router.post(
    "/boards/{board_id}/messages",
    response={201: MessageOut},
    summary="Send a message to a board chat",
)
def send_board_message(
    request,
    board_id: int,
    payload: SendMessageIn,
):
    user = request.auth
    board = _get_accessible_board_or_404(user, board_id)

    text = payload.content.strip()
    if not text:
        raise HttpError(422, "Message content cannot be empty.")
    if len(text) > 2000:
        raise HttpError(422, "Message content cannot exceed 2000 characters.")

    msg = Message.objects.create(
        board=board,
        sender=user,
        content=text,
    )

    return 201, {
        "id": msg.id,
        "board_id": msg.board_id,
        "sender_id": user.id,
        "sender_name": user.display_name,
        "content": msg.content,
        "created_at": msg.created_at,
    }

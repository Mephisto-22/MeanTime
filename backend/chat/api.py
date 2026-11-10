from typing import List, Optional
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Router
from ninja.errors import HttpError

from users.authentication import AppJWTAuth
from users.models import UserBlock
from chat.models import (
    Conversation,
    ConversationParticipant,
    ConversationType,
    Message,
    ParticipantStatus,
)
from chat.schemas import (
    ActionResponse,
    ClearHistoryResponse,
    ConversationDetailOut,
    ConversationListResponse,
    ConversationOut,
    CreateConversationIn,
    InviteFriendsIn,
    LastMessageOut,
    MarkReadResponse,
    MessageOut,
    ParticipantOut,
    PendingInviteOut,
    SendMessageIn,
    UpdateConversationIn,
)

User = get_user_model()

chat_router = Router(auth=AppJWTAuth())


def _serialize_participant(p: ConversationParticipant) -> dict:
    return {
        "id": p.id,
        "user_id": p.user_id,
        "display_name": p.user.display_name,
        "email": p.user.email,
        "status": p.status,
        "invited_by_id": p.invited_by_id,
    }


def _serialize_conversation_detail(conv: Conversation) -> dict:
    participants = [
        _serialize_participant(p)
        for p in conv.participants.select_related("user").order_by("id")
    ]
    return {
        "id": conv.id,
        "type": conv.type,
        "title": conv.title,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
        "is_active": conv.is_active,
        "participants": participants,
    }


def _serialize_conversation_out(
    conv: Conversation, user, user_p: ConversationParticipant
) -> dict:
    other_participants = [
        _serialize_participant(p)
        for p in conv.participants.select_related("user")
        .exclude(user=user)
        .order_by("id")
    ]

    messages = conv.messages.all()
    if user_p.cleared_at:
        messages = messages.filter(created_at__gt=user_p.cleared_at)

    # Exclude messages from users blocked by user or blocking user
    blocked_ids = set(
        UserBlock.objects.filter(blocker=user).values_list("blocked_id", flat=True)
    ) | set(
        UserBlock.objects.filter(blocked=user).values_list("blocker_id", flat=True)
    )
    if blocked_ids:
        messages = messages.exclude(sender_id__in=blocked_ids)

    last_msg = messages.order_by("-created_at").select_related("sender").first()
    last_message_data = None
    if last_msg:
        last_message_data = {
            "content": last_msg.content,
            "sender_name": last_msg.sender.display_name,
            "created_at": last_msg.created_at,
        }

    unread_messages = messages.exclude(sender=user)
    if user_p.last_read_at:
        unread_messages = unread_messages.filter(created_at__gt=user_p.last_read_at)
    unread_count = unread_messages.count()

    return {
        "id": conv.id,
        "type": conv.type,
        "title": conv.title,
        "updated_at": conv.updated_at,
        "other_participants": other_participants,
        "last_message": last_message_data,
        "unread_count": unread_count,
    }


@chat_router.get(
    "/conversations",
    response=ConversationListResponse,
    summary="List active conversations and pending invites",
)
def list_conversations(request):
    user = request.auth

    # Accepted active conversations
    accepted_participations = (
        ConversationParticipant.objects.filter(
            user=user,
            status=ParticipantStatus.ACCEPTED,
            conversation__is_active=True,
        )
        .select_related("conversation")
        .order_by("-conversation__updated_at")
    )

    conversations = []
    for part in accepted_participations:
        conv = part.conversation
        # If DIRECT, ensure neither user is blocking the other
        if conv.type == ConversationType.DIRECT:
            other_part = conv.participants.exclude(user=user).first()
            if other_part:
                if user.is_blocking(other_part.user) or user.is_blocked_by(
                    other_part.user
                ):
                    continue
        conversations.append(_serialize_conversation_out(conv, user, part))

    # Pending invites
    pending_participations = (
        ConversationParticipant.objects.filter(
            user=user,
            status=ParticipantStatus.PENDING,
            conversation__is_active=True,
        )
        .select_related("conversation", "invited_by")
        .order_by("-joined_at")
    )

    pending_invites = [
        {
            "id": p.id,
            "conversation_id": p.conversation_id,
            "conversation_type": p.conversation.type,
            "conversation_title": p.conversation.title
            or (p.invited_by.display_name if p.invited_by else "Chat Invite"),
            "invited_by_name": p.invited_by.display_name
            if p.invited_by
            else "Unknown",
            "created_at": p.joined_at,
        }
        for p in pending_participations
    ]

    return {
        "conversations": conversations,
        "pending_invites": pending_invites,
    }


@chat_router.post(
    "/conversations",
    response={200: ConversationDetailOut},
    summary="Create a new direct or group conversation",
)
def create_conversation(request, data: CreateConversationIn):
    user = request.auth

    if data.type not in (ConversationType.DIRECT, ConversationType.GROUP):
        raise HttpError(400, "Invalid conversation type.")

    other_ids = [uid for uid in set(data.participant_ids) if uid != user.id]
    if not other_ids:
        raise HttpError(400, "At least one other participant is required.")

    if data.type == ConversationType.DIRECT and len(other_ids) != 1:
        raise HttpError(
            400, "Direct conversations must have exactly one other participant."
        )

    other_users = list(User.objects.filter(id__in=other_ids, is_active=True))
    if len(other_users) != len(other_ids):
        raise HttpError(400, "One or more participants not found.")

    for other_user in other_users:
        if not user.is_friends_with(other_user):
            raise HttpError(
                400,
                f"Cannot start conversation with {other_user.display_name}: not friends.",
            )
        if user.is_blocking(other_user) or user.is_blocked_by(other_user):
            raise HttpError(
                400,
                f"Cannot start conversation with {other_user.display_name}: user is blocked.",
            )

    if data.type == ConversationType.DIRECT:
        target_user = other_users[0]
        existing_conv = (
            Conversation.objects.filter(type=ConversationType.DIRECT)
            .filter(participants__user=user)
            .filter(participants__user=target_user)
            .first()
        )
        if existing_conv:
            if not existing_conv.is_active:
                existing_conv.is_active = True
                existing_conv.save(update_fields=["is_active", "updated_at"])

            creator_p = existing_conv.participants.filter(user=user).first()
            if creator_p and creator_p.status != ParticipantStatus.ACCEPTED:
                creator_p.status = ParticipantStatus.ACCEPTED
                creator_p.save(update_fields=["status", "updated_at"])

            target_p = existing_conv.participants.filter(user=target_user).first()
            if target_p:
                if target_p.status == ParticipantStatus.DECLINED:
                    target_p.status = ParticipantStatus.PENDING
                    target_p.invited_by = user
                    target_p.save(update_fields=["status", "invited_by", "updated_at"])
            else:
                ConversationParticipant.objects.create(
                    conversation=existing_conv,
                    user=target_user,
                    status=ParticipantStatus.PENDING,
                    invited_by=user,
                )
            return 200, _serialize_conversation_detail(existing_conv)

    conv = Conversation.objects.create(
        type=data.type,
        title=(data.title or "").strip(),
        created_by=user,
    )
    ConversationParticipant.objects.create(
        conversation=conv,
        user=user,
        status=ParticipantStatus.ACCEPTED,
    )
    for other_user in other_users:
        ConversationParticipant.objects.create(
            conversation=conv,
            user=other_user,
            status=ParticipantStatus.PENDING,
            invited_by=user,
        )

    return 200, _serialize_conversation_detail(conv)


@chat_router.get(
    "/conversations/{conversation_id}",
    response={200: ConversationDetailOut},
    summary="Get conversation details and participants",
)
def get_conversation(request, conversation_id: int):
    user = request.auth
    conv = get_object_or_404(Conversation, id=conversation_id)

    participant = ConversationParticipant.objects.filter(
        conversation=conv, user=user
    ).first()
    if not participant or participant.status == ParticipantStatus.DECLINED:
        raise HttpError(403, "You do not have access to this conversation.")

    if conv.type == ConversationType.DIRECT:
        other_p = conv.participants.exclude(user=user).first()
        if other_p and (
            user.is_blocking(other_p.user) or user.is_blocked_by(other_p.user)
        ):
            raise HttpError(403, "Access to this conversation is blocked.")

    return 200, _serialize_conversation_detail(conv)


@chat_router.patch(
    "/conversations/{conversation_id}",
    response={200: ConversationDetailOut},
    summary="Rename a group conversation",
)
def update_conversation(request, conversation_id: int, data: UpdateConversationIn):
    user = request.auth
    conv = get_object_or_404(Conversation, id=conversation_id)

    participant = ConversationParticipant.objects.filter(
        conversation=conv, user=user, status=ParticipantStatus.ACCEPTED
    ).first()
    if not participant:
        raise HttpError(
            403, "Only accepted group participants can rename the conversation."
        )

    if conv.type != ConversationType.GROUP:
        raise HttpError(400, "Only group conversations can be renamed.")

    title = data.title.strip()
    if not title:
        raise HttpError(400, "Title cannot be empty.")

    conv.title = title
    conv.save(update_fields=["title", "updated_at"])

    return 200, _serialize_conversation_detail(conv)


@chat_router.post(
    "/conversations/{conversation_id}/invites",
    response={200: ConversationDetailOut},
    summary="Invite friends to a group conversation",
)
def invite_friends(request, conversation_id: int, data: InviteFriendsIn):
    user = request.auth
    conv = get_object_or_404(Conversation, id=conversation_id)

    caller_p = ConversationParticipant.objects.filter(
        conversation=conv, user=user, status=ParticipantStatus.ACCEPTED
    ).first()
    if not caller_p:
        raise HttpError(403, "Only accepted group participants can invite friends.")

    if conv.type != ConversationType.GROUP:
        raise HttpError(400, "Invites can only be added to group conversations.")

    invite_ids = [uid for uid in set(data.user_ids) if uid != user.id]
    if not invite_ids:
        raise HttpError(400, "No valid user IDs provided.")

    users_to_invite = list(User.objects.filter(id__in=invite_ids, is_active=True))
    if len(users_to_invite) != len(invite_ids):
        raise HttpError(400, "One or more users not found.")

    for other_user in users_to_invite:
        if not user.is_friends_with(other_user):
            raise HttpError(
                400, f"Cannot invite {other_user.display_name}: not friends."
            )
        if user.is_blocking(other_user) or user.is_blocked_by(other_user):
            raise HttpError(
                400, f"Cannot invite {other_user.display_name}: user is blocked."
            )

        p = ConversationParticipant.objects.filter(
            conversation=conv, user=other_user
        ).first()
        if p:
            if p.status == ParticipantStatus.DECLINED:
                p.status = ParticipantStatus.PENDING
                p.invited_by = user
                p.save(update_fields=["status", "invited_by", "updated_at"])
        else:
            ConversationParticipant.objects.create(
                conversation=conv,
                user=other_user,
                status=ParticipantStatus.PENDING,
                invited_by=user,
            )

    conv.save(update_fields=["updated_at"])
    return 200, _serialize_conversation_detail(conv)


@chat_router.post(
    "/conversations/{conversation_id}/accept",
    response={200: ConversationDetailOut},
    summary="Accept an invitation to a conversation",
)
def accept_invitation(request, conversation_id: int):
    user = request.auth
    conv = get_object_or_404(Conversation, id=conversation_id)

    p = ConversationParticipant.objects.filter(conversation=conv, user=user).first()
    if not p:
        raise HttpError(404, "Invitation not found.")

    if p.status == ParticipantStatus.ACCEPTED:
        return 200, _serialize_conversation_detail(conv)

    if p.status != ParticipantStatus.PENDING:
        raise HttpError(400, "Invitation is not pending.")

    p.status = ParticipantStatus.ACCEPTED
    p.save(update_fields=["status", "updated_at"])
    return 200, _serialize_conversation_detail(conv)


@chat_router.post(
    "/conversations/{conversation_id}/decline",
    response={200: ActionResponse},
    summary="Decline an invitation to a conversation",
)
def decline_invitation(request, conversation_id: int):
    user = request.auth
    conv = get_object_or_404(Conversation, id=conversation_id)

    p = ConversationParticipant.objects.filter(conversation=conv, user=user).first()
    if not p:
        raise HttpError(404, "Invitation not found.")

    if p.status != ParticipantStatus.PENDING:
        raise HttpError(400, "Invitation is not pending.")

    p.status = ParticipantStatus.DECLINED
    p.save(update_fields=["status", "updated_at"])
    return 200, {"success": True, "detail": "Invitation declined."}


@chat_router.post(
    "/conversations/{conversation_id}/leave",
    response={200: ActionResponse},
    summary="Leave an active conversation",
)
def leave_conversation(request, conversation_id: int):
    user = request.auth
    conv = get_object_or_404(Conversation, id=conversation_id)

    p = ConversationParticipant.objects.filter(conversation=conv, user=user).first()
    if not p or p.status != ParticipantStatus.ACCEPTED:
        raise HttpError(400, "You are not an active participant in this conversation.")

    p.status = ParticipantStatus.DECLINED
    p.save(update_fields=["status", "updated_at"])

    accepted_count = conv.participants.filter(
        status=ParticipantStatus.ACCEPTED
    ).count()
    if accepted_count == 0:
        conv.is_active = False
        conv.save(update_fields=["is_active", "updated_at"])

    return 200, {"success": True, "detail": "Left conversation."}


@chat_router.get(
    "/conversations/{conversation_id}/messages",
    response={200: List[MessageOut]},
    summary="Get messages for a conversation",
)
def list_messages(
    request,
    conversation_id: int,
    since_id: Optional[int] = None,
    limit: int = 50,
):
    user = request.auth
    conv = get_object_or_404(Conversation, id=conversation_id)

    participant = ConversationParticipant.objects.filter(
        conversation=conv, user=user, status=ParticipantStatus.ACCEPTED
    ).first()
    if not participant:
        raise HttpError(403, "You do not have access to this conversation.")

    if conv.type == ConversationType.DIRECT:
        other_p = conv.participants.exclude(user=user).first()
        if other_p and (
            user.is_blocking(other_p.user) or user.is_blocked_by(other_p.user)
        ):
            raise HttpError(403, "Access to this conversation is blocked.")

    messages = conv.messages.all()

    if participant.cleared_at:
        messages = messages.filter(created_at__gt=participant.cleared_at)

    if since_id is not None:
        messages = messages.filter(id__gt=since_id)

    blocked_ids = set(
        UserBlock.objects.filter(blocker=user).values_list("blocked_id", flat=True)
    ) | set(
        UserBlock.objects.filter(blocked=user).values_list("blocker_id", flat=True)
    )
    if blocked_ids:
        messages = messages.exclude(sender_id__in=blocked_ids)

    messages = messages.select_related("sender").order_by("id")[:limit]

    return 200, [
        {
            "id": msg.id,
            "conversation_id": msg.conversation_id,
            "sender_id": msg.sender_id,
            "sender_name": msg.sender.display_name,
            "content": msg.content,
            "created_at": msg.created_at,
        }
        for msg in messages
    ]


@chat_router.post(
    "/conversations/{conversation_id}/messages",
    response={200: MessageOut},
    summary="Send a message to a conversation",
)
def send_message(request, conversation_id: int, data: SendMessageIn):
    user = request.auth
    conv = get_object_or_404(Conversation, id=conversation_id)

    participant = ConversationParticipant.objects.filter(
        conversation=conv, user=user, status=ParticipantStatus.ACCEPTED
    ).first()
    if not participant:
        raise HttpError(403, "You do not have access to this conversation.")

    content = data.content.strip()
    if not content:
        raise HttpError(400, "Message content cannot be empty.")

    if conv.type == ConversationType.DIRECT:
        other_p = conv.participants.exclude(user=user).first()
        if other_p and (
            user.is_blocking(other_p.user) or user.is_blocked_by(other_p.user)
        ):
            raise HttpError(403, "Cannot send message: user is blocked.")

    msg = Message.objects.create(
        conversation=conv,
        sender=user,
        content=content,
    )

    conv.save(update_fields=["updated_at"])

    return 200, {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "sender_name": user.display_name,
        "content": msg.content,
        "created_at": msg.created_at,
    }


@chat_router.post(
    "/conversations/{conversation_id}/clear",
    response={200: ClearHistoryResponse},
    summary="Clear conversation history for the caller",
)
def clear_history(request, conversation_id: int):
    user = request.auth
    conv = get_object_or_404(Conversation, id=conversation_id)

    participant = ConversationParticipant.objects.filter(
        conversation=conv, user=user, status=ParticipantStatus.ACCEPTED
    ).first()
    if not participant:
        raise HttpError(403, "You do not have access to this conversation.")

    participant.cleared_at = timezone.now()
    participant.save(update_fields=["cleared_at", "updated_at"])

    return 200, {
        "success": True,
        "cleared_at": participant.cleared_at,
    }


@chat_router.post(
    "/conversations/{conversation_id}/read",
    response={200: MarkReadResponse},
    summary="Mark conversation as read for the caller",
)
def mark_as_read(request, conversation_id: int):
    user = request.auth
    conv = get_object_or_404(Conversation, id=conversation_id)

    participant = ConversationParticipant.objects.filter(
        conversation=conv, user=user, status=ParticipantStatus.ACCEPTED
    ).first()
    if not participant:
        raise HttpError(403, "You do not have access to this conversation.")

    participant.last_read_at = timezone.now()
    participant.save(update_fields=["last_read_at", "updated_at"])

    return 200, {
        "success": True,
        "last_read_at": participant.last_read_at,
    }

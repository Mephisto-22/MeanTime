from datetime import datetime
from typing import List, Optional
from ninja import Schema


class ParticipantOut(Schema):
    id: int
    user_id: int
    display_name: str
    email: str
    status: str
    invited_by_id: Optional[int] = None


class LastMessageOut(Schema):
    content: str
    sender_name: str
    created_at: datetime


class ConversationOut(Schema):
    id: int
    type: str
    title: str
    updated_at: datetime
    other_participants: List[ParticipantOut]
    last_message: Optional[LastMessageOut] = None
    unread_count: int = 0


class PendingInviteOut(Schema):
    id: int
    conversation_id: int
    conversation_type: str
    conversation_title: str
    invited_by_name: str
    created_at: datetime


class ConversationListResponse(Schema):
    conversations: List[ConversationOut]
    pending_invites: List[PendingInviteOut]


class ConversationDetailOut(Schema):
    id: int
    type: str
    title: str
    created_at: datetime
    updated_at: datetime
    is_active: bool
    participants: List[ParticipantOut]


class CreateConversationIn(Schema):
    type: str = "DIRECT"
    participant_ids: List[int]
    title: Optional[str] = ""


class InviteFriendsIn(Schema):
    user_ids: List[int]


class UpdateConversationIn(Schema):
    title: str


class MessageOut(Schema):
    id: int
    conversation_id: int
    sender_id: int
    sender_name: str
    content: str
    created_at: datetime


class SendMessageIn(Schema):
    content: str


class ClearHistoryResponse(Schema):
    success: bool = True
    cleared_at: datetime


class MarkReadResponse(Schema):
    success: bool = True
    last_read_at: datetime


class ActionResponse(Schema):
    success: bool = True
    detail: Optional[str] = None

from datetime import datetime
from ninja import Schema


class MessageOut(Schema):
    id: int
    board_id: int
    sender_id: int
    sender_name: str
    content: str
    created_at: datetime


class SendMessageIn(Schema):
    content: str

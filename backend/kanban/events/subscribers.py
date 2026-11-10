# This file handles Redis subscriptions

import asyncio
import json
import redis.asyncio as redis

from django.conf import settings
from ..event_schemas import BoardEventType

from ..sse import (
    format_sse_comment,
    format_sse_event,
    format_sse_retry,
)


async def subscribe_to_board(board_id: int, user_id: int):
    """Subscribe to Redis events from a specific board."""

    client = redis.Redis.from_url(
        settings.REDIS_URL,
        decode_responses=True
    )

    pubsub = client.pubsub()
    channel = f"kanban:board:{board_id}"
    try:
        await pubsub.subscribe(channel)

        # Tell the browser when to retry after a disconnection
        yield format_sse_retry()

        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=15.0
            )

            if message is None:
                # SSE keeps the connection alive
                yield format_sse_comment()
                continue

            event = json.loads(message["data"])

            # ignore incorrectly scoped events
            if event.get("board_id") != board_id:
                continue

            event_type = event.get("type")
            event_data = event.get("data", {})

            # A collaborator has lost access
            if event_type == BoardEventType.BOARD_ACCESS_REVOKED:
                if event_data.get("user_id") == user_id:
                    yield format_sse_event(event)
                    break

            # The entire board has been deleted
            if event_type == BoardEventType.BOARD_DELETED:
                yield format_sse_event(event)
                break

            # in general, convert the Redis message into SSE format
            yield format_sse_event(event)
    except asyncio.CancelledError:
        raise
    finally:
        await pubsub.aclose()
        await client.aclose()
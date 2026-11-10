# This file handles Redis subscriptions

import asyncio
import json
import redis.asyncio as redis

from django.conf import settings

from ..sse import (
    format_sse_comment,
    format_sse_event,
    format_sse_retry,
)


async def subscribe_to_board(board_id: int):
    """Sybscribe to Redis events fro a specific board."""

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

            # convert the Redis message into SSE format
            yield format_sse_event(event)
    except asyncio.CancelledError:
        raise
    finally:
        await pubsub.aclose()
        await client.aclose()
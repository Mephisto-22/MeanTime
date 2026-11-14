# this file creates and publishes events to Redis

import redis.asyncio as redis
import json
import logging
import redis

from django.conf import settings

from ..event_schemas import BoardEvent, BoardEventType

logger = logging.getLogger(__name__)


def publish_board_event(board_id: int, actor_id: int, event_type: BoardEventType, data: dict) -> None:
    """Publish an event to subscribers of a specific board."""

    # construct a BoardEvent using the received fields
    event = BoardEvent(
        type=event_type,
        board_id=board_id,
        actor_id=actor_id,
        data=data,
    )

    # create a Redis connection
    client = redis.Redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
    )

    # serialize into JSON and attempt to publish to appropriate Redis channel
    try:
        channel = f"kanban:board:{board_id}"
        message = event.model_dump_json()
        client.publish(channel, message)

    except redis.RedisError:
        logger.exception(
            "Failed to publish event %s for board %s",
            event_type,
            board_id,
        )

    finally:
        client.close()
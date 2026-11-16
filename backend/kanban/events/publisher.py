# this file creates and publishes events to Redis

import logging
import redis

from django.conf import settings

from ..event_schemas import BoardEvent, BoardEventType

logger = logging.getLogger(__name__)

_redis_client = None


def get_redis_client() -> redis.Redis:
    """Return the shared Redis client, initializing it when needed."""
    global _redis_client

    if _redis_client is None:
        _redis_client = redis.Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )

    return _redis_client

def close_redis_client() -> None:
    """Close the shared Redis client during application shutdown."""
    global _redis_client

    if _redis_client is not None:
        _redis_client.close()
        _redis_client = None

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
    try:
        channel = f"kanban:board:{board_id}"
        message = event.model_dump_json()

        get_redis_client().publish(channel, message)

    except redis.RedisError:
        logger.exception(
            "Failed to publish event %s for board %s",
            event_type,
            board_id,
        )

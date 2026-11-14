"""Unit tests for Redis-backed board event delivery."""

import json
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, MagicMock, patch

from kanban.event_schemas import BoardEvent, BoardEventType
from kanban.events.publisher import publish_board_event
from kanban.events.subscribers import subscribe_to_board
from kanban.sse import format_sse_event, format_sse_retry


def make_event(event_type, *, board_id=10, data=None):
    return BoardEvent(
        type=event_type,
        board_id=board_id,
        actor_id=20,
        data=data or {},
    )


class BoardEventPublisherTests(TestCase):
    @patch("kanban.events.publisher.redis.Redis.from_url")
    def test_publishes_serialized_event_to_board_channel(self, from_url):
        client = MagicMock()
        from_url.return_value = client

        publish_board_event(
            board_id=10,
            actor_id=20,
            event_type=BoardEventType.TASK_CREATED,
            data={"task": {"id": 30}},
        )

        from_url.assert_called_once()
        client.publish.assert_called_once()
        channel, message = client.publish.call_args.args
        self.assertEqual(channel, "kanban:board:10")
        payload = json.loads(message)
        self.assertEqual(payload["type"], "task.created")
        self.assertEqual(payload["board_id"], 10)
        self.assertEqual(payload["actor_id"], 20)
        self.assertEqual(payload["data"], {"task": {"id": 30}})
        client.close.assert_called_once()


class BoardEventSubscriberTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.pubsub = MagicMock()
        self.pubsub.subscribe = AsyncMock()
        self.pubsub.get_message = AsyncMock()
        self.pubsub.aclose = AsyncMock()
        self.client = MagicMock()
        self.client.pubsub.return_value = self.pubsub
        self.client.aclose = AsyncMock()
        self.redis_patch = patch(
            "kanban.events.subscribers.redis.Redis.from_url",
            return_value=self.client,
        )
        self.redis_patch.start()
        self.addCleanup(self.redis_patch.stop)

    async def test_subscribes_and_emits_retry_and_keepalive(self):
        event = make_event(BoardEventType.TASK_CREATED)
        self.pubsub.get_message.side_effect = [
            None,
            {"data": event.model_dump_json()},
        ]
        stream = subscribe_to_board(board_id=10, user_id=20)

        self.assertEqual(await anext(stream), format_sse_retry())
        self.assertEqual(await anext(stream), ": keep-alive\n\n")
        self.assertEqual(await anext(stream), format_sse_event(event.model_dump(mode="json")))
        await stream.aclose()

        self.pubsub.subscribe.assert_awaited_once_with("kanban:board:10")
        self.pubsub.aclose.assert_awaited_once()
        self.client.aclose.assert_awaited_once()

    async def test_matching_access_revocation_event_ends_stream(self):
        event = make_event(
            BoardEventType.BOARD_ACCESS_REVOKED,
            data={"user_id": 20},
        )
        self.pubsub.get_message.return_value = {"data": event.model_dump_json()}
        stream = subscribe_to_board(board_id=10, user_id=20)

        self.assertEqual(await anext(stream), format_sse_retry())
        self.assertEqual(await anext(stream), format_sse_event(event.model_dump(mode="json")))
        with self.assertRaises(StopAsyncIteration):
            await anext(stream)

        self.pubsub.aclose.assert_awaited_once()
        self.client.aclose.assert_awaited_once()

    async def test_board_deleted_event_ends_stream(self):
        event = make_event(BoardEventType.BOARD_DELETED)
        self.pubsub.get_message.return_value = {"data": event.model_dump_json()}
        stream = subscribe_to_board(board_id=10, user_id=20)

        self.assertEqual(await anext(stream), format_sse_retry())
        self.assertEqual(await anext(stream), format_sse_event(event.model_dump(mode="json")))
        with self.assertRaises(StopAsyncIteration):
            await anext(stream)

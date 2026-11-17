
"""Unit tests for Redis-backed board event delivery."""

import asyncio
import json
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, MagicMock, patch

from redis.exceptions import RedisError

from kanban.event_schemas import BoardEvent, BoardEventType
from kanban.events import publisher
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

        with patch.object(publisher, "_redis_client", None):
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

        # The publisher uses a shared client. It must not close it
        # after every event.
        client.close.assert_not_called()

    @patch("kanban.events.publisher.redis.Redis.from_url")
    def test_reuses_cached_redis_client(self, from_url):
        client = MagicMock()
        from_url.return_value = client

        with patch.object(publisher, "_redis_client", None):
            for board_id in (10, 11):
                publish_board_event(
                    board_id=board_id,
                    actor_id=20,
                    event_type=BoardEventType.TASK_CREATED,
                    data={"task": {"id": 30}},
                )

        from_url.assert_called_once()
        self.assertEqual(client.publish.call_count, 2)

    def test_redis_error_does_not_escape_publisher(self):
        client = MagicMock()
        client.publish.side_effect = RedisError("Redis unavailable")

        with patch.object(publisher, "_redis_client", client):
            # Publishing failures are logged and swallowed by the
            # publisher so they do not break the API request.
            publish_board_event(
                board_id=10,
                actor_id=20,
                event_type=BoardEventType.TASK_CREATED,
                data={"task": {"id": 30}},
            )

        client.publish.assert_called_once()


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

    async def test_collaborator_update_reaches_all_subscribers_and_keeps_stream_open(self):
        for user_id in (20, 999):
            with self.subTest(user_id=user_id):
                event = make_event(
                    BoardEventType.BOARD_COLLABORATOR_UPDATED,
                    data={"user_id": 20, "role": "VIEWER"},
                )
                self.pubsub.get_message.side_effect = [
                    {"data": event.model_dump_json()},
                    None,
                ]
                stream = subscribe_to_board(board_id=10, user_id=user_id)
                try:
                    self.assertEqual(await anext(stream), format_sse_retry())
                    self.assertEqual(
                        await anext(stream),
                        format_sse_event(event.model_dump(mode="json")),
                    )
                    self.assertEqual(await anext(stream), ": keep-alive\n\n")
                finally:
                    await stream.aclose()

    async def test_subscribes_and_emits_retry_and_keepalive(self):
        event = make_event(BoardEventType.TASK_CREATED)
        self.pubsub.get_message.side_effect = [
            None,
            {"data": event.model_dump_json()},
        ]

        stream = subscribe_to_board(board_id=10, user_id=20)

        self.assertEqual(await anext(stream), format_sse_retry())
        self.assertEqual(await anext(stream), ": keep-alive\n\n")
        self.assertEqual(
            await anext(stream),
            format_sse_event(event.model_dump(mode="json")),
        )

        await stream.aclose()

        self.pubsub.subscribe.assert_awaited_once_with("kanban:board:10")
        self.pubsub.aclose.assert_awaited_once()
        self.client.aclose.assert_awaited_once()

    async def test_ignores_events_for_other_boards_and_other_users(self):
        wrong_board_event = make_event(
            BoardEventType.TASK_CREATED,
            board_id=99,
        )
        another_users_revocation = make_event(
            BoardEventType.BOARD_ACCESS_REVOKED,
            data={"user_id": 999},
        )
        valid_event = make_event(
            BoardEventType.TASK_UPDATED,
            data={"task": {"id": 30}},
        )

        self.pubsub.get_message.side_effect = [
            {"data": wrong_board_event.model_dump_json()},
            {"data": another_users_revocation.model_dump_json()},
            {"data": valid_event.model_dump_json()},
        ]

        stream = subscribe_to_board(board_id=10, user_id=20)

        self.assertEqual(await anext(stream), format_sse_retry())

        # The two irrelevant messages should be skipped internally.
        # The next yielded event should be the valid event.
        self.assertEqual(
            await anext(stream),
            format_sse_event(valid_event.model_dump(mode="json")),
        )

        await stream.aclose()

        self.pubsub.aclose.assert_awaited_once()
        self.client.aclose.assert_awaited_once()

    async def test_matching_access_revocation_event_ends_stream(self):
        event = make_event(
            BoardEventType.BOARD_ACCESS_REVOKED,
            data={"user_id": 20},
        )
        self.pubsub.get_message.return_value = {
            "data": event.model_dump_json()
        }

        stream = subscribe_to_board(board_id=10, user_id=20)

        self.assertEqual(await anext(stream), format_sse_retry())
        self.assertEqual(
            await anext(stream),
            format_sse_event(event.model_dump(mode="json")),
        )

        with self.assertRaises(StopAsyncIteration):
            await anext(stream)

        self.pubsub.aclose.assert_awaited_once()
        self.client.aclose.assert_awaited_once()

    async def test_board_deleted_event_ends_stream(self):
        event = make_event(BoardEventType.BOARD_DELETED)
        self.pubsub.get_message.return_value = {
            "data": event.model_dump_json()
        }

        stream = subscribe_to_board(board_id=10, user_id=20)

        self.assertEqual(await anext(stream), format_sse_retry())
        self.assertEqual(
            await anext(stream),
            format_sse_event(event.model_dump(mode="json")),
        )

        with self.assertRaises(StopAsyncIteration):
            await anext(stream)

        self.pubsub.aclose.assert_awaited_once()
        self.client.aclose.assert_awaited_once()

    async def test_cancellation_closes_redis_resources(self):
        waiting_for_message = asyncio.Event()

        async def wait_for_message(**kwargs):
            waiting_for_message.set()
            await asyncio.Future()

        self.pubsub.get_message.side_effect = wait_for_message

        stream = subscribe_to_board(board_id=10, user_id=20)

        self.assertEqual(await anext(stream), format_sse_retry())

        pending_read = asyncio.create_task(anext(stream))

        await waiting_for_message.wait()

        pending_read.cancel()

        with self.assertRaises(asyncio.CancelledError):
            await pending_read

        self.pubsub.aclose.assert_awaited_once()
        self.client.aclose.assert_awaited_once()

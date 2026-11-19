"""API tests for the cross-board Task Feed endpoint."""

import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from kanban.models import (
    Board,
    BoardColumn,
    BoardMembership,
    RecurrenceCadence,
    RecurringTask,
    Tag,
    Task,
    TaskPriority,
    TaskTimeEntry,
    TaskTimer,
    TimerMode,
    TimerState,
)
from users.models import Friendship, FriendshipStatus, UserBlock

User = get_user_model()
PASSWORD = "TestPassword123!"


class TaskFeedApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.owner = User.objects.create_user(
            email="feed_owner@example.com",
            password=PASSWORD,
            display_name="Feed Owner",
        )
        self.collaborator = User.objects.create_user(
            email="feed_collab@example.com",
            password=PASSWORD,
            display_name="Feed Collaborator",
        )
        self.other_collaborator = User.objects.create_user(
            email="feed_other_collab@example.com",
            password=PASSWORD,
            display_name="Other Collaborator",
        )
        self.stranger = User.objects.create_user(
            email="feed_stranger@example.com",
            password=PASSWORD,
            display_name="Feed Stranger",
        )

        Friendship.objects.create(
            requester=self.owner,
            receiver=self.collaborator,
            status=FriendshipStatus.ACCEPTED,
        )

    def auth_headers(self, email):
        response = self.client.post(
            "/api/auth/login",
            data=json.dumps({"email": email, "password": PASSWORD}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        return {"HTTP_AUTHORIZATION": f"Bearer {response.json()['access_token']}"}

    def test_unauthenticated_request_returns_401(self):
        response = self.client.get("/api/kanban/tasks")
        self.assertEqual(response.status_code, 401)

    def test_owned_board_active_tasks_return_feed_fields_and_ordering(self):
        board_a = Board.objects.create(owner=self.owner, title="Alpha Board")
        col_todo = BoardColumn.objects.create(board=board_a, title="To Do", position=0)

        board_b = Board.objects.create(owner=self.owner, title="Beta Board")
        col_doing = BoardColumn.objects.create(board=board_b, title="Doing", position=0)

        stranger_board = Board.objects.create(owner=self.stranger, title="Private Board")
        stranger_col = BoardColumn.objects.create(board=stranger_board, title="Secret", position=0)
        Task.objects.create(column=stranger_col, title="Stranger Task", position=0)

        tag_urgent = Tag.objects.create(user=self.owner, name="Urgent")
        due_time = timezone.now() + timedelta(days=2)
        rec = RecurringTask.objects.create(
            board=board_a,
            creator=self.owner,
            title="Recurring Blueprint",
            cadence=RecurrenceCadence.DAILY,
            next_run_at=timezone.now() + timedelta(days=1),
        )

        task_untimed = Task.objects.create(
            column=col_todo,
            title="Untimed Task",
            description="No entries yet",
            priority=TaskPriority.HIGH,
            position=0,
            due_at=due_time,
            reminder_offset_seconds=3600,
            recurring_task=rec,
        )
        task_untimed.tags.add(tag_urgent)
        TaskTimer.objects.create(
            task=task_untimed,
            mode=TimerMode.COUNT_UP,
            state=TimerState.IDLE,
        )

        task_tied_low_id = Task.objects.create(
            column=col_doing,
            title="Tied Earlier ID",
            position=0,
        )
        task_tied_high_id = Task.objects.create(
            column=col_doing,
            title="Tied Higher ID",
            position=1,
        )
        TaskTimeEntry.objects.create(
            task=task_tied_high_id,
            user=self.owner,
            started_at=timezone.now() - timedelta(minutes=15),
            ended_at=timezone.now() - timedelta(minutes=5),
            duration_seconds=600,
        )

        # Control updated_at timestamps explicitly to verify -updated_at, -id ordering.
        t_older = timezone.now() - timedelta(hours=2)
        t_newer = timezone.now() - timedelta(hours=1)
        Task.objects.filter(id=task_untimed.id).update(updated_at=t_older)
        Task.objects.filter(id__in=[task_tied_low_id.id, task_tied_high_id.id]).update(
            updated_at=t_newer
        )

        response = self.client.get(
            "/api/kanban/tasks",
            **self.auth_headers("feed_owner@example.com"),
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(
            [t["id"] for t in payload],
            [task_tied_high_id.id, task_tied_low_id.id, task_untimed.id],
        )

        untimed_data = payload[2]
        self.assertEqual(untimed_data["board_id"], board_a.id)
        self.assertEqual(untimed_data["board_title"], "Alpha Board")
        self.assertEqual(untimed_data["column_id"], col_todo.id)
        self.assertEqual(untimed_data["column_title"], "To Do")
        self.assertEqual(untimed_data["title"], "Untimed Task")
        self.assertEqual(untimed_data["description"], "No entries yet")
        self.assertEqual(untimed_data["priority"], "HIGH")
        self.assertEqual(untimed_data["total_seconds"], 0)
        self.assertEqual(untimed_data["reminder_offset_seconds"], 3600)
        self.assertIsNotNone(untimed_data["due_at"])
        self.assertIsNotNone(untimed_data["created_at"])
        self.assertIsNotNone(untimed_data["updated_at"])
        self.assertEqual([t["name"] for t in untimed_data["tags"]], ["Urgent"])
        self.assertEqual(untimed_data["timer"]["mode"], "COUNT_UP")
        self.assertEqual(untimed_data["recurring_task"]["id"], rec.id)

        timed_data = payload[0]
        self.assertEqual(timed_data["board_id"], board_b.id)
        self.assertEqual(timed_data["board_title"], "Beta Board")
        self.assertEqual(timed_data["column_title"], "Doing")
        self.assertEqual(timed_data["total_seconds"], 600)

    def test_shared_board_tasks_require_collaborator_time_entry(self):
        shared_board = Board.objects.create(owner=self.owner, title="Shared Board")
        BoardMembership.objects.create(board=shared_board, user=self.collaborator)
        BoardMembership.objects.create(board=shared_board, user=self.other_collaborator)
        col = BoardColumn.objects.create(board=shared_board, title="In Progress", position=0)

        task_with_collab_entry = Task.objects.create(
            column=col,
            title="Collaborator Logged Here",
            position=0,
        )
        TaskTimeEntry.objects.create(
            task=task_with_collab_entry,
            user=self.collaborator,
            started_at=timezone.now() - timedelta(minutes=10),
            ended_at=timezone.now(),
            duration_seconds=600,
        )

        task_only_owner_entry = Task.objects.create(
            column=col,
            title="Owner Only Logged Here",
            position=1,
        )
        TaskTimeEntry.objects.create(
            task=task_only_owner_entry,
            user=self.owner,
            started_at=timezone.now() - timedelta(minutes=20),
            ended_at=timezone.now(),
            duration_seconds=1200,
        )

        Task.objects.create(
            column=col,
            title="Untimed Shared Task",
            position=2,
        )

        response = self.client.get(
            "/api/kanban/tasks",
            **self.auth_headers("feed_collab@example.com"),
        )
        self.assertEqual(response.status_code, 200)
        returned_ids = [task["id"] for task in response.json()]
        self.assertEqual(returned_ids, [task_with_collab_entry.id])

    def test_shared_board_task_sums_all_collaborators_time_entries(self):
        shared_board = Board.objects.create(owner=self.owner, title="Multi-Collaborator Board")
        BoardMembership.objects.create(board=shared_board, user=self.collaborator)
        BoardMembership.objects.create(board=shared_board, user=self.other_collaborator)
        col = BoardColumn.objects.create(board=shared_board, title="Doing", position=0)
        shared_task = Task.objects.create(column=col, title="Joint Task", position=0)

        now = timezone.now()
        TaskTimeEntry.objects.create(
            task=shared_task,
            user=self.owner,
            started_at=now - timedelta(minutes=30),
            ended_at=now - timedelta(minutes=10),
            duration_seconds=1200,
        )
        TaskTimeEntry.objects.create(
            task=shared_task,
            user=self.collaborator,
            started_at=now - timedelta(minutes=10),
            ended_at=now,
            duration_seconds=600,
        )

        collab_response = self.client.get(
            "/api/kanban/tasks",
            **self.auth_headers("feed_collab@example.com"),
        )
        self.assertEqual(collab_response.status_code, 200)
        collab_payload = collab_response.json()
        self.assertEqual(len(collab_payload), 1)
        self.assertEqual(collab_payload[0]["id"], shared_task.id)
        self.assertEqual(collab_payload[0]["total_seconds"], 1800)

        owner_response = self.client.get(
            "/api/kanban/tasks",
            **self.auth_headers("feed_owner@example.com"),
        )
        self.assertEqual(owner_response.status_code, 200)
        self.assertEqual(owner_response.json()[0]["total_seconds"], 1800)

    def test_revoked_collaborator_excluded_despite_historical_time_entries(self):
        shared_board = Board.objects.create(owner=self.owner, title="Revoked Board")
        BoardMembership.objects.create(board=shared_board, user=self.collaborator)
        col = BoardColumn.objects.create(board=shared_board, title="To Do", position=0)
        task = Task.objects.create(column=col, title="Historical Work", position=0)
        TaskTimeEntry.objects.create(
            task=task,
            user=self.collaborator,
            started_at=timezone.now() - timedelta(minutes=20),
            ended_at=timezone.now(),
            duration_seconds=1200,
        )

        # Visible while collaborator has access
        initial = self.client.get(
            "/api/kanban/tasks",
            **self.auth_headers("feed_collab@example.com"),
        )
        self.assertEqual([t["id"] for t in initial.json()], [task.id])

        # Revoke collaborator access
        BoardMembership.objects.filter(board=shared_board, user=self.collaborator).delete()

        after_revoke = self.client.get(
            "/api/kanban/tasks",
            **self.auth_headers("feed_collab@example.com"),
        )
        self.assertEqual(after_revoke.status_code, 200)
        self.assertEqual(after_revoke.json(), [])

    def test_bidirectional_user_block_excludes_shared_tasks_despite_time_entries(self):
        shared_board = Board.objects.create(owner=self.owner, title="Blocked Board")
        BoardMembership.objects.create(board=shared_board, user=self.collaborator)
        col = BoardColumn.objects.create(board=shared_board, title="To Do", position=0)
        task = Task.objects.create(column=col, title="Blocked Work", position=0)
        TaskTimeEntry.objects.create(
            task=task,
            user=self.collaborator,
            started_at=timezone.now() - timedelta(minutes=10),
            ended_at=timezone.now(),
            duration_seconds=600,
        )

        for blocker, blocked in (
            (self.owner, self.collaborator),
            (self.collaborator, self.owner),
        ):
            with self.subTest(blocker=blocker.email):
                UserBlock.objects.create(blocker=blocker, blocked=blocked)
                response = self.client.get(
                    "/api/kanban/tasks",
                    **self.auth_headers("feed_collab@example.com"),
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), [])
                UserBlock.objects.filter(blocker=blocker, blocked=blocked).delete()

    def test_archived_tasks_excluded_on_owned_and_shared_boards_despite_time_entries(self):
        owned_board = Board.objects.create(owner=self.owner, title="Owned Board")
        owned_col = BoardColumn.objects.create(board=owned_board, title="Done", position=0)

        shared_board = Board.objects.create(owner=self.collaborator, title="Collab Owned Board")
        BoardMembership.objects.create(board=shared_board, user=self.owner)
        shared_col = BoardColumn.objects.create(board=shared_board, title="Done", position=0)

        owned_active = Task.objects.create(column=owned_col, title="Owned Active", position=0)
        owned_archived = Task.objects.create(
            column=owned_col,
            title="Owned Archived",
            position=None,
            archived_at=timezone.now(),
        )
        shared_archived = Task.objects.create(
            column=shared_col,
            title="Shared Archived",
            position=None,
            archived_at=timezone.now(),
        )

        for task in (owned_archived, shared_archived):
            TaskTimeEntry.objects.create(
                task=task,
                user=self.owner,
                started_at=timezone.now() - timedelta(minutes=10),
                ended_at=timezone.now(),
                duration_seconds=600,
            )

        response = self.client.get(
            "/api/kanban/tasks",
            **self.auth_headers("feed_owner@example.com"),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual([t["id"] for t in response.json()], [owned_active.id])

    def test_expired_countdown_reconciles_across_owned_and_shared_boards(self):
        collab_board = Board.objects.create(owner=self.collaborator, title="Collab Owned")
        collab_col = BoardColumn.objects.create(board=collab_board, title="Doing", position=0)
        owned_task = Task.objects.create(column=collab_col, title="Owned Countdown", position=0)
        TaskTimer.objects.create(
            task=owned_task,
            mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=900,
            state=TimerState.RUNNING,
            started_at=timezone.now() - timedelta(seconds=1000),
            elapsed_seconds=0,
        )

        shared_board = Board.objects.create(owner=self.owner, title="Shared Countdown Board")
        BoardMembership.objects.create(board=shared_board, user=self.collaborator)
        shared_col = BoardColumn.objects.create(board=shared_board, title="Doing", position=0)
        shared_task = Task.objects.create(column=shared_col, title="Shared Countdown", position=0)
        TaskTimer.objects.create(
            task=shared_task,
            mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=1500,
            state=TimerState.RUNNING,
            started_at=timezone.now() - timedelta(seconds=1600),
            elapsed_seconds=0,
        )

        private_board = Board.objects.create(owner=self.stranger, title="Stranger Board")
        private_col = BoardColumn.objects.create(board=private_board, title="Doing", position=0)
        private_task = Task.objects.create(column=private_col, title="Private Countdown", position=0)
        TaskTimer.objects.create(
            task=private_task,
            mode=TimerMode.COUNT_DOWN,
            target_duration_seconds=600,
            state=TimerState.RUNNING,
            started_at=timezone.now() - timedelta(seconds=700),
            elapsed_seconds=0,
        )

        response = self.client.get(
            "/api/kanban/tasks",
            **self.auth_headers("feed_collab@example.com"),
        )
        self.assertEqual(response.status_code, 200)

        payload_by_id = {task["id"]: task for task in response.json()}
        self.assertEqual(set(payload_by_id.keys()), {owned_task.id, shared_task.id})

        self.assertEqual(payload_by_id[owned_task.id]["total_seconds"], 900)
        self.assertEqual(payload_by_id[owned_task.id]["timer"]["state"], TimerState.IDLE)

        self.assertEqual(payload_by_id[shared_task.id]["total_seconds"], 1500)
        self.assertEqual(payload_by_id[shared_task.id]["timer"]["state"], TimerState.IDLE)

        owned_entry = TaskTimeEntry.objects.get(task=owned_task)
        self.assertEqual(owned_entry.user_id, self.collaborator.id)
        self.assertEqual(owned_entry.duration_seconds, 900)

        shared_entry = TaskTimeEntry.objects.get(task=shared_task)
        self.assertEqual(shared_entry.user_id, self.collaborator.id)
        self.assertEqual(shared_entry.duration_seconds, 1500)

        private_timer = TaskTimer.objects.get(task=private_task)
        self.assertEqual(private_timer.state, TimerState.RUNNING)
        self.assertEqual(TaskTimeEntry.objects.filter(task=private_task).count(), 0)

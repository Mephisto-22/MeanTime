"""Integration tests for background task due date reminder dispatch, APScheduler job, and advisory lock."""

from datetime import timedelta
from unittest.mock import patch
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone

from kanban.models import Board, BoardColumn, Task
from kanban.scheduler import (
    DUE_DATE_REMINDERS_ADVISORY_LOCK_ID,
    dispatch_due_date_reminders,
    run_due_date_reminders_job,
    start_scheduler,
    stop_scheduler,
)

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", DEFAULT_FROM_EMAIL="noreply@meantime.test")
class DueDateReminderSchedulerTests(TestCase):
    def setUp(self):
        mail.outbox.clear()
        self.owner = User.objects.create_user(
            email="owner@example.com",
            password="Password123!",
            display_name="Board Owner",
        )
        self.collab_active = User.objects.create_user(
            email="collab_active@example.com",
            password="Password123!",
            display_name="Active Collaborator",
            is_active=True,
        )
        self.collab_inactive = User.objects.create_user(
            email="collab_inactive@example.com",
            password="Password123!",
            display_name="Inactive Collaborator",
            is_active=False,
        )
        self.board = Board.objects.create(owner=self.owner, title="Project Phoenix")
        self.board.collaborators.add(self.collab_active, self.collab_inactive)
        self.column = BoardColumn.objects.create(board=self.board, title="Doing", position=0)

    def tearDown(self):
        stop_scheduler()

    def test_dispatch_due_date_reminders_sends_discrete_emails(self):
        """Active due tasks trigger discrete transactional emails to owner and active collaborators."""
        now = timezone.now()
        due_at = now + timedelta(minutes=30)
        task = Task.objects.create(
            column=self.column,
            title="Deploy release candidate",
            due_at=due_at,
            reminder_offset_seconds=3600,
        )
        # Simulate time passing: reminder_at has arrived in the past and reminder_sent_at is null
        Task.objects.filter(id=task.id).update(
            reminder_at=now - timedelta(minutes=5),
            reminder_sent_at=None,
        )

        dispatched = dispatch_due_date_reminders(as_of=now)
        self.assertEqual(dispatched, 1)

        # 2 emails: owner and active collaborator (inactive excluded)
        self.assertEqual(len(mail.outbox), 2)
        recipients = {msg.to[0] for msg in mail.outbox}
        self.assertEqual(recipients, {"owner@example.com", "collab_active@example.com"})

        # Privacy check: each email must have exactly one recipient in 'to'
        for msg in mail.outbox:
            self.assertEqual(len(msg.to), 1)
            self.assertIn("Deploy release candidate", msg.subject)
            self.assertIn("Project Phoenix", msg.subject)
            self.assertIn("Deploy release candidate", msg.body)
            self.assertIn("Project Phoenix", msg.body)
            self.assertIn(f"/boards/{self.board.id}", msg.body)

        # Idempotency check: task.reminder_sent_at is updated
        task.refresh_from_db()
        self.assertIsNotNone(task.reminder_sent_at)

        # Running again sends 0 duplicate emails
        mail.outbox.clear()
        dispatched_again = dispatch_due_date_reminders(as_of=now)
        self.assertEqual(dispatched_again, 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_reminders_suppressed_for_archived_tasks(self):
        """Archived tasks do not trigger reminder emails."""
        now = timezone.now()
        task = Task.objects.create(
            column=self.column,
            title="Archived Task",
            due_at=now + timedelta(minutes=30),
            reminder_offset_seconds=3600,
        )
        Task.objects.filter(id=task.id).update(
            reminder_at=now - timedelta(minutes=5),
            reminder_sent_at=None,
            archived_at=now - timedelta(minutes=1),
            position=None,
        )

        dispatched = dispatch_due_date_reminders(as_of=now)
        self.assertEqual(dispatched, 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_future_reminders_are_not_dispatched(self):
        """Tasks whose reminder_at is in the future are not dispatched."""
        now = timezone.now()
        task = Task.objects.create(
            column=self.column,
            title="Future Task",
            due_at=now + timedelta(days=2),
            reminder_offset_seconds=3600,
        )
        self.assertGreater(task.reminder_at, now)
        self.assertIsNone(task.reminder_sent_at)

        dispatched = dispatch_due_date_reminders(as_of=now)
        self.assertEqual(dispatched, 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_run_due_date_reminders_job_executes_service(self):
        """run_due_date_reminders_job executes dispatch_due_date_reminders."""
        with patch("kanban.scheduler.dispatch_due_date_reminders") as mock_dispatch:
            run_due_date_reminders_job()
            mock_dispatch.assert_called_once()

    def test_advisory_lock_skips_when_lock_not_acquired(self):
        """When another process holds the advisory lock, the reminder job skips execution gracefully."""
        if connection.vendor != "postgresql":
            self.skipTest("Advisory lock test requires PostgreSQL")

        other_conn = connection.copy()
        other_conn.connect()
        try:
            with other_conn.cursor() as cursor:
                cursor.execute("SELECT pg_try_advisory_lock(%s);", [DUE_DATE_REMINDERS_ADVISORY_LOCK_ID])
                locked = cursor.fetchone()[0]
                self.assertTrue(locked)
                try:
                    with patch("kanban.scheduler.dispatch_due_date_reminders") as mock_dispatch:
                        result = run_due_date_reminders_job()
                        self.assertIsNone(result)
                        mock_dispatch.assert_not_called()
                finally:
                    cursor.execute("SELECT pg_advisory_unlock(%s);", [DUE_DATE_REMINDERS_ADVISORY_LOCK_ID])
        finally:
            other_conn.close()

    def test_scheduler_registers_due_date_reminders_job(self):
        """start_scheduler registers the 60-second dispatch_due_date_reminders interval job."""
        sched = start_scheduler()
        self.assertTrue(sched.running)

        job = sched.get_job("dispatch_due_date_reminders")
        self.assertIsNotNone(job)
        self.assertEqual(job.trigger.interval.total_seconds(), 60)

        stop_scheduler()
        self.assertFalse(sched.running)

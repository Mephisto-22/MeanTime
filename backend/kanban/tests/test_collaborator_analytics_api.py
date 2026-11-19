"""Tests for the time per person in the board analytics, GET /api/kanban/boards/{id}/analytics."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from kanban.models import Board, BoardColumn, BoardMembership, TaskTimeEntry
from kanban.tests.test_board_analytics_api import PASSWORD, BoardAnalyticsTestCase

User = get_user_model()


class CollaboratorAnalyticsTestCase(BoardAnalyticsTestCase):
    """The owner's board, a task on it, and a helper to log time as anyone."""

    def setUp(self):
        super().setUp()
        self.task = self.add_task(self.todo, "Shared work")

    def add_user(self, name):
        return User.objects.create_user(
            email=f"{name.lower()}@example.com", password=PASSWORD, display_name=name)

    def log(self, user, seconds):
        now = timezone.now()
        TaskTimeEntry.objects.create(
            task=self.task,
            user=user,
            started_at=now - timedelta(seconds=seconds),
            ended_at=now,
            duration_seconds=seconds,
        )

    def get_collaborators(self, email="owner@example.com"):
        data = self.get_analytics(**self.auth_for(email)).json()
        rows = [
            (row["user_id"], row["display_name"], row["total_seconds"])
            for row in data["collaborators"]
        ]
        return data, rows


class CollaboratorTotalsTests(CollaboratorAnalyticsTestCase):
    """Who is listed and how much time each person gets."""

    def test_unshared_board_lists_only_the_owner(self):
        self.log(self.owner, 600)

        data, rows = self.get_collaborators()

        self.assertFalse(data["is_shared"])
        self.assertEqual(rows, [(self.owner.id, "Owner", 600)])

    def test_shared_board_lists_each_person_with_most_time_first(self):
        alice = self.add_user("Alice")
        bob = self.add_user("Bob")
        BoardMembership.objects.create(board=self.board, user=alice)
        BoardMembership.objects.create(board=self.board, user=bob)
        self.log(self.owner, 300)
        self.log(alice, 900)
        self.log(alice, 600)
        self.log(bob, 1200)

        data, rows = self.get_collaborators()

        self.assertTrue(data["is_shared"])
        self.assertEqual(
            rows,
            [(alice.id, "Alice", 1500), (bob.id, "Bob", 1200), (self.owner.id, "Owner", 300)],
        )
        self.assertEqual(sum(row[2] for row in rows), data["total_seconds"])

    def test_people_without_time_are_listed_with_zero(self):
        carol = self.add_user("Carol")
        BoardMembership.objects.create(board=self.board, user=carol)
        self.log(self.owner, 60)

        _, rows = self.get_collaborators()

        self.assertEqual(rows, [(self.owner.id, "Owner", 60), (carol.id, "Carol", 0)])

    def test_ties_are_ordered_by_name(self):
        zed = self.add_user("Zed")
        amy = self.add_user("amy")
        BoardMembership.objects.create(board=self.board, user=zed)
        BoardMembership.objects.create(board=self.board, user=amy)

        _, rows = self.get_collaborators()

        self.assertEqual([row[1] for row in rows], ["amy", "Owner", "Zed"])

    def test_entries_without_a_user_are_unknown_and_listed_last(self):
        self.log(None, 5000)
        self.log(self.owner, 100)

        data, rows = self.get_collaborators()

        self.assertEqual(rows, [(self.owner.id, "Owner", 100), (None, "Unknown", 5000)])
        self.assertEqual(data["total_seconds"], 5100)

    def test_someone_who_left_keeps_their_time(self):
        dana = self.add_user("Dana")
        self.log(dana, 700)  # Logged while a collaborator, who has since left.

        _, rows = self.get_collaborators()

        self.assertEqual(rows, [(dana.id, "Dana", 700), (self.owner.id, "Owner", 0)])

    def test_only_this_boards_time_is_counted(self):
        self.log(self.owner, 60)
        self.add_task(self.done, "Other column", 40)  # Same board: counted.
        other_board = Board.objects.create(owner=self.owner, title="Other")
        other_column = BoardColumn.objects.create(board=other_board, title="To Do")
        self.add_task(other_column, "Other board", 3600)  # Not counted.

        _, rows = self.get_collaborators()

        self.assertEqual(rows, [(self.owner.id, "Owner", 100)])

    def test_no_email_addresses_are_returned(self):
        alice = self.add_user("Alice")
        BoardMembership.objects.create(board=self.board, user=alice)
        self.log(alice, 60)

        res = self.get_analytics(**self.auth_for("owner@example.com"))

        self.assertNotIn("@example.com", res.content.decode())
        self.assertEqual(
            set(res.json()["collaborators"][0]), {"user_id", "display_name", "total_seconds"})


class CollaboratorAccessTests(CollaboratorAnalyticsTestCase):
    """Everyone who can open the board can see its time per person."""

    def setUp(self):
        super().setUp()
        self.alice = self.add_user("Alice")
        BoardMembership.objects.create(board=self.board, user=self.alice)
        self.log(self.owner, 300)
        self.log(self.alice, 600)

    def test_owner_sees_everyone(self):
        _, rows = self.get_collaborators("owner@example.com")

        self.assertEqual(rows, [(self.alice.id, "Alice", 600), (self.owner.id, "Owner", 300)])

    def test_collaborator_sees_everyone(self):
        _, rows = self.get_collaborators("alice@example.com")

        self.assertEqual(rows, [(self.alice.id, "Alice", 600), (self.owner.id, "Owner", 300)])

    def test_stranger_gets_404(self):
        self.add_user("Stranger")

        res = self.get_analytics(**self.auth_for("stranger@example.com"))

        self.assertEqual(res.status_code, 404)

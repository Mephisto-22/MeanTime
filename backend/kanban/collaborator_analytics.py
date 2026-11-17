"""Board analytics: how a board's tracked time is split between the people who tracked it."""

from django.contrib.auth import get_user_model
from django.db.models import Sum
from ninja import Schema

from .models import Board, TaskTimeEntry

# The group for time entries with no user (entries recorded before they had one).
UNKNOWN_NAME = "Unknown"


class CollaboratorTimeOut(Schema):
    """Tracked time by one person on a board, by display name only and never email."""
    user_id: int | None
    display_name: str
    total_seconds: int


def collaborator_totals(board: Board) -> list[dict]:
    """Return each person's tracked time on the board, most time first.

    The owner and every collaborator are listed, even with no time. Someone
    who has left the board is listed too, because their time still counts
    towards the board's total. Entries with no user come last, as "Unknown".
    """
    seconds_by_user = dict(
        TaskTimeEntry.objects.filter(task__column__board=board)
        .order_by()
        .values("user")
        .annotate(total=Sum("duration_seconds"))
        .values_list("user", "total")
    )

    people = {board.owner.id: board.owner}
    people.update((user.id, user) for user in board.collaborators.all())
    former_ids = [
        user_id for user_id in seconds_by_user if user_id is not None and user_id not in people
    ]
    people.update(
        (user.id, user) for user in get_user_model().objects.filter(id__in=former_ids))

    rows = sorted(
        (
            {
                "user_id": user.id,
                "display_name": user.display_name,
                "total_seconds": seconds_by_user.get(user.id, 0),
            }
            for user in people.values()
        ),
        key=lambda row: (-row["total_seconds"], row["display_name"].casefold()),
    )
    if seconds_by_user.get(None):
        rows.append(
            {"user_id": None, "display_name": UNKNOWN_NAME, "total_seconds": seconds_by_user[None]})
    return rows

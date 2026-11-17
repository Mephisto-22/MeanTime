# Board sharing and live updates

MeanTime users can share boards with accepted friends and receive live updates while
viewing a shared board.

## Sharing a board

Only the board owner can invite collaborators, change their roles, or remove other
collaborators. Sharing and role changes require an accepted friendship. Collaborators
with either role can leave a board themselves.

| Permission | Owner | `EDITOR` | `VIEWER` |
| --- | --- | --- | --- |
| Read the board, analytics, tags, time entries, and live events | Yes | Yes | Yes |
| Update board details, columns, tasks, recurring tasks, timers, and time entries | Yes | Yes | No |
| Invite collaborators or change roles | Yes | No | No |
| Remove other collaborators or delete the board | Yes | No | No |
| Leave a shared board | N/A | Yes | Yes |

Board ownership remains with the user who created it. Viewer writes to editable
board resources return `403`. Users without board access receive `404` for board
resources. Access is also denied when the owner and collaborator have blocked one
another. Owner-only routes return `404` for non-owners.

The relevant API routes are:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/kanban/boards/{board_id}/collaborators` | Add an accepted friend or update their role (`friend_id`, `role`) |
| `DELETE` | `/api/kanban/boards/{board_id}/collaborators/{collaborator_id}` | Owner revokes access; collaborator can remove themselves |

Shared boards are included in `GET /api/kanban/boards` and can be retrieved through
`GET /api/kanban/boards/{board_id}`.

To add a viewer or change an existing collaborator to viewer, send:

```json
{
  "friend_id": 34,
  "role": "VIEWER"
}
```

`role` accepts only `EDITOR` and `VIEWER`; other values return `422`. Omitting it
defaults to `EDITOR`, including when updating an existing collaborator. Repeating
the request updates the same membership rather than creating a duplicate. The
response remains `{"success": true, "message": "Board shared successfully."}`.

Board responses include `owner`, `is_owner`, and `collaborators`. Each collaborator
contains their public user fields plus `role`. The requesting user's role can be
found by matching their user ID in `collaborators`, unless `is_owner` is true.

Memberships are stored in `BoardMembership`, with one row per board/user pair.
Migrations `0014` through `0016` create memberships, copy existing collaborators
with the `EDITOR` role, and remove the old many-to-many field.

## Live board updates

The board view subscribes to server-sent events (SSE) while it is mounted. The endpoint
uses the same bearer-token authentication as the Kanban API:

```http
GET /api/kanban/boards/{board_id}/events
Accept: text/event-stream
Authorization: Bearer <access_token>
```

The endpoint is available to board owners and collaborators. A user without board
access receives the normal API authorization response.

Each event contains a common envelope:

```json
{
  "id": "event-uuid",
  "type": "task.created",
  "board_id": 12,
  "actor_id": 34,
  "timestamp": "2026-11-13T12:00:00Z",
  "data": {}
}
```

`data` contains the resource details for the event. Current event types are:

- `board.updated`, `board.deleted`, `board.access_revoked`, `board.collaborator_updated`
- `column.created`, `column.updated`, `column.deleted`
- `task.created`, `task.updated`, `task.deleted`, `task.moved`
- `task.timer_updated`
- `time_entry.created`, `time_entry.updated`, `time_entry.deleted`

### Collaborator role notifications

After a collaborator is added or their role changes, the backend publishes
`board.collaborator_updated` after the membership transaction commits. Its `data`
contains the affected user's ID and current role:

```json
{
  "user_id": 34,
  "role": "VIEWER"
}
```

The envelope's `actor_id` identifies the owner who made the change. All connected
board subscribers receive the event, including the affected collaborator. Their
stream stays open because both roles retain read access. Requests that leave the
role unchanged, rejected requests, and rolled-back changes publish no update.

Clients should handle this event by refreshing board membership data and updating
editing controls for the current user. Backend write permissions use the stored
role immediately, independently of whether a client has received the event.
Frontend handling of this new event must be wired separately.

Delivery uses Redis Pub/Sub without event replay. A disconnected client must refresh
the board after reconnecting to recover its current role. Redis publishing failures
are logged and do not undo an otherwise successful membership update.

The frontend applies incoming events to the open board. If the connection is
interrupted, it reconnects and refreshes board data after reconnecting. The stream is
closed when the board is deleted or the connected user's access is revoked.

## Development notes

Redis must be available to the backend for event delivery. Configure `REDIS_HOST` and
`REDIS_PORT` in the environment; the defaults are `localhost` and `6379`.

Relevant implementation areas:

- `backend/kanban/api.py` — sharing routes, access checks, and event publication.
- `backend/kanban/event_schemas.py` — event types and payload envelope.
- `backend/kanban/events/` — event publishing and subscriptions.
- `backend/kanban/sse.py` — SSE response formatting.
- `frontend/app/composables/useBoardEvents.ts` — frontend connection and reconnection.
- `frontend/app/components/kanban/Board.vue` — applying board events.

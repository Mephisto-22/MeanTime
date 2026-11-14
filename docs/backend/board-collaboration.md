# Board sharing and live updates

MeanTime users can share boards with accepted friends and receive live updates while
viewing a shared board.

## Sharing a board

Only the board owner can add or remove collaborators. A board can be shared with a
user after the friendship has been accepted. Collaborators can leave a board at any
time, but cannot invite other users or remove other collaborators.

Collaborators can update board details and work with its columns, tasks, and timers.
Board ownership remains with the user who created it. Access is denied when the board owner
and collaborator have blocked one another.

The relevant API routes are:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/kanban/boards/{board_id}/collaborators` | Share a board with an accepted friend (`friend_id`) |
| `DELETE` | `/api/kanban/boards/{board_id}/collaborators/{collaborator_id}` | Owner revokes access; collaborator can remove themselves |

Shared boards are included in `GET /api/kanban/boards` and can be retrieved through
`GET /api/kanban/boards/{board_id}`.

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

- `board.updated`, `board.deleted`, `board.access_revoked`
- `column.created`, `column.updated`, `column.deleted`
- `task.created`, `task.updated`, `task.deleted`, `task.moved`
- `task.timer_updated`

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
- `frontend/app/components/kanban/KanbanBoard.vue` — applying board events.

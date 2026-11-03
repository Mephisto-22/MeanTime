# Design Document: Board Sharing & Collaborative Access (Google Docs Style)

- **Author:** Agent Antigravity & User
- **Date:** 2026-11-02
- **Status:** Draft (Pending User Approval)
- **Target Routes:** `/boards/[id]`, `/friends`
- **Scope:** Full-stack (Backend Kanban API schemas & endpoints + Frontend UI dialogs & services)

---

## 1. Intent & Context

MeanTime supports task and time management on Kanban boards. Users need the ability to collaborate with their accepted friends on boards—similar to how Google Docs manages document sharing.

The backend backend board sharing foundations were introduced in PR #121 (`89-feature-backend-board-sharing-collaborative-access`), adding `Board.collaborators` (ManyToMany), endpoints to share and remove collaborator access, and automatic access revocation when users block each other.

This document designs the complete end-to-end sharing experience:
1. Enhancing the backend API schemas to expose board owner and collaborator details.
2. Creating a Google Docs-style **Share** dialog on the board page (`/boards/[id]`).
3. Adding a **Share board** action on the Friends page (`/friends`) to quickly share boards with friends.
4. Implementing collaboration rules: only the owner can invite new friends or remove other collaborators; collaborators have editor access and can voluntarily "Leave Board" with a confirmation prompt; blocked collaborators lose access immediately.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **API Extension**:
  - Update `BoardOut` in `backend/kanban/schemas.py` to include `owner: UserOut` and `collaborators: list[UserOut] = []`.
  - Update board queries in `backend/kanban/api.py` to `select_related("owner")` and `prefetch_related("collaborators")`.
  - Expose API methods in `frontend/app/api/kanban.ts`: `shareBoard(boardId, friendId)` and `removeCollaborator(boardId, collaboratorId)`.
- **Board Page Sharing Dialog (`/boards/[id]`)**:
  - Add a **Share** button on `/boards/[id]` (with icon `pi pi-users` or `pi pi-share-alt`).
  - Google Docs-style modal containing:
    - **Header**: Board title and sharing subtitle.
    - **Add Collaborators**: Searchable dropdown or autocomplete of accepted friends (retrieved from `friendsApi.getFriends()`), excluding existing collaborators and owner. Disabled/hidden for non-owners.
    - **People with access**:
      - Owner row labeled with an "Owner" badge.
      - Collaborator rows labeled with an "Editor" badge.
      - Owner can click "Remove" / "X" next to any collaborator to revoke their access.
    - **Collaborator Leave Action**:
      - When viewed by a collaborator, show a red "Leave Board" button.
      - Clicking opens an "Are you sure?" confirmation dialog.
      - Upon confirmation, calls the remove collaborator endpoint for the current user and redirects to `/` (dashboard).
- **Friends Page Integration (`/friends`)**:
  - In `FriendsList.vue`, add a **Share board** action button on each friend card.
  - Clicking opens a dialog to select from the user's owned boards and share directly with that friend.
- **Security & Blocking**:
  - Ensure users blocked by the owner (or who block the owner) cannot access the board, returning a 404 not found page as implemented in PR #121.
- **Testing**:
  - Comprehensive unit/integration tests for the backend API and frontend components.

### Non-Goals
- Role-based permissions other than Owner vs Editor (e.g. read-only "Viewer" or granular column-level ACLs).
- Allowing non-owner collaborators to invite other users (explicitly specified by the user: only the owner can invite).
- Public link sharing or unauthenticated anonymous access.

### Anti-Goals
- Do not make separate round-trips to fetch collaborators whenever loading a board; keep board metadata bundled in `BoardOut`.
- Do not leave collaborator lists unsynchronized when adding/removing collaborators; update local board state reactively.
- Do not let collaborators accidentally leave a board without explicit confirmation.

---

## 3. Approaches Considered

| Approach | Description | Tradeoffs & Evaluation |
| :--- | :--- | :--- |
| **1. Integrated Board Model & Reusable Share Dialog (Selected)** | Include `owner` and `collaborators` in `BoardOut`. Single reactive board object drives UI permissions, badges, and the Share popup. | **Selected:** Zero extra network latency opening the dialog; board header immediately knows if user is owner or collaborator; standard REST pattern. |
| **2. Separate Collaborator Sub-resource Endpoint** | Keep `BoardOut` unchanged; add `GET /api/kanban/boards/{id}/collaborators`. Lazily fetch collaborators on modal open. | Requires an extra roundtrip every time Share is clicked; cannot display collaborator avatars/counts in board header or cards without extra queries. |

**Decision:** The user selected **Approach 1**.

---

## 4. Technical Specification

### 4.1 Backend Architecture

#### Schema Updates (`backend/kanban/schemas.py`)
Import `UserOut` from `users.schemas`:
```python
from users.schemas import UserOut

class BoardOut(Schema):
    """Shape of a board returned to clients."""
    id: int
    title: str
    description: str
    owner: UserOut
    collaborators: list[UserOut] = []
    columns: list[BoardColumnOut]
    created_at: datetime
    updated_at: datetime
```

#### Query Optimization (`backend/kanban/api.py`)
In `get_board_queryset(user)`:
```python
def get_board_queryset(user):
    task_qs = Task.objects.select_related("timer").prefetch_related("tags")
    col_qs = BoardColumn.objects.prefetch_related(Prefetch("tasks", queryset=task_qs))
    return (
        get_accessible_boards(user)
        .select_related("owner")
        .prefetch_related("collaborators", Prefetch("columns", queryset=col_qs))
    )
```

#### Endpoints Verified & Utilized
- `POST /api/kanban/boards/{board_id}/collaborators` (payload: `{ friend_id: int }`): Only board owner can invite accepted friends.
- `DELETE /api/kanban/boards/{board_id}/collaborators/{collaborator_id}`: Owner can remove any collaborator; collaborator can remove themselves.
- `get_accessible_boards`: Filters out boards where owner has blocked user or user has blocked owner.

---

### 4.2 Frontend Architecture

#### Type Definitions & Client (`frontend/app/api/kanban.ts`)
```typescript
import type { UserOut } from '~/api/friends'

export interface KanbanBoardDto {
  id: string | number
  title: string
  description: string
  owner: UserOut
  collaborators: UserOut[]
  columns: KanbanColumnDto[]
}

// KanbanApi additions:
shareBoard(boardId: string | number, friendId: number): Promise<{ success: boolean; message: string }>
removeCollaborator(boardId: string | number, collaboratorId: number): Promise<{ success: boolean; message: string }>
```

#### Board Share Dialog (`frontend/app/components/kanban/BoardShareDialog.vue`)
- **Props**:
  - `modelValue: boolean` (or `visible: boolean`)
  - `board: KanbanBoardDto`
- **Events**:
  - `update:visible`
  - `collaborators-updated` (emits updated board or triggers refresh)
  - `left-board` (notifies parent that current user left)
- **Features**:
  1. **Owner vs Collaborator Detection**:
     - `isOwner = computed(() => authStore.user?.id === props.board.owner?.id)`
     - `isCollaborator = computed(() => props.board.collaborators?.some(c => c.id === authStore.user?.id))`
  2. **Friend Search & Invite**:
     - Visible only if `isOwner`.
     - Fetches friends via `friendsApi.getFriends()`.
     - Filters out friends already in `board.collaborators` or `board.owner`.
     - Dropdown / search selector with an "Invite" / "Share" button.
     - Loading and feedback states using `useNotifications`.
  3. **People with Access List**:
     - Owner section: Avatar, display name, email, badge "Owner".
     - Collaborators section:
       - List of collaborators with Avatar, display name, email, badge "Editor".
       - For owner: A remove button ("Remove access" or trash icon) with confirmation or direct action + toast.
  4. **Leave Board Action**:
     - Shown if `!isOwner && isCollaborator`.
     - Red button: "Leave Board" (`severity="danger"`, `icon="pi pi-sign-out"`).
     - Triggers PrimeVue `ConfirmDialog` or internal modal:
       - Header: "Leave Board?"
       - Message: "Are you sure you want to leave \"[Board Title]\"? You will lose access to all tasks and columns."
       - Accept: calls `kanbanApi.removeCollaborator(board.id, authStore.user.id)`, emits `left-board`, navigates to `/`.

#### Board Header Integration (`frontend/app/pages/boards/[id].vue` and `Board.vue`)
- In the top action bar of `/boards/[id]` (next to the back link or within the board header):
  - A prominent "Share" button:
    ```html
    <Button
      label="Share"
      icon="pi pi-users"
      size="small"
      data-testid="board-share-button"
      @click="isShareDialogOpen = true"
    />
    ```
  - Collaborator avatar stack preview next to the button when collaborators exist.

#### Friends Page Integration (`frontend/app/components/friends/FriendsList.vue`)
- Add a "Share board" button (`icon="pi pi-share-alt"`, `severity="secondary"`, `variant="outlined"`) on each friend card.
- Opens `FriendShareBoardDialog.vue`:
  - Lists the user's owned boards (`kanbanApi.listBoards()`, filtered by `owner.id === authStore.user.id`).
  - Select board to share with this friend.
  - Calls `kanbanApi.shareBoard(selectedBoardId, friend.id)` and shows success notification.

---

## 5. Security & Permission Rules

1. **Owner-Only Invitation**: Non-owners cannot invite other users. Backend enforces `get_owned_board(request.auth, board_id)`.
2. **Accepted Friends Only**: Board can only be shared with accepted friends (`request.auth.is_friends_with(friend)`).
3. **Unfriending vs. Blocking**:
   - In accordance with PR #121, unfriending does not automatically revoke shared board access; users can remain collaborators unless access is explicitly revoked or either user blocks the other.
   - Blocking immediately revokes access in both directions via `get_accessible_boards`.
4. **Collaborator Removal**:
   - Owner can remove any collaborator.
   - Collaborator can only remove themselves (`request.auth.id == collaborator_id`).
   - Anyone else attempting removal receives 403 Forbidden.
5. **Task & Timer Collaborator Permissions**:
   - Collaborators have editor access to tasks and columns.
   - `list_time_entries`, `create_time_entry`, and `patch_task_timer` will support accessible tasks (`get_accessible_task`) so collaborators can view task history, run timers, and record their work sessions on shared tasks without encountering 404 errors.
6. **Board Deletion**:
   - Only the board owner can delete a board (`DELETE /api/kanban/boards/{id}`).
   - On the frontend (`BoardFormDialog.vue`), the "Delete board" button is shown only when `board.owner.id === authStore.user.id`.

---

## 6. What Is Left to the Builder

- Styling details and exact Tailwind color tokens matching the existing MeanTime theme (surfaces, badges, and PrimeVue dark mode tokens).
- Exact avatar fallback initials helper reuse (already present in `FriendsList.vue`).
- PrimeVue component usage (`Dialog`, `Button`, `Select` / `AutoComplete`, `Avatar`, `Badge`, `ConfirmDialog`).

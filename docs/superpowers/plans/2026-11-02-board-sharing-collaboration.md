# Board Sharing & Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Google Docs-style board sharing system with owner/collaborator permissions across the Kanban board page and Friends page, backed by extended API schemas and access enforcement.

**Architecture:** Extend backend Kanban schemas to include board owner and collaborator models (`UserOut`), optimize queryset prefetching, and expand timer/time-entry endpoints to all accessible boards. On the frontend, build a reusable `BoardShareDialog` for `/boards/[id]` featuring friend search, collaborator listing, owner removal actions, and a collaborator "Leave Board" workflow with confirmation. Integrate a "Share board" action dialog on `/friends` allowing users to quickly share their owned boards with friends.

**Tech Stack:** Django 6 / Django Ninja / PostgreSQL (backend), Nuxt 4 / Vue 3 / PrimeVue 5 / Tailwind CSS (frontend), Vitest / Django TestCase (testing).

**Spec:** [docs/superpowers/specs/2026-11-02-board-sharing-collaboration-design.md](file:///c:/Users/andre/Desktop/MeanTime/docs/superpowers/specs/2026-11-02-board-sharing-collaboration-design.md)

---

## Global Constraints

- Backend API models and schemas MUST adhere to Django Ninja conventions and import `UserOut` from `users.schemas`.
- All frontend API methods MUST use `apiService` from `~/services/ApiService`.
- Board owner and collaborator data MUST be returned inside `BoardOut` without requiring extra round-trips to open the share dialog.
- Only the board owner can invite friends to collaborate or remove other collaborators.
- Collaborators MUST NOT be allowed to delete the board; the delete action is strictly reserved for the board owner.
- Collaborators can remove themselves ("Leave Board"), triggering an "Are you sure?" confirmation prompt before calling the API.
- Users who are blocked by the owner (or block the owner) MUST receive a 404 response when attempting to access the board.
- Unfriending alone does NOT revoke board access unless explicitly removed or blocked.

---

## Review Focus

1. **Self-Invitation / Duplicate Sharing Prevention:** Attempting to share a board with the current owner or someone who is already a collaborator must be filtered out in the UI and rejected cleanly.
2. **Collaborator "Leave Board" Confirmation & Navigation:** Leaving a board must present an explicit confirmation prompt; upon confirmation, the client must remove access and navigate away from `/boards/[id]` to avoid displaying a 404 error page.
3. **Owner Removal of Collaborators:** Removing a collaborator must update the collaborator list reactively in the dialog without closing the modal or requiring a full page refresh.
4. **Timer & Time Entry Access for Collaborators:** When a collaborator views tasks on a shared board, `list_time_entries`, `create_time_entry`, and `patch_task_timer` must succeed (`get_accessible_task`), attributing created time entries to the authenticated collaborator (`user=request.auth`).
5. **Board Deletion Protection on Dashboard:** In `BoardFormDialog.vue`, non-owner collaborators must never see or trigger the "Delete board" button.

---

## Task Breakdown

### Task 1: Backend API & Schema Enhancements

**Files:**
- Modify: `backend/kanban/schemas.py:110-126`
- Modify: `backend/kanban/api.py:113-118, 405-530`
- Test: `backend/kanban/tests/test_sharing_api.py`

**Interfaces:**
- Consumes: `users.schemas.UserOut`, `backend.kanban.models.Board`
- Produces:
  - `BoardOut` updated with `owner: UserOut` and `collaborators: list[UserOut] = []`
  - `get_board_queryset(user)` prefetching `owner` and `collaborators`
  - `patch_task_timer`, `list_time_entries`, `create_time_entry` using `get_accessible_task`

- [ ] **Step 1: Write backend tests for board sharing and collaboration**

Create `backend/kanban/tests/test_sharing_api.py`:
```python
"""Tests for board sharing, collaboration schemas, and permissions."""
import json
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from kanban.models import Board, BoardColumn, Task
from users.models import Friendship, FriendshipStatus, UserBlock

User = get_user_model()
PASSWORD = "TestPassword123!"

class BoardSharingApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.owner = User.objects.create_user(email="owner@example.com", password=PASSWORD, display_name="Owner")
        self.friend = User.objects.create_user(email="friend@example.com", password=PASSWORD, display_name="Friend")
        self.stranger = User.objects.create_user(email="stranger@example.com", password=PASSWORD, display_name="Stranger")
        Friendship.objects.create(requester=self.owner, addressee=self.friend, status=FriendshipStatus.ACCEPTED)
        self.board = Board.objects.create(owner=self.owner, title="Project X")
        self.col = BoardColumn.objects.create(board=self.board, title="To Do")
        self.task = Task.objects.create(column=self.col, title="Task 1")

    def auth_headers(self, email):
        login = self.client.post("/api/auth/login", data=json.dumps({"email": email, "password": PASSWORD}), content_type="application/json")
        return {"HTTP_AUTHORIZATION": f"Bearer {login.json()['access_token']}"}

    def test_board_serialization_includes_owner_and_collaborators(self):
        res = self.client.get(f"/api/kanban/boards/{self.board.id}", **self.auth_headers("owner@example.com"))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["owner"]["id"], self.owner.id)
        self.assertEqual(data["collaborators"], [])

    def test_owner_shares_board_with_friend(self):
        res = self.client.post(
            f"/api/kanban/boards/{self.board.id}/collaborators",
            data=json.dumps({"friend_id": self.friend.id}),
            content_type="application/json",
            **self.auth_headers("owner@example.com"),
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(self.board.collaborators.filter(id=self.friend.id).exists())

        # Check serialization includes collaborator
        get_res = self.client.get(f"/api/kanban/boards/{self.board.id}", **self.auth_headers("owner@example.com"))
        self.assertEqual(len(get_res.json()["collaborators"]), 1)
        self.assertEqual(get_res.json()["collaborators"][0]["id"], self.friend.id)

    def test_collaborator_can_leave_board(self):
        self.board.collaborators.add(self.friend)
        res = self.client.delete(
            f"/api/kanban/boards/{self.board.id}/collaborators/{self.friend.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(self.board.collaborators.filter(id=self.friend.id).exists())

    def test_collaborator_cannot_remove_other_collaborators(self):
        other = User.objects.create_user(email="other@example.com", password=PASSWORD, display_name="Other")
        self.board.collaborators.add(self.friend, other)
        res = self.client.delete(
            f"/api/kanban/boards/{self.board.id}/collaborators/{other.id}",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(res.status_code, 403)

    def test_collaborator_cannot_invite_friends(self):
        self.board.collaborators.add(self.friend)
        res = self.client.post(
            f"/api/kanban/boards/{self.board.id}/collaborators",
            data=json.dumps({"friend_id": self.stranger.id}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(res.status_code, 404)

    def test_blocked_user_loses_board_access(self):
        self.board.collaborators.add(self.friend)
        UserBlock.objects.create(blocker=self.owner, blocked=self.friend)
        res = self.client.get(f"/api/kanban/boards/{self.board.id}", **self.auth_headers("friend@example.com"))
        self.assertEqual(res.status_code, 404)

    def test_collaborator_can_access_timers_and_time_entries(self):
        self.board.collaborators.add(self.friend)
        # list time entries
        res = self.client.get(f"/api/kanban/tasks/{self.task.id}/time-entries", **self.auth_headers("friend@example.com"))
        self.assertEqual(res.status_code, 200)
        # create time entry
        entry_res = self.client.post(
            f"/api/kanban/tasks/{self.task.id}/time-entries",
            data=json.dumps({"started_at": "2026-11-02T10:00:00Z", "duration_seconds": 60, "note": "Collaborator work"}),
            content_type="application/json",
            **self.auth_headers("friend@example.com"),
        )
        self.assertEqual(entry_res.status_code, 201)
        self.assertEqual(entry_res.json()["user_id"], self.friend.id)
```

- [ ] **Step 2: Update `backend/kanban/schemas.py` and `backend/kanban/api.py`**

In `backend/kanban/schemas.py`:
- Import `UserOut` from `users.schemas`.
- Update `BoardOut`:
  ```python
  class BoardOut(Schema):
      id: int
      title: str
      description: str
      owner: UserOut
      collaborators: list[UserOut] = []
      columns: list[BoardColumnOut]
      created_at: datetime
      updated_at: datetime
  ```

In `backend/kanban/api.py`:
- Update `get_board_queryset(user)`:
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
- Update `patch_task_timer`, `list_time_entries`, `create_time_entry` to use `get_accessible_task(request.auth, task_id)`.

- [ ] **Step 3: Run backend tests to verify**

Run: `backend/.venv/Scripts/python -c "import os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); os.environ['DJANGO_SECRET_KEY']='k'; os.environ['POSTGRES_DB']='d'; os.environ['POSTGRES_USER']='u'; os.environ['POSTGRES_PASSWORD']='p'; os.environ['POSTGRES_HOST']='h'; os.environ['POSTGRES_PORT']='5432'; import django; django.setup(); from django.conf import settings; settings.DATABASES['default']={'ENGINE':'django.db.backends.sqlite3','NAME':':memory:'}; from django.core.management import call_command; call_command('test', 'kanban.tests.test_sharing_api')"`
Expected: 7 passed.

- [ ] **Step 4: Commit backend changes**

```bash
git add backend/kanban/schemas.py backend/kanban/api.py backend/kanban/tests/test_sharing_api.py
git commit -m "feat(kanban): extend BoardOut schema with owner/collaborators and allow collaborator timer access"
```

---

### Task 2: Frontend API Client & Types

**Files:**
- Modify: `frontend/app/api/kanban.ts:76-82, 140-161`
- Test: `frontend/tests/api/kanban-api.test.ts`

**Interfaces:**
- Consumes: `~/api/friends.ts` (`UserOut`), `~/services/ApiService`
- Produces:
  ```typescript
  export interface KanbanBoardDto {
    id: string | number
    title: string
    description: string
    owner: UserOut
    collaborators: UserOut[]
    columns: KanbanColumnDto[]
  }

  shareBoard(boardId: string | number, friendId: number): Promise<{ success: boolean; message: string }>
  removeCollaborator(boardId: string | number, collaboratorId: number): Promise<{ success: boolean; message: string }>
  ```

- [ ] **Step 1: Write failing tests in `frontend/tests/api/kanban-api.test.ts`**

Add tests:
```typescript
it('routes shareBoard to POST /api/kanban/boards/:id/collaborators with friend_id', async () => {
  const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue({ success: true, message: 'Board shared successfully.' } as any)
  await kanbanApi.shareBoard(42, 10)
  expect(postSpy).toHaveBeenLastCalledWith('/api/kanban/boards/42/collaborators', { friend_id: 10 })
})

it('routes removeCollaborator to DELETE /api/kanban/boards/:id/collaborators/:collaborator_id', async () => {
  const deleteSpy = vi.spyOn(apiService, 'delete').mockResolvedValue({ success: true, message: 'Collaborator access successfully revoked.' } as any)
  await kanbanApi.removeCollaborator(42, 10)
  expect(deleteSpy).toHaveBeenLastCalledWith('/api/kanban/boards/42/collaborators/10')
})
```

- [ ] **Step 2: Implement methods in `frontend/app/api/kanban.ts`**

- Import `UserOut` from `~/api/friends`.
- Update `KanbanBoardDto` interface with `owner: UserOut` and `collaborators: UserOut[]`.
- Add:
  ```typescript
  shareBoard(boardId: string | number, friendId: number): Promise<{ success: boolean; message: string }> {
    return apiService.post<{ success: boolean; message: string }>(`${this.endpoint}/boards/${boardId}/collaborators`, { friend_id: friendId })
  }

  removeCollaborator(boardId: string | number, collaboratorId: number): Promise<{ success: boolean; message: string }> {
    return apiService.delete<{ success: boolean; message: string }>(`${this.endpoint}/boards/${boardId}/collaborators/${collaboratorId}`)
  }
  ```

- [ ] **Step 3: Run Vitest to verify tests pass**

- [ ] **Step 4: Commit changes**

```bash
git add frontend/app/api/kanban.ts frontend/tests/api/kanban-api.test.ts
git commit -m "feat(kanban): add shareBoard and removeCollaborator to kanbanApi"
```

---

### Task 3: Board Share Dialog Component

**Files:**
- Create: `frontend/app/components/kanban/BoardShareDialog.vue`
- Test: `frontend/tests/components/board-share-dialog.test.ts`

**Interfaces:**
- Consumes: `KanbanBoardDto`, `friendsApi.getFriends()`, `kanbanApi.shareBoard()`, `kanbanApi.removeCollaborator()`, `useAuthStore`
- Produces:
  - Props: `board: KanbanBoardDto`, `visible: boolean` (v-model)
  - Emits: `update:visible`, `collaborators-updated`, `left-board`

- [ ] **Step 1: Write component unit test `frontend/tests/components/board-share-dialog.test.ts`**

Test scenarios:
- Displays board title, owner details with "Owner" badge.
- Displays collaborator rows with "Editor" badge.
- When current user is the owner:
  - Renders friend search/picker.
  - Selecting a friend and clicking "Invite" calls `kanbanApi.shareBoard`.
  - Clicking "Remove" on a collaborator calls `kanbanApi.removeCollaborator` and emits `collaborators-updated`.
- When current user is a collaborator:
  - Friend invite input is hidden / disabled.
  - Collaborators have no remove action.
  - Shows red "Leave Board" button.
  - Clicking "Leave Board" shows confirmation dialog ("Are you sure you want to leave this board?").
  - Confirming calls `kanbanApi.removeCollaborator(board.id, user.id)` and emits `left-board`.

- [ ] **Step 2: Implement `frontend/app/components/kanban/BoardShareDialog.vue`**

Using PrimeVue `Dialog`, `Avatar`, `Badge`, `Button`, `Select` (or custom dropdown), and confirmation dialog:
- Compute initials from display name / email.
- Fetch accepted friends with `friendsApi.getFriends()`, filtering out users already present in `board.collaborators` or `board.owner`.
- Provide toast notifications on invite/remove errors and successes.
- Include the red "Leave Board" button with prompt when user is not owner.

- [ ] **Step 3: Run Vitest to verify component tests pass**

- [ ] **Step 4: Commit changes**

```bash
git add frontend/app/components/kanban/BoardShareDialog.vue frontend/tests/components/board-share-dialog.test.ts
git commit -m "feat(kanban): create Google Docs-style BoardShareDialog component"
```

---

### Task 4: Board Page Header Integration & Board Deletion Guard

**Files:**
- Modify: `frontend/app/pages/boards/[id].vue:1-68`
- Modify: `frontend/app/components/kanban/BoardFormDialog.vue:85-97`
- Test: `frontend/tests/components/board.test.ts`

**Interfaces:**
- Consumes: `BoardShareDialog.vue`, `KanbanBoardDto`
- Produces:
  - "Share" button on `/boards/[id]` opening `BoardShareDialog`
  - Collaborator avatar preview
  - Restricted "Delete board" button in `BoardFormDialog.vue` (`v-if="isEditing && isOwner"`)

- [ ] **Step 1: Write/update test for Share button and BoardFormDialog deletion guard**

Verify:
- `/boards/[id]` displays "Share" button (`data-testid="board-share-button"`).
- Clicking "Share" opens `BoardShareDialog`.
- `BoardFormDialog.vue` hides "Delete board" button if `board.owner.id !== authStore.user?.id`.

- [ ] **Step 2: Modify `frontend/app/pages/boards/[id].vue`**

- Add action bar at the top with:
  ```html
  <div class="mb-6 flex items-center justify-between">
    <NuxtLink to="/" class="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
      <i class="pi pi-arrow-left text-xs" /> All boards
    </NuxtLink>
    <div v-if="board" class="flex items-center gap-3">
      <!-- Collaborators preview if any -->
      <div v-if="board.collaborators?.length > 0" class="flex -space-x-2 overflow-hidden">
        <Avatar
          v-for="c in board.collaborators.slice(0, 3)"
          :key="c.id"
          :label="c.display_name?.charAt(0).toUpperCase() || 'U'"
          shape="circle"
          size="small"
          class="border-2 border-surface-0 dark:border-surface-900 bg-primary-100 text-primary-700 text-xs font-semibold"
        />
        <span v-if="board.collaborators.length > 3" class="flex items-center justify-center w-6 h-6 rounded-full bg-surface-200 text-[10px] font-bold text-surface-600">
          +{{ board.collaborators.length - 3 }}
        </span>
      </div>
      <Button
        label="Share"
        icon="pi pi-users"
        size="small"
        data-testid="board-share-button"
        @click="isShareDialogOpen = true"
      />
    </div>
  </div>
  <BoardShareDialog
    v-if="board"
    v-model:visible="isShareDialogOpen"
    :board="board"
    @collaborators-updated="refresh()"
    @left-board="navigateTo('/')"
  />
  ```

- [ ] **Step 3: Update `frontend/app/components/kanban/BoardFormDialog.vue`**

Ensure `isOwner` check:
```typescript
const isOwner = computed(() => !props.board?.owner || props.board.owner.id === authStore.user?.id)
```
In template:
```html
<Button
  v-if="isEditing && isOwner"
  type="button"
  class="mr-auto"
  data-testid="board-delete-button"
  label="Delete board"
  severity="danger"
  text
  :disabled="isBusy"
  @click="isConfirmingDelete = true"
/>
```

- [ ] **Step 4: Run Vitest to verify tests pass**

- [ ] **Step 5: Commit changes**

```bash
git add frontend/app/pages/boards/[id].vue frontend/app/components/kanban/BoardFormDialog.vue frontend/tests/components/board.test.ts
git commit -m "feat(kanban): integrate Share button on board page and restrict delete action to board owner"
```

---

### Task 5: Friends Page Board Sharing Dialog & Action

**Files:**
- Create: `frontend/app/components/friends/FriendShareBoardDialog.vue`
- Modify: `frontend/app/components/friends/FriendsList.vue:90-105`
- Test: `frontend/tests/components/friends-list.test.ts`

**Interfaces:**
- Consumes: `friendsApi`, `kanbanApi.listBoards()`, `kanbanApi.shareBoard()`, `useAuthStore`
- Produces:
  - "Share board" button on each friend card in `FriendsList.vue`
  - `FriendShareBoardDialog.vue` modal to select an owned board and share with the friend

- [ ] **Step 1: Write/update test in `frontend/tests/components/friends-list.test.ts`**

Verify:
- Each friend card has a "Share board" button (`data-testid="share-board-button-${friend.id}"`).
- Clicking it opens `FriendShareBoardDialog` configured for that friend.
- Selecting a board and clicking "Share" triggers `kanbanApi.shareBoard(boardId, friend.id)`.

- [ ] **Step 2: Implement `frontend/app/components/friends/FriendShareBoardDialog.vue`**

- Props: `visible: boolean`, `friend: UserOut | null`.
- Loads boards using `kanbanApi.listBoards()`, filtering to owned boards (`b.owner?.id === authStore.user?.id`).
- Filters out boards where the friend is already a collaborator.
- Provides a board selector dropdown/list and "Share" button.
- Shows success toast on sharing and closes dialog.

- [ ] **Step 3: Update `frontend/app/components/friends/FriendsList.vue`**

Add "Share board" button in the friend card action buttons:
```html
<Button
  label="Share board"
  icon="pi pi-share-alt"
  severity="secondary"
  variant="outlined"
  size="small"
  :data-testid="'share-board-button-' + friend.id"
  @click="openShareDialog(friend)"
/>
```

- [ ] **Step 4: Run Vitest to verify tests pass**

- [ ] **Step 5: Commit changes**

```bash
git add frontend/app/components/friends/FriendShareBoardDialog.vue frontend/app/components/friends/FriendsList.vue frontend/tests/components/friends-list.test.ts
git commit -m "feat(friends): add Share board button and dialog to Friends page"
```

---

### Task 6: Full Verification & Typechecking

**Files:** All modified files.

- [ ] **Step 1: Run typechecks and linting across backend and frontend**
- [ ] **Step 2: Run all unit and integration tests**
  - Run backend tests: `python backend/manage.py test kanban`
  - Run frontend tests: `vitest run`
- [ ] **Step 3: Verify all 5 Review Focus edge cases**
- [ ] **Step 4: Final commit and clean branch state**

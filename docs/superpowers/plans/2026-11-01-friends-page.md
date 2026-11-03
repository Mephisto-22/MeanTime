# Friends Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `/friends` page with PrimeVue tabs for viewing confirmed friends, managing incoming/outgoing friend requests, searching users by exact email/display name to friend or block, managing blocked users, and integrating friends navigation into the application header.

**Architecture:** A modular Nuxt 4 / PrimeVue 5 frontend architecture following the project's established conventions: a typed API client (`frontend/app/api/friends.ts`) wrapping `ApiService`, four focused tab components under `frontend/app/components/friends/`, a parent page (`frontend/app/pages/friends.vue`) coordinating state and PrimeVue toast notifications, and a header navigation link in `frontend/app/layouts/default.vue`.

**Tech Stack:** Nuxt 4 (`^4.5.2`), Vue 3 (`^3.5.43`), PrimeVue 5 (`^5.0.2`), Tailwind CSS (`~3.4.17`), Pinia (`^4.0.3`), Vitest (`^5.0.5`), `@vue/test-utils` (`^2.5.1`).

**Spec:** [docs/superpowers/specs/2026-11-01-friends-page-design.md](file:///c:/Users/andre/Desktop/MeanTime/docs/superpowers/specs/2026-11-01-friends-page-design.md)

---

## Global Constraints

- Nuxt 4 directory structure: components in `frontend/app/components/`, pages in `frontend/app/pages/`, api in `frontend/app/api/`, layouts in `frontend/app/layouts/`.
- Frontend API calls MUST use `apiService` from `~/services/ApiService`.
- PrimeVue 5 components MUST follow PrimeVue 5 naming conventions (`Tabs`, `TabList`, `Tab`, `TabPanels`, `TabPanel`, `Button`, `InputText`, `Card`, `Tag`, `Toast`, `ConfirmDialog`, `Skeleton`).
- Strict TypeScript types for all models (`UserOut`, `RelationshipStatus`, `UserSearchResultOut`, `FriendRequestOut`, `FriendRequestsListOut`).
- Error handling MUST inspect backend response details (`ErrorDetail.detail`) and surface via PrimeVue `useToast`.
- Exact case-insensitive matching for search queries; query string MUST be trimmed before calling the search endpoint.
- All actions affecting friendship or block status MUST update reactive UI state and show user feedback without requiring a full page reload.

---

## Review Focus

1. **Multiple users matching a display name in search:** Backend search can return multiple users because `display_name` is non-unique; UI must render a list of user cards rather than assuming a single object.
2. **Blocking an existing friend or pending requester:** Blocking a user from the Friends tab or Requests tab must dissolve the friendship/request and move the user to the Blocked list with badge updates across both tabs.
3. **Self-search resolution:** Searching one's own email must show a client-side alert ("This is your email address") without making an unnecessary backend API call; searching one's own display name must query the API and clearly identify if other users share that name.
4. **Network/API error recovery:** When a friend request, unfriend, or block action fails (e.g. 400 or 500), buttons must reset from loading state and display the backend error toast message.
5. **Empty state handling across all 4 tabs:** Each tab must have an informative, visually distinct empty state when no records exist (e.g., no friends, no requests, no search results, no blocked users).

---

## Task Breakdown

### Task 1: Social API Client Service (`frontend/app/api/friends.ts`)

**Files:**
- Create: `frontend/app/api/friends.ts`
- Test: `frontend/tests/api/friends-api.test.ts`

**Interfaces:**
- Consumes: `apiService` from `~/services/ApiService`
- Produces:
  ```typescript
  export interface UserOut {
    id: number;
    email: string;
    display_name: string;
    timezone: string;
    created_at: string;
  }

  export type RelationshipStatus = 'none' | 'friend' | 'pending_incoming' | 'pending_outgoing';

  export interface UserSearchResultOut {
    id: number;
    email: string;
    display_name: string;
    timezone: string;
    relationship_status: RelationshipStatus;
  }

  export interface FriendRequestOut {
    id: number;
    user: UserOut;
    created_at: string;
  }

  export interface FriendRequestsListOut {
    incoming: FriendRequestOut[];
    outgoing: FriendRequestOut[];
  }

  export const friendsApi = {
    getFriends(): Promise<UserOut[]>,
    unfriend(userId: number): Promise<void>,
    getRequests(): Promise<FriendRequestsListOut>,
    sendRequest(userId: number): Promise<FriendRequestOut>,
    acceptRequest(userId: number): Promise<void>,
    declineRequest(userId: number): Promise<void>,
    cancelRequest(userId: number): Promise<void>,
    searchUser(query: string): Promise<UserSearchResultOut[]>,
    getBlocked(): Promise<UserOut[]>,
    blockUser(userId: number): Promise<void>,
    unblockUser(userId: number): Promise<void>,
  };
  ```

- [ ] **Step 1: Write the failing tests**
  Create `frontend/tests/api/friends-api.test.ts` mocking `apiService` (`get`, `post`, `delete`) and verifying:
  - `getFriends()` calls `GET /api/users/friends`
  - `unfriend(id)` calls `DELETE /api/users/friends/${id}`
  - `getRequests()` calls `GET /api/users/friends/requests`
  - `sendRequest(id)` calls `POST /api/users/friends/requests/${id}`
  - `acceptRequest(id)` calls `POST /api/users/friends/requests/${id}/accept`
  - `declineRequest(id)` calls `POST /api/users/friends/requests/${id}/decline`
  - `cancelRequest(id)` calls `DELETE /api/users/friends/requests/${id}`
  - `searchUser(query)` calls `GET /api/users/search?q=${encodeURIComponent(query)}`
  - `getBlocked()` calls `GET /api/users/blocks`
  - `blockUser(id)` calls `POST /api/users/blocks/${id}`
  - `unblockUser(id)` calls `DELETE /api/users/blocks/${id}`

- [ ] **Step 2: Run test to verify it fails**
  Run: `cd frontend; & "C:\Users\andre\AppData\Roaming\Antigravity\bin\agy-node.cmd" "./node_modules/vitest/vitest.mjs" run tests/api/friends-api.test.ts` (or vitest test runner)
  Expected: FAIL with module `~/api/friends` not found.

- [ ] **Step 3: Implement `friendsApi` in `frontend/app/api/friends.ts`**
  Implement the exported types and functions wrapping `apiService.get`, `apiService.post`, and `apiService.delete`.

- [ ] **Step 4: Run test to verify it passes**
  Run: verify all tests in `tests/api/friends-api.test.ts` pass.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/app/api/friends.ts frontend/tests/api/friends-api.test.ts
  git commit -m "feat(frontend): implement friends api client service"
  ```

---

### Task 2: Confirmed Friends Tab Component (`FriendsList.vue`)

**Files:**
- Create: `frontend/app/components/friends/FriendsList.vue`
- Test: `frontend/tests/components/friends-list.test.ts`

**Interfaces:**
- Consumes: `UserOut` from `~/api/friends`
- Props:
  - `friends`: `UserOut[]`
  - `loading`: `boolean`
- Emits:
  - `(e: 'unfriend', userId: number)`
  - `(e: 'block', userId: number)`

- [ ] **Step 1: Write the failing tests**
  Create `frontend/tests/components/friends-list.test.ts` verifying:
  - Renders skeleton loaders when `loading: true`.
  - Renders empty state message when `friends: []` and `loading: false`.
  - Renders friend cards displaying `display_name`, `email`, `timezone`, and avatar initials.
  - Clicking "Unfriend" triggers a confirmation dialog; confirming emits `unfriend` with the friend's `id`.
  - Clicking "Block" triggers a confirmation dialog; confirming emits `block` with the friend's `id`.

- [ ] **Step 2: Run test to verify it fails**
  Expected: FAIL with component `FriendsList.vue` not found.

- [ ] **Step 3: Implement `FriendsList.vue`**
  Build component with:
  - Skeleton loader cards during loading state.
  - PrimeVue `Card` or styled list item per friend showing avatar initials, display name, email, timezone.
  - Action buttons: "Unfriend" (outlined severity `danger`) and "Block" (text severity `secondary`).
  - PrimeVue `ConfirmDialog` or internal confirmation modal for unfriend and block actions.
  - Empty state with friendly prompt to add friends.

- [ ] **Step 4: Run test to verify it passes**
  Expected: PASS all tests in `tests/components/friends-list.test.ts`.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/app/components/friends/FriendsList.vue frontend/tests/components/friends-list.test.ts
  git commit -m "feat(frontend): implement FriendsList tab component"
  ```

---

### Task 3: Friend Requests Tab Component (`FriendRequestsList.vue`)

**Files:**
- Create: `frontend/app/components/friends/FriendRequestsList.vue`
- Test: `frontend/tests/components/friend-requests-list.test.ts`

**Interfaces:**
- Consumes: `FriendRequestOut` from `~/api/friends`
- Props:
  - `incoming`: `FriendRequestOut[]`
  - `outgoing`: `FriendRequestOut[]`
  - `loading`: `boolean`
- Emits:
  - `(e: 'accept', userId: number)`
  - `(e: 'decline', userId: number)`
  - `(e: 'cancel', userId: number)`
  - `(e: 'block', userId: number)`

- [ ] **Step 1: Write the failing tests**
  Create `frontend/tests/components/friend-requests-list.test.ts` verifying:
  - Renders incoming requests section with user info and "Accept", "Decline", and "Block" buttons.
  - Clicking "Accept" emits `accept` with the requester's `id`.
  - Clicking "Decline" emits `decline` with the requester's `id`.
  - Clicking "Block" confirms and emits `block` with the requester's `id`.
  - Renders outgoing requests section with user info and "Cancel Request" button.
  - Clicking "Cancel Request" emits `cancel` with the recipient's `id`.
  - Renders empty state when both incoming and outgoing are empty.

- [ ] **Step 2: Run test to verify it fails**
  Expected: FAIL with component `FriendRequestsList.vue` not found.

- [ ] **Step 3: Implement `FriendRequestsList.vue`**
  Build component with two distinct sections:
  - "Incoming Requests" section (with count badge) and buttons:
    - Accept button (severity `success`)
    - Decline button (severity `secondary`)
    - Block button (outlined `danger`)
  - "Outgoing Requests" section (with count badge) and Cancel button (severity `danger`).
  - Formatted request timestamp (e.g. relative or localized date).

- [ ] **Step 4: Run test to verify it passes**
  Expected: PASS all tests in `tests/components/friend-requests-list.test.ts`.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/app/components/friends/FriendRequestsList.vue frontend/tests/components/friend-requests-list.test.ts
  git commit -m "feat(frontend): implement FriendRequestsList tab component"
  ```

---

### Task 4: User Search Tab Component (`UserSearch.vue`)

**Files:**
- Create: `frontend/app/components/friends/UserSearch.vue`
- Test: `frontend/tests/components/user-search.test.ts`

**Interfaces:**
- Consumes: `UserSearchResultOut`, `RelationshipStatus` from `~/api/friends`, `useAuthStore` from `~/stores/auth`
- Emits:
  - `(e: 'send-request', userId: number)`
  - `(e: 'accept-request', userId: number)`
  - `(e: 'decline-request', userId: number)`
  - `(e: 'cancel-request', userId: number)`
  - `(e: 'unfriend', userId: number)`
  - `(e: 'block', userId: number)`

- [ ] **Step 1: Write the failing tests**
  Create `frontend/tests/components/user-search.test.ts` verifying:
  - Trims input query and disables search when input is whitespace/empty.
  - When user searches their own email (matching `authStore.user.email`), displays self-search alert "This is your email address" and does not emit/call search.
  - Renders result cards for multiple returned users.
  - Renders correct status controls per card:
    - `relationship_status === 'none'`: shows "Send Friend Request" and "Block User" buttons. Emits `send-request` and `block`.
    - `relationship_status === 'friend'`: shows "Friends" tag and "Unfriend" button. Emits `unfriend`.
    - `relationship_status === 'pending_incoming'`: shows "Accept" and "Decline" buttons. Emits `accept-request` and `decline-request`.
    - `relationship_status === 'pending_outgoing'`: shows "Request Sent" disabled tag and "Cancel Request" button. Emits `cancel-request`.
  - Empty results show: "No user found matching '{query}'. Please verify the exact email or username."

- [ ] **Step 2: Run test to verify it fails**
  Expected: FAIL with component `UserSearch.vue` not found.

- [ ] **Step 3: Implement `UserSearch.vue`**
  Build component with:
  - PrimeVue `InputText` and search `Button` with loading indicator.
  - Client-side check against current user's email.
  - Result list rendering `UserSearchResultOut[]` with relationship-aware action buttons.
  - Empty state and error messaging.

- [ ] **Step 4: Run test to verify it passes**
  Expected: PASS all tests in `tests/components/user-search.test.ts`.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/app/components/friends/UserSearch.vue frontend/tests/components/user-search.test.ts
  git commit -m "feat(frontend): implement UserSearch tab component"
  ```

---

### Task 5: Blocked Users Tab Component (`BlockedUsersList.vue`)

**Files:**
- Create: `frontend/app/components/friends/BlockedUsersList.vue`
- Test: `frontend/tests/components/blocked-users-list.test.ts`

**Interfaces:**
- Consumes: `UserOut` from `~/api/friends`
- Props:
  - `blockedUsers`: `UserOut[]`
  - `loading`: `boolean`
- Emits:
  - `(e: 'unblock', userId: number)`

- [ ] **Step 1: Write the failing tests**
  Create `frontend/tests/components/blocked-users-list.test.ts` verifying:
  - Renders skeleton loading when `loading: true`.
  - Renders empty state "No blocked users" when `blockedUsers: []` and `loading: false`.
  - Renders list of blocked users showing display name and email.
  - Clicking "Unblock" emits `unblock` with `userId`.

- [ ] **Step 2: Run test to verify it fails**
  Expected: FAIL with component `BlockedUsersList.vue` not found.

- [ ] **Step 3: Implement `BlockedUsersList.vue`**
  Build component with list/card display for blocked users and unblock button (outlined severity `secondary`).

- [ ] **Step 4: Run test to verify it passes**
  Expected: PASS all tests in `tests/components/blocked-users-list.test.ts`.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/app/components/friends/BlockedUsersList.vue frontend/tests/components/blocked-users-list.test.ts
  git commit -m "feat(frontend): implement BlockedUsersList tab component"
  ```

---

### Task 6: Dedicated Friends Page (`frontend/app/pages/friends.vue`)

**Files:**
- Create: `frontend/app/pages/friends.vue`
- Test: `frontend/tests/pages/friends-page.test.ts`

**Interfaces:**
- Consumes: `friendsApi`, `FriendsList`, `FriendRequestsList`, `UserSearch`, `BlockedUsersList`, PrimeVue `Tabs`, `Toast`, `ConfirmDialog`.

- [ ] **Step 1: Write the failing tests**
  Create `frontend/tests/pages/friends-page.test.ts` verifying:
  - Calls `friendsApi.getFriends()`, `friendsApi.getRequests()`, and `friendsApi.getBlocked()` on mount.
  - Renders PrimeVue `Tabs` with 4 tabs: Friends, Requests (with incoming badge), Add Friend, Blocked (with count badge).
  - Handles `unfriend`: calls `friendsApi.unfriend(id)`, removes user from friends array, triggers toast.
  - Handles `block`: calls `friendsApi.blockUser(id)`, removes user from friends / requests, adds user to blocked array, triggers toast.
  - Handles `accept`: calls `friendsApi.acceptRequest(id)`, removes from incoming requests, adds to friends, triggers toast.
  - Handles `decline`: calls `friendsApi.declineRequest(id)`, removes from incoming requests, triggers toast.
  - Handles `cancel`: calls `friendsApi.cancelRequest(id)`, removes from outgoing requests, triggers toast.
  - Handles `unblock`: calls `friendsApi.unblockUser(id)`, removes from blocked array, triggers toast.

- [ ] **Step 2: Run test to verify it fails**
  Expected: FAIL with page `friends.vue` not found.

- [ ] **Step 3: Implement `frontend/app/pages/friends.vue`**
  Build page container:
  - Uses `definePageMeta({ middleware: 'auth' })` to protect route.
  - PrimeVue `Tabs`, `TabList`, `Tab`, `TabPanels`, `TabPanel`.
  - Coordinates shared reactive state (`friends`, `incomingRequests`, `outgoingRequests`, `blockedUsers`, `loading`).
  - Hooks up all tab events to API calls, state updates, and PrimeVue `useToast` messages.

- [ ] **Step 4: Run test to verify it passes**
  Expected: PASS all tests in `tests/pages/friends-page.test.ts`.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/app/pages/friends.vue frontend/tests/pages/friends-page.test.ts
  git commit -m "feat(frontend): implement dedicated /friends page"
  ```

---

### Task 7: Layout Header Navigation (`frontend/app/layouts/default.vue`)

**Files:**
- Modify: `frontend/app/layouts/default.vue`
- Test: `frontend/tests/components/layout-default.test.ts`

**Interfaces:**
- Consumes: `useAuthStore` from `~/stores/auth`, `friendsApi.getRequests`

- [ ] **Step 1: Write the failing tests**
  Update `frontend/tests/components/layout-default.test.ts` verifying:
  - When authenticated (`authStore.isAuthenticated === true`), renders a navigation link pointing to `/friends`.
  - When unauthenticated, does not render the Friends link.
  - Displays pending request count badge if incoming requests exist.

- [ ] **Step 2: Run test to verify it fails**
  Expected: FAIL with Friends navigation link not present.

- [ ] **Step 3: Implement Friends navigation in `frontend/app/layouts/default.vue`**
  Add a `NuxtLink` to `/friends` with an icon (`pi pi-users`) and optional count badge, styled consistently with the header logo and navigation.

- [ ] **Step 4: Run test to verify it passes**
  Expected: PASS all tests in `tests/components/layout-default.test.ts`.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/app/layouts/default.vue frontend/tests/components/layout-default.test.ts
  git commit -m "feat(frontend): add Friends navigation link to application header"
  ```

# Design Document: Dedicated Friends Page (`/friends`)

- **Author:** Agent Antigravity & User
- **Date:** 2026-11-01
- **Status:** Draft (Pending User Approval)
- **Target Route:** `/friends`
- **Scope:** Frontend feature module

---

## 1. Intent & Context

MeanTime provides personal time management and scheduling. To enable collaborative scheduling, shared calendar views, and availability queries between users, MeanTime requires a dedicated social management interface. 

The backend friending and blocking endpoints were implemented and tested in PR #103 (`feature/102-feature-backend-routes-for-friending-other-users`). This design document details the frontend implementation for the dedicated `/friends` page, its child components, API client, and layout navigation.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- Deliver a dedicated `/friends` route using Nuxt 4, Vue 3, PrimeVue 5, and Tailwind CSS.
- Implement **Approach A (Tabbed View)** featuring 4 tabs:
  1. **Friends**: Confirmed friends list, display names, emails, timezones, and an "Unfriend" confirmation action.
  2. **Requests**: Split view of Incoming requests (with "Accept" and "Decline" actions) and Outgoing requests (with "Cancel" action), plus a count badge on the tab for pending incoming requests.
  3. **Add Friend**: Exact lookup by email or username/display name using `GET /api/users/search?q=...`, rendering a result card with current relationship status and action button ("Add Friend", "Request Sent", "Accept Request", "Friends").
  4. **Blocked**: Blocked users list with an "Unblock" action.
- Build a dedicated frontend API service module `frontend/app/api/friends.ts` utilizing `apiService` from `~/services/ApiService`.
- Add a clear navigation link to `/friends` within the application header (`frontend/app/layouts/default.vue`), visible when authenticated.
- Provide comprehensive UX states: skeleton loading, empty state messages, error handling, and toast feedback (PrimeVue `Toast`).
- Maintain thorough test coverage with Vitest unit tests for the API service and UI components.

### Non-Goals
- Real-time WebSocket pushes for incoming friend requests (standard HTTP fetch on mount / tab switch is sufficient for v1).
- Fuzzy or substring user search (the backend enforces exact case-insensitive matches).
- Complex user profiles or activity feeds.

### Anti-Goals
- Do not clutter the main scheduling/kanban dashboard with friends administration; keep social management cleanly isolated on `/friends`.
- Do not leave action buttons hanging in disabled or loading states without clear error messaging when network requests fail.

---

## 3. Approaches Considered

Three layout architectures were evaluated using interactive visual mockups in the companion browser:

| Approach | Description | Tradeoffs & Evaluation |
| :--- | :--- | :--- |
| **A. Tabbed View (Chosen)** | Top-level tabs for Friends, Requests, Add Friend, and Blocked. | **Selected:** Zero clutter, responsive on all devices, natural fit for PrimeVue `Tabs` component, clean separation of concerns. Requires tab switching between tasks. |
| **B. 2-Column Split Layout** | Sidebar for search and requests; main panel for confirmed friends list. | Simultaneous visibility of incoming requests and friends, but feels congested on laptops/tablets and collapses awkwardly on mobile screens. |
| **C. Stacked Dashboard Sections** | Single scrollable page with top search hero followed by stacked card sections. | Simple linear overview, but leads to excessive vertical scrolling and poor information hierarchy as friend lists grow. |

**Decision:** The user selected **Approach A (Tabbed View)**.

---

## 4. Technical Architecture

### 4.1 Route & File Structure
```
frontend/
├── app/
│   ├── api/
│   │   └── friends.ts              # Social API client service
│   ├── components/
│   │   └── friends/
│   │       ├── FriendsList.vue         # Confirmed friends list tab
│   │       ├── FriendRequestsList.vue  # Incoming & outgoing requests tab
│   │       ├── UserSearch.vue          # Exact user lookup tab
│   │       └── BlockedUsersList.vue    # Blocked users management tab
│   ├── pages/
│   │   └── friends.vue             # Top-level page with PrimeVue Tabs
│   └── layouts/
│       └── default.vue             # Header updated with Friends navigation
└── tests/
    └── unit/
        ├── api/
        │   └── friends.spec.ts     # Tests for API client
        └── components/
            └── friends/            # Tests for friends components
```

### 4.2 API Client Specification (`frontend/app/api/friends.ts`)
The API client wraps `apiService` from `~/services/ApiService`:

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

### 4.3 UI Component Specifications

1. **`friends.vue` (Page Container)**
   - Utilizes PrimeVue `Tabs`, `TabList`, `Tab`, `TabPanels`, `TabPanel`.
   - Four tabs:
     - `Friends` (badge: total friends count)
     - `Requests` (badge: incoming count, colored orange/amber if > 0)
     - `Add Friend`
     - `Blocked` (badge: blocked count if > 0)
   - Coordinates initial data load (`getFriends`, `getRequests`, `getBlocked`) and provides event bus / emit refresh mechanisms across tabs.

2. **`FriendsList.vue`**
   - Displays confirmed friends in a card/list format with avatar fallback (initials), `display_name`, `email`, and `timezone`.
   - Actions per friend:
     - "Unfriend": Triggers a confirmation dialog (`ConfirmDialog` / PrimeVue `Dialog`) to prevent accidental unfriend.
     - "Block": Triggers a safety confirmation dialog warning that blocking removes them from friends and blocks future interaction. On confirmation, calls `friendsApi.blockUser(userId)`, removes them from friends list, updates the Blocked tab count, and shows a success toast.
   - Shows empty state ("No friends yet. Click 'Add Friend' to connect with someone!") when list is empty.

3. **`FriendRequestsList.vue`**
   - Section 1: **Incoming Requests**
     - User card with `display_name`, `email`, and `created_at` timestamp.
     - Actions:
       - "Accept" (primary green/accent button) -> adds to friends, updates Friends tab badge.
       - "Decline" (secondary button) -> dismisses request.
       - "Block" (outlined danger button / menu item) -> cancels request, blocks user, updates Blocked tab badge.
   - Section 2: **Outgoing Requests**
     - User card indicating request pending.
     - Action: "Cancel Request" (outlined danger button).
   - Shows empty state when no incoming or outgoing requests exist.

4. **`UserSearch.vue`**
   - Search input with submit button and clear button.
   - Exact query submission triggers `searchUser(q.trim())`, returning `UserSearchResultOut[]`.
   - Results display:
     - **Found (one or more results)**: Renders a list of result cards (since display names are not unique, multiple users may match). Each card shows `display_name`, `email`, `timezone`, and a contextual button based on `relationship_status`:
       - `none`: "Send Friend Request" button (and an option to Block user).
       - `friend`: "Friends" badge + "Unfriend" option.
       - `pending_incoming`: "Accept Request" & "Decline Request" buttons.
       - `pending_outgoing`: "Request Sent" disabled badge + "Cancel Request" button.
     - **Empty (no results)**: Friendly empty state: "No user found matching '{query}'. Please verify the exact email or username."
     - **Self-Search (Builder call)**: If the query matches the current user's email, displays an alert: "This is your email address." If the query matches the current user's display name, executes the search to find any other users with the same display name, while displaying an informational notice if no other users exist.

5. **`BlockedUsersList.vue`**
   - Lists blocked users with `display_name` and `email`.
   - Action: "Unblock" button with immediate optimistic update.
   - Empty state: "No blocked users."

6. **`default.vue` (Header Integration)**
   - Adds a "Friends" link/button in the top header navigation alongside existing items.
   - Includes a badge for pending incoming requests if authenticated.

---

## 5. Error Handling & Feedback
- Toast notifications via PrimeVue `useToast` for all mutations:
  - Friend request sent: "Friend request sent to {display_name}."
  - Request accepted: "You and {display_name} are now friends!"
  - Request declined / cancelled: "Friend request removed."
  - Unfriended: "Removed {display_name} from your friends."
  - Unblocked: "Unblocked {display_name}."
- Backend error messages (`ErrorDetail.detail`) displayed via Toast error severity.
- Skeletons displayed during asynchronous data fetching to prevent layout shifting.

---

## 6. What's Left to the Builder
- Selection of specific PrimeVue icons (e.g. `pi pi-user-plus`, `pi pi-users`, `pi pi-ban`, `pi pi-check`, `pi pi-times`).
- Exact micro-spacing and border styles matching the Tailwind theme of the existing MeanTime application.
- Implementation of unit test fixtures and mock responses in Vitest.

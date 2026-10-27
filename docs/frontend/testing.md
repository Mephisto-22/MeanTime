# Frontend Testing Guide

MeanTime's frontend testing suite is powered by **Vitest**, **Nuxt test utilities (`@nuxt/test-utils`)**, **Vue Test Utils (`@vue/test-utils`)**, and **`happy-dom`**.

The suite provides fast, deterministic in-memory tests for domain logic, state management, and real component DOM interactions, along with production SSR smoke checks against built Nitro output.

---

## Container-First Execution

MeanTime adheres to a **container-first architecture**. All test commands **must be executed from inside the running Docker container**, not directly on the host machine.

### Why Run Tests Inside the Container?

- **Zero Host Requirements**: Developers do not need `node`, `pnpm`, or build toolchains installed on their host machine.
- **Environment Parity**: Tests run against the exact same runtime (Node 22 on Alpine Linux) used in staging, production, and CI.
- **Platform Consistency**: Windows hosts in particular suffer from file locking, symlink discrepancies, and TCP loopback permission restrictions (`EACCES`). Running inside the container provides seamless POSIX filesystem semantics and Unix domain sockets.
- **Volume Performance**: The container executes against a high-speed Linux Docker volume (`frontend_node_modules`) instead of traversing slow host filesystem translation layers.

---

## Running Tests

Ensure the frontend service is running via Docker Compose from the repository root:

```bash
docker compose up -d frontend
```

### Direct Container Execution (`docker compose exec`)

Run test commands directly from your host terminal using `docker compose exec`:

| Test Command | Purpose | Target Engine | Duration |
| :--- | :--- | :--- | :--- |
| `docker compose exec frontend pnpm test` | Run all in-memory unit, store, and component tests once. | Vitest (`happy-dom`) | < 5 seconds |
| `docker compose exec frontend pnpm test:watch` | Start Vitest in interactive watch mode for TDD. | Vitest (`happy-dom`) | Instant on save |
| `docker compose exec frontend pnpm test:smoke` | Run production SSR smoke check against built output. | Vitest (`node`) | ~ 1–2 seconds |
| `docker compose exec frontend pnpm test:all` | Run complete suite: unit/component tests + smoke check. | Vitest | ~ 5–6 seconds |

> [!NOTE]
> `pnpm test:smoke` and `pnpm test:all` verify the production Nitro bundle. Run `docker compose exec frontend pnpm build` first if `.output/` has not been generated.

### In CI

Every pull request runs `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm test:smoke` in the frontend container, and pull requests into `dev` and `main` can't be merged until they pass. See [Tests in CI](../backend/index.md#tests-in-ci).

### Interactive Container Shell

Alternatively, open an interactive shell inside the frontend container and run tests directly:

```bash
# 1. Open a shell inside the running container
docker compose exec frontend sh

# 2. You are now inside /app within the container:
pnpm test          # Run in-memory unit & component tests
pnpm test:watch    # Interactive watch mode
pnpm test:smoke    # Production smoke tests
pnpm test:all      # Full suite
```

---

## Test Organization & Directory Structure

Tests are organized into functional layers under `frontend/tests/`:

```
frontend/tests/
├── fixtures/                    # Typed domain entity factories
│   ├── index.ts                 # Central export point for all fixtures
│   ├── kanban.ts                # Board, Column, and Task fixture generators
│   └── kanban.test.ts           # Verification suite for fixture generators
├── api/                         # HTTP client, interceptor, and auth routing tests
│   ├── auth-access.test.ts      # Token persistence, auto-refresh, and route protection
│   └── kanban-api.test.ts       # Board, column, and task API client contracts
├── stores/                      # Pinia store state transitions
│   └── auth-store.test.ts       # Auth store login, refresh, session clearing, and computed state
├── components/                  # Real DOM component and mutation tests
│   ├── board.test.ts            # Optimistic task creation, ID reconciliation, and error rollbacks
│   ├── column.test.ts           # Column header count, empty states, and task drag-and-drop
│   ├── task.test.ts             # Task element rendering, drag event disambiguation, and edit trigger
│   └── task-dialog.test.ts      # PrimeVue modal form validation, create/edit modes, delete confirm
└── smoke/                       # Production SSR smoke tests
    └── protected-rendering.smoke.test.ts # Verifies production HTML output across anonymous & auth states
```

---

## Best Practices: Writing High-Quality Tests

1. **Test User-Visible Behavior, Not Implementation Details**: Test rendered DOM nodes, emitted events, user actions, and network boundaries rather than private component methods or internal state variables.
2. **Use Domain Vocabulary & Typed Fixtures**: Always generate mock data using domain fixture factories (`tests/fixtures/`) and ahere to naming conventions: (`Board`, `Column`, `Task`, `Position`, `Title`). Avoid raw object literals with arbitrary schemas.
3. **Partition Fast In-Memory Tests from Production Checks**: Fast unit and component tests execute in seconds in `happy-dom` without launching external processes. Full SSR HTML verification is reserved for `smoke/`.

---

## Using Domain Fixture Factories

Reusable entity factories live in `frontend/tests/fixtures/kanban.ts` and ensure test consistency:

```typescript
import {
  createBoardFixture,
  createColumnFixture,
  createTaskFixture,
} from '~/tests/fixtures'

// Generates a valid task with default 0-indexed position and title
const task = createTaskFixture({
  title: 'Implement feature',
  columnId: 'col-1',
})

// Generates a column containing tasks
const column = createColumnFixture({
  id: 'col-1',
  title: 'In Progress',
  tasks: [task],
})

// Generates a complete board with populated columns
const board = createBoardFixture({
  id: 'board-1',
  title: 'Sprint Roadmap',
  columns: [column],
})
```

---

## Writing API Client & Service Tests

API tests live in `frontend/tests/api/`. In Nuxt 4, auto-imported `$fetch` compiles via `#build/fetch.mjs`. Mock `#build/fetch.mjs` with `vi.mock` to verify request contracts:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiService } from '~/services/ApiService'

const mockFetch = vi.fn()

vi.mock('#build/fetch.mjs', () => ({
  $fetch: (...args: any[]) => mockFetch(...args),
}))

describe('ApiService contracts', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('serializes payload and attaches Authorization header', async () => {
    mockFetch.mockResolvedValue({ id: 1, title: 'New Board' })

    const api = new ApiService()
    api.setAuthHandler({
      getAccessToken: () => 'sample-token',
      async refresh() {},
      async expireSession() {},
    })

    const result = await api.post('/api/kanban/boards', { title: 'New Board' })

    expect(result).toEqual({ id: 1, title: 'New Board' })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/kanban/boards',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sample-token',
          'Content-Type': 'application/json',
        }),
        body: { title: 'New Board' },
      }),
    )
  })
})
```

---

## Writing Pinia Store Tests

Store tests live in `frontend/tests/stores/`. Initialize an active Pinia instance before each test using `setActivePinia(createPinia())`:

```typescript
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '~/api/auth'
import { useAuthStore } from '~/stores/auth'

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('logs in and persists session tokens', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue({
      access_token: 'acc-123',
      refresh_token: 'ref-123',
      token_type: 'Bearer',
      expires_in: 3600,
    })
    vi.spyOn(authApi, 'me').mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      display_name: 'Test User',
      timezone: 'UTC',
      created_at: '2026-10-24T00:00:00Z',
    })

    const store = useAuthStore()
    await store.login({ email: 'user@example.com', password: 'password' })

    expect(store.isAuthenticated).toBe(true)
    expect(store.accessToken).toBe('acc-123')
  })
})
```

---

## Writing Component Tests with `@vue/test-utils`

Component DOM tests live in `frontend/tests/components/`.

### Mounting PrimeVue Components & Handling Dialog Portals

PrimeVue components require the `PrimeVue` plugin. For teleported modals like `<Dialog>` (which attach to `document.body`), define a lightweight inline stub so that child form controls remain directly queryable inside the test wrapper DOM:

```typescript
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it } from 'vitest'
import TaskDialog from '~/components/kanban/TaskDialog.vue'

const DialogStub = {
  name: 'Dialog',
  props: ['visible', 'header'],
  template: '<div v-if="visible" data-testid="task-dialog" :data-header="header"><slot /></div>',
}

describe('TaskDialog', () => {
  it('validates non-empty title before emitting save', async () => {
    const wrapper = mount(TaskDialog, {
      props: { visible: true, mode: 'create', columnId: 'col-1' },
      global: {
        plugins: [PrimeVue],
        stubs: { Dialog: DialogStub },
      },
    })

    const titleInput = wrapper.find<HTMLInputElement>('[data-testid="task-title-input"]')
    const saveButton = wrapper.find('[data-testid="task-save-button"]')

    // Disabled when empty
    expect(saveButton.attributes('disabled')).toBeDefined()

    // Enabled after typing title
    await titleInput.setValue('Deploy Vitest')
    expect(saveButton.attributes('disabled')).toBeUndefined()

    // Emits save payload
    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.emitted('save')?.[0][0]).toMatchObject({
      title: 'Deploy Vitest',
      mode: 'create',
      columnId: 'col-1',
    })
  })
})
```

### Testing Optimistic Mutations & Error Rollbacks

Verify that component-managed state updates immediately upon user actions and cleanly reverts to the original state when an API call fails:

```typescript
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it, vi } from 'vitest'
import { kanbanApi } from '~/api/kanban'
import Board from '~/components/kanban/Board.vue'
import { createBoardFixture, createColumnFixture } from '~/tests/fixtures'

describe('Board Optimistic Updates', () => {
  it('rolls back optimistic task creation when backend rejects the request', async () => {
    const boardData = createBoardFixture({
      columns: [createColumnFixture({ id: 'col-1', tasks: [] })],
    })

    vi.spyOn(kanbanApi, 'createTask').mockRejectedValue(new Error('Network error'))

    const wrapper = mount(Board, {
      props: { board: boardData },
      global: { plugins: [PrimeVue] },
    })
    const vm = wrapper.vm as any

    await vm.handleSaveTask({
      title: 'Failed Task',
      mode: 'create',
      columnId: 'col-1',
    })

    // Optimistic task was removed
    expect(vm.localColumns[0].tasks).toHaveLength(0)
    // Error notification message is surfaced to the user
    expect(vm.errorMessage).toContain('Network error')
  })
})
```

# MeanTime Frontend Service

Containerized Vue 3 / Nuxt 4 application styled with PrimeVue 5 (Aura preset), Tailwind CSS, and Pinia state management.

---

## Architecture & Tech Stack

- **Framework**: [Nuxt 4](https://nuxt.com/) (`^4.5.2`) running on Node 22 (Alpine) with `pnpm`.
- **State Management**: [Pinia](https://pinia.vuejs.org/) via [`@pinia/nuxt`](https://pinia.vuejs.org/ssr/nuxt.html) for reactive, modular stores with DevTools support and SSR hydration.
- **UI Components**: [PrimeVue 5](https://primevue.org/) (`^5.0.2`) with Aura theme preset (`@primeuix/themes`).
- **Icons**: [PrimeIcons](https://primevue.org/icons/) (`^8.0.2`).
- **Utility Styling**: [Tailwind CSS](https://tailwindcss.com/) (`~3.4.17`) and `tailwindcss-primeui` (`^0.6.1`).
- **CSS Layering**: Explicit CSS layer ordering (`tailwind-base, primevue, tailwind-utilities`) defined in `app/assets/css/main.css` preventing style conflicts between Tailwind's preflight reset and PrimeVue components.
- **API Proxy**: Nuxt Nitro engine proxies all `/api/**` traffic internally to the Django backend (`http://backend:8000/api/**`), allowing client and server to call relative endpoints without CORS configuration.
- **Centralized HTTP Client**: [`ApiService`](app/services/ApiService.ts) in `app/services/` encapsulates HTTP requests (`get`, `post`, `put`, `patch`, `delete`), query serialization, payload parsing, and error normalization around `$fetch`.
- **Domain API Layer**: Feature-specific endpoints and typed contracts are organized in `app/api/` (e.g., [`health.ts`](app/api/health.ts)) and consume `apiService`.
- **File Watching & HMR**: Vite watcher configured with polling enabled (`usePolling: true`) for instant hot module replacement across Windows host filesystem mounts.
- **High-Performance Volume & Host IDE Synchronization**: Container uses a dedicated named Docker volume (`frontend_node_modules`) for lightning-fast Linux ext4 package access, resolving Windows bind-mount I/O bottlenecks. The container automatically synchronizes installed packages and types to the host's `./frontend/node_modules` via hash-gated `rsync` on startup, providing full host IDE IntelliSense and autocompletion without requiring `pnpm` or `node` on the host.

---

## Directory Structure

```
frontend/
├── app/
│   ├── api/                     # Domain API service modules (endpoints & interfaces)
│   │   ├── health.ts            # Health check API service using ApiService
│   │   └── index.ts             # Central export point for all domain API services
│   ├── assets/
│   │   └── css/
│   │       └── main.css         # CSS layers definition for Tailwind & PrimeVue
│   ├── components/
│   │   └── AppCard.vue          # Reusable component demonstrating PrimeVue + Tailwind
│   ├── composables/
│   │   └── useTheme.ts          # Shared UI composables (theme toggling, etc.)
│   ├── layouts/
│   │   └── default.vue          # Application shell layout (header, footer, navigation)
│   ├── pages/
│   │   └── index.vue            # Interactive homepage showcasing PrimeVue & Tailwind
│   ├── services/                # Centralized network and infrastructure services
│   │   ├── ApiService.ts        # Base HTTP service (get, post, put, patch, delete, error parsing)
│   │   └── index.ts             # Services export point
│   ├── stores/                  # Pinia state management stores (auto-imported)
│   │   └── .gitkeep
│   └── app.vue                  # Root Vue application shell
├── docker/
│   ├── Dockerfile               # Production-grade Node 22 Alpine build definition
│   └── entrypoint.sh            # Container initialization and dependency verification script
├── .dockerignore                # Container build ignore rules
├── .npmrc                       # Hoisted package configuration
├── nuxt.config.ts               # Nuxt, Nitro proxy, PrimeVue, Pinia, and Tailwind configuration
├── package.json                 # Dependency manifest
├── pnpm-lock.yaml               # Pnpm dependency lockfile
├── pnpm-workspace.yaml          # Pnpm security and build configuration
├── README.md                    # This documentation
├── tailwind.config.ts           # Tailwind CSS theme extension & PrimeUI plugin
└── tsconfig.json                # TypeScript compiler configuration extending Nuxt
```

---

## Developer Guide: Where to Add Code

Nuxt 4 uses file-system conventions inside the `app/` directory. If you are new to Nuxt or modern web development, here is where your code should go and how each piece fits together:

### 1. Adding Pages & Routes (`app/pages/`)

Nuxt uses **file-based routing**. Every `.vue` file in `app/pages/` automatically maps to a web route:

- `app/pages/index.vue` → maps to `/`
- `app/pages/about.vue` → maps to `/about`
- `app/pages/tasks/index.vue` → maps to `/tasks`
- `app/pages/tasks/[id].vue` → maps to dynamic route `/tasks/:id`

#### Example: Creating a new page (`app/pages/tasks/index.vue`)
```vue
<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <h1 class="text-3xl font-bold tracking-tight mb-6">Tasks</h1>
    <Button label="New Task" icon="pi pi-plus" @click="openDialog" />
  </div>
</template>

<script setup lang="ts">
// Page logic runs here using Vue 3 Composition API (<script setup>)
function openDialog() {
  console.log('Open task modal')
}
</script>
```

To navigate between pages, use Nuxt's built-in `<NuxtLink>` component:
```vue
<NuxtLink to="/tasks" class="text-primary hover:underline">Go to Tasks</NuxtLink>
```

---

### 2. Adding Components (`app/components/`)

Reusable UI elements (cards, task items, dialogs, form controls) go into `app/components/`.

- **Auto-importing**: Nuxt automatically imports any component placed in `app/components/`. You **do not** need to manually `import TaskItem from '~/components/TaskItem.vue'`—simply use `<TaskItem />` in your template!
- **Namespacing with subdirectories**: A component at `app/components/kanban/Board.vue` is automatically available as `<KanbanBoard />`.

#### Example: Creating a reusable component (`app/components/TaskCard.vue`)
```vue
<template>
  <Card class="shadow-sm hover:shadow-md transition-shadow">
    <template #title>
      <div class="flex items-center justify-between">
        <span class="text-base font-semibold">{{ title }}</span>
        <Tag :value="status" :severity="statusSeverity" />
      </div>
    </template>
    <template #content>
      <p class="text-sm text-surface-600 dark:text-surface-400">{{ description }}</p>
    </template>
  </Card>
</template>

<script setup lang="ts">
interface Props {
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done'
}

const props = defineProps<Props>()

const statusSeverity = computed(() => {
  switch (props.status) {
    case 'done': return 'success'
    case 'in_progress': return 'warn'
    default: return 'secondary'
  }
})
</script>
```

---

### 3. API Communication Architecture: `ApiService.ts` and `app/api/`

Frontend network communication is divided into two distinct layers:
1. **The Infrastructure Layer (`app/services/ApiService.ts`)**: Encapsulates the base HTTP client, method dispatching, and error parsing.
2. **The Domain API Layer (`app/api/`)**: Feature-specific API classes that define endpoints and data types, utilizing `apiService`.

#### How API Routing Works (Nitro Proxy)
Nuxt's internal Nitro engine proxies any request starting with `/api/**` to the Django backend container (`http://backend:8000/api/**`). This means:
- **Always use relative paths**: Call endpoints like `/api/tasks`, never hardcode `http://localhost:8000` or `http://backend:8000`.
- **Zero CORS issues**: The browser sends requests to `http://localhost:3000/api/...`, which shares the frontend domain.

#### Centralized HTTP Client: [`app/services/ApiService.ts`](app/services/ApiService.ts)
`ApiService` provides:
- Methods: `get<T>()`, `post<T>()`, `put<T>()`, `delete<T>()`.
- Default JSON headers and automatic query parameter formatting.
- Centralized error normalization: catches HTTP errors from `$fetch` and extracts messages into typed `ApiError` instances.

#### Creating a Domain API Service (e.g. `TaskApi` in `app/api/tasks.ts`)

1. Define the service in `app/api/tasks.ts`:

```typescript
// app/api/tasks.ts
import { apiService } from '~/services/ApiService'

export interface Task {
  id: number
  title: string
  description?: string
  is_completed: boolean
  created_at: string
}

export interface CreateTaskPayload {
  title: string
  description?: string
  is_completed?: boolean
}

export class TaskApi {
  readonly endpoint = '/api/tasks'

  /** Fetch all tasks */
  list(): Promise<Task[]> {
    return apiService.get<Task[]>(this.endpoint)
  }

  /** Create a new task */
  create(payload: CreateTaskPayload): Promise<Task> {
    return apiService.post<Task>(this.endpoint, payload)
  }

  /** Retrieve a single task by ID */
  get(id: number): Promise<Task> {
    return apiService.get<Task>(`${this.endpoint}/${id}`)
  }

  /** Delete a task by ID */
  delete(id: number): Promise<void> {
    return apiService.delete(`${this.endpoint}/${id}`)
  }

  /** Trigger a custom non-CRUD action */
  customAction(): Promise<{ message: string }> {
    return apiService.post<{ message: string }>(`${this.endpoint}/custom-route`)
  }
}

export const taskApi = new TaskApi()
```

2. Export from `app/api/index.ts`:

```typescript
// app/api/index.ts
export * from './health'
export * from './tasks'
```

3. Calling APIs in Components:

- **For User Actions & Events** (button clicks, form submissions, deletions):  
  Call the API method directly with `await`—no complex wrappers needed!
  ```typescript
  async function handleCreateTask() {
    try {
      const newTask = await taskApi.create({ title: 'New Task' })
      // Update local state or Pinia store
    } catch (error) {
      console.error('Failed to create task:', error)
    }
  }
  ```

- **For Initial Page Load / SSR Hydration**:  
  Use Nuxt's `useAsyncData` to cache server-rendered data and prevent client-side double-fetching:
  ```vue
  <script setup lang="ts">
  import { taskApi, type Task } from '~/api'

  const { data: tasks, status, error, refresh } = await useAsyncData<Task[]>(
    'tasks-list',
    () => taskApi.list(),
  )
  </script>
  ```

---

### 4. Adding Layouts (`app/layouts/`)

Layouts wrap pages with shared UI structures like headers, navigation bars, and footers.
- `app/layouts/default.vue`: Applied to all pages by default unless overridden.
- Layouts must contain a `<slot />` tag where page content is rendered.
- To use a custom layout (e.g. `app/layouts/auth.vue`), add `definePageMeta({ layout: 'auth' })` to the page.

---

### 5. State Management with Pinia Stores (`app/stores/`)

MeanTime uses **[Pinia](https://pinia.vuejs.org/)** for application state management via `@pinia/nuxt`.

- **Auto-importing**: Stores placed in `app/stores/` are **automatically imported** across your Nuxt application. You do not need to manually import store functions.
- **Setup Stores**: We recommend the Vue 3 Composition API store syntax (`defineStore('name', () => { ... })`).

#### Example: Defining a Store (`app/stores/useTasksStore.ts`)
```typescript
// app/stores/useTasksStore.ts
import { defineStore } from 'pinia'
import type { Task } from '~/api'

export const useTasksStore = defineStore('tasks', () => {
  // State
  const tasks = ref<Task[]>([])
  const selectedTaskId = ref<number | null>(null)

  // Getters (computed)
  const completedTasks = computed(() => tasks.value.filter((t) => t.is_completed))
  const pendingTasks = computed(() => tasks.value.filter((t) => !t.is_completed))

  // Actions
  function setTasks(newTasks: Task[]) {
    tasks.value = newTasks
  }

  function addTask(task: Task) {
    tasks.value.push(task)
  }

  function selectTask(id: number | null) {
    selectedTaskId.value = id
  }

  return {
    tasks,
    selectedTaskId,
    completedTasks,
    pendingTasks,
    setTasks,
    addTask,
    selectTask,
  }
})
```

#### Using the Store in a Component:
```vue
<template>
  <div>
    <p>Pending Tasks: {{ tasksStore.pendingTasks.length }}</p>
    <ul>
      <li v-for="task in tasksStore.tasks" :key="task.id">
        {{ task.title }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
// Automatically imported!
const tasksStore = useTasksStore()
</script>
```

---

### 6. Working with PrimeVue 5 & Tailwind CSS

MeanTime is configured with **PrimeVue 5** (Aura preset) and **Tailwind CSS 3.4**:

- **Auto-imported Components**: All PrimeVue components (e.g., `<Button>`, `<Card>`, `<Dialog>`, `<InputText>`, `<Tag>`, `<DataTable>`, `<Column>`) are auto-imported.
- **Component Styling**: Combine PrimeVue's semantic props with Tailwind utility classes:
  ```vue
  <Button
    label="Save Changes"
    icon="pi pi-check"
    severity="primary"
    class="shadow-sm hover:shadow"
  />
  ```
- **PrimeIcons**: Use the `pi` prefix: `<i class="pi pi-check" />` or pass icon strings to PrimeVue component `icon` props (e.g., `:icon="'pi pi-trash'"`).
- **CSS Layers**: If writing custom global CSS, always respect the layer ordering in `app/assets/css/main.css`:
  ```css
  @layer tailwind-base, primevue, tailwind-utilities;
  ```

---

## Running Locally

### Password reset

Login links to `/forgot-password`; the reset link opens the public `/reset-password`
page. Forms call `AuthApi` to request, validate, and confirm a reset. With backend
debug enabled, reset links print in backend container logs. Mailgun and inbox
delivery are deferred. See [the reset guide](../docs/password-reset.md) for setup,
database changes, endpoint contracts, and manual tests.

### Authentication frontend

- `/login` submits email/password, stores tokens, fetches the authenticated profile from `/api/auth/me`, and navigates to the requested protected page (or home) only after that succeeds.
- `/register` submits `display_name`, email, and password (optional `timezone`, default UTC), then redirects to login.
- `app/api/auth.ts` matches `backend/users/schemas.py`: login returns `access_token`, `refresh_token`, `token_type`, and `expires_in`; registration and `/me` return `UserOut`. The frontend does not rely on the backend's current extra login `user` field.
- `app/stores/auth.ts` exports `useAuthStore`, `User`, and `AuthState`. Only access and refresh tokens persist under `meantime.auth`. User details and `isAuthenticated` are never stored locally. Old saved profiles are discarded on restoration.
- Client navigation waits for session restoration and a `/me` check. A 401 triggers `/refresh` with `refresh_token`, persists the new access token, and retries once. Concurrent refreshes share one request. Rejected or malformed refresh credentials clear the session and redirect to login; network/server outages preserve tokens for retry.
- Pages are protected by default through `app/middleware/auth.global.ts`; add `definePageMeta({ public: true })` for public pages. Login and registration are public. Protected content uses `ClientOnly` and waits for a validated session, so server HTML never contains protected page content. API endpoints still enforce authorization on the backend.
- `ApiService` attaches the current bearer token to relative `/api/` requests, refreshes on 401, and retries once. Public endpoints use `{ auth: false }`; authentication routes opt out to avoid recursive refresh. A second 401 ends the session; a normal 403 permission error does not trigger refresh.
- `setUser` stores profiles in memory; `clearTokens` removes the whole session. Only tokens are persisted, never the user or initialization state.
- Run `pnpm typecheck` and `node --test tests/*.test.cjs` inside the frontend container. After `pnpm build`, run `node tests/protected-rendering.smoke.cjs` to check production HTML.

Manual checks with the backend running:

1. Open `/` without stored tokens: it should redirect to login without showing the protected page.
2. Log in, then reload `/`: the store should restore tokens, fetch `/me`, and show the page.
3. Replace only the saved access token with an expired token and reload: `/refresh` should update the access token in storage, then `/me` should succeed.
4. Invalidate both saved tokens and reload: storage should be cleared and login should appear. Login and registration must remain accessible.
5. For other protected API calls, inspect the bearer header and verify a 401 causes one refresh and one retry. Disconnecting the network should surface the request error without deleting valid credentials.

Run via Docker Compose at the project root:

```bash
docker compose up frontend --build
```

The application will be accessible at: `http://localhost:3000`.

---

## Zero-Install Host IDE Autocompletion & Package Management

No host-level installations of `node`, `pnpm`, or `npm` are required on your developer machine:

- **High-Performance Container Runtime**: The container runs against a dedicated named Docker volume (`frontend_node_modules:/app/node_modules`), allowing Vite, Nuxt, and Rollup to operate directly on native Linux ext4 filesystem speeds rather than traversing the slow Windows host mount (`9P`/`virtiofs`).
- **Automated Host Synchronization**: The host directory `./frontend/node_modules` is mounted to `/host_node_modules` in the container. The container's startup script (`entrypoint.sh`) checks a SHA256 checksum of the dependency manifests (`package.json`, `pnpm-lock.yaml`, etc.):
  - **Instant Restarts**: If the hash matches and the host directory is populated, `entrypoint.sh` starts Nuxt immediately in ~1–2 seconds with zero file operations.
  - **Automated Updates**: If a package is added, removed, or updated, or upon a fresh clone, the container installs dependencies into the internal volume, synchronizes the changes to `./frontend/node_modules` via `rsync -a --delete`, and regenerates Nuxt types.
- **Host IDE Support**: Your host IDE (VS Code, WebStorm, Cursor) automatically reads the host's `./frontend/node_modules` and `.nuxt/` directories for complete TypeScript intellisense, Vue component resolution, Pinia store types, and auto-import support.

### Adding or Updating Dependencies

To add or update frontend dependencies, use either of the following approaches:

1. **Option 1 (Recommended — Zero Host Tools)**:  
   Edit `frontend/package.json` directly in your host IDE, then restart the frontend container:
   ```bash
   docker compose restart frontend
   # or:
   docker compose up -d
   ```
   The container entrypoint will detect the manifest change, install the new dependency into the volume, update `pnpm-lock.yaml`, sync to your host `node_modules`, and regenerate `.nuxt` types.

2. **Option 2 (Via Docker Exec)**:  
   Run `pnpm add` directly inside the running container:
   ```bash
   docker compose exec frontend pnpm add <package-name>
   ```
   Followed by restarting the container to sync the new package to the host filesystem:
   ```bash
   docker compose restart frontend
   ```

> [!CAUTION]
> **Do not run `pnpm install` or `npm install` on the Windows host machine**: Running package managers on the host is unnecessary and risks introducing platform-specific Windows binaries or breaking Docker symlinks. All dependency management is handled automatically within Docker.

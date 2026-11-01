# Frontend Developer Guide

See [Notifications and required fields](notifications.md) for toast usage,
error formatting, form-validation conventions, and verification.

See [Live registration password requirements](password-requirements.md) for the
password checklist, confirmation behavior, API contract, and verification.

The MeanTime frontend is a reactive, containerized **Nuxt 4 / Vue 3** Single Page Application styled with **PrimeVue 5** (Aura preset) and **Tailwind CSS**, managed via **Pinia** state stores.

---

## Tech Stack Overview

- **Framework**: [Nuxt 4](https://nuxt.com/) (`^4.5.2`) running on Node 22 (Alpine) with `pnpm`.
- **UI Components**: [PrimeVue 5](https://primevue.org/) (`^5.0.2`) with Aura theme preset (`@primeuix/themes`).
- **Utility Styling**: [Tailwind CSS](https://tailwindcss.com/) (`~3.4.17`) and `tailwindcss-primeui` (`^0.6.1`).
- **Icons**: [PrimeIcons](https://primevue.org/icons/) (`^8.0.2`).
- **State Management**: [Pinia](https://pinia.vuejs.org/) via [`@pinia/nuxt`](https://pinia.vuejs.org/ssr/nuxt.html) with auto-imports and SSR hydration support.
- **Client Networking**: Centralized [`ApiService`](#centralized-api-client) wrapping Nuxt's `$fetch`.

---

## Directory Structure

```
frontend/
├── app/
│   ├── api/                     # Domain API services & typed interfaces
│   │   ├── health.ts            # Example endpoint contract
│   │   └── index.ts             # Central export point for domain APIs
│   ├── assets/
│   │   └── css/
│   │       └── main.css         # CSS layers definition for Tailwind & PrimeVue
│   ├── components/              # Auto-imported Vue components
│   ├── composables/             # Auto-imported composables (e.g. useTheme)
│   ├── layouts/                 # Page layouts (e.g. default.vue)
│   ├── pages/                   # File-based routing pages
│   ├── services/                # Infrastructure clients
│   │   ├── ApiService.ts        # Base HTTP service ($fetch wrapper)
│   │   └── index.ts             # Central export point
│   ├── stores/                  # Pinia state management stores
│   └── app.vue                  # Root application shell
├── docker/                      # Container definitions
├── nuxt.config.ts               # Nuxt & plugin configuration
├── package.json                 # Dependency manifest
└── tailwind.config.ts           # Tailwind CSS configuration
```

---

## Key Frontend Architecture Patterns

### 1. CSS Layer Ordering
To prevent Tailwind's base reset styles from overriding PrimeVue component styles, an explicit CSS layer order is configured in `app/assets/css/main.css`:

```css
@layer tailwind-base, primevue, tailwind-utilities;

@layer tailwind-base {
  @tailwind base;
}

@layer tailwind-utilities {
  @tailwind components;
  @tailwind utilities;
}
```

This guarantees PrimeVue components render with proper borders, shadows, and default paddings, while allowing Tailwind utilities (`class="flex gap-4 p-4"`) to apply correctly.

---

### 2. Centralized API Client (`ApiService`)

Network requests are channeled through `app/services/ApiService.ts`:

- Encapsulates `$fetch` methods (`get`, `post`, `put`, `patch`, `delete`).
- Auto-extracts HTTP error payloads and normalizes exceptions into typed `ApiError` instances.
- Handles query string serialization and standard header configurations.

```typescript
import { apiService } from '~/services'

// Making a typed API call
const boards = await apiService.get<Board[]>('/api/boards/')
```

---

### 3. Domain API Layer

Feature modules create typed endpoint definitions in `app/api/` that consume `apiService`:

```typescript
// app/api/boards.ts
import { apiService } from '~/services'

export interface Board {
  id: number
  title: string
  created_at: string
}

export interface CreateBoardDto {
  title: string
}

export const boardsApi = {
  getAll: () => apiService.get<Board[]>('/api/boards/'),
  getById: (id: number) => apiService.get<Board>(`/api/boards/${id}/`),
  create: (data: CreateBoardDto) => apiService.post<Board>('/api/boards/', data),
}
```

---

### 4. Pinia State Management

Pinia stores in `app/stores/` are auto-imported across components:

```typescript
// app/stores/boards.ts
import { defineStore } from 'pinia'
import { boardsApi, type Board } from '~/api'

export const useBoardsStore = defineStore('boards', {
  state: () => ({
    boards: [] as Board[],
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async fetchBoards() {
      this.loading = true
      try {
        this.boards = await boardsApi.getAll()
      } catch (err: any) {
        this.error = err.message
      } finally {
        this.loading = false
      }
    },
  },
})
```

---

## Adding a New Page

1. Create a Vue file inside `app/pages/` (e.g. `app/pages/boards.vue` maps to `/boards`).
2. Consume components, composables, and stores without manual import statements:

```vue
<template>
  <div class="p-6">
    <h1 class="text-2xl font-bold mb-4">Boards</h1>
    <div v-if="boardsStore.loading" class="text-gray-500">Loading boards...</div>
    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card v-for="board in boardsStore.boards" :key="board.id">
        <template #title>{{ board.title }}</template>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
const boardsStore = useBoardsStore()

onMounted(() => {
  boardsStore.fetchBoards()
})
</script>
```


---

## Testing

For testing practices, domain fixture factories, Vitest execution in Docker, and component DOM testing guides, see the [Frontend Testing Guide](testing.md).

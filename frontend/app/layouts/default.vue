<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b border-surface-200 bg-surface-0 px-6 py-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div class="mx-auto flex max-w-7xl items-center justify-between">
        <div class="flex items-center gap-3">
          <i class="pi pi-clock text-2xl text-primary" />
          <span class="text-xl font-bold tracking-tight">MeanTime</span>
        </div>
        <div class="flex items-center gap-4">
          <Tag value="v0.1.0-dev" severity="info" />

          <template v-if="authStore.isAuthenticated">
            <NuxtLink
              to="/friends"
              data-testid="friends-nav-link"
              class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100 hover:text-primary dark:text-surface-200 dark:hover:bg-surface-800"
            >
              <i class="pi pi-users" />
              <span>Friends</span>
              <Badge
                v-if="pendingIncomingCount > 0"
                :value="pendingIncomingCount"
                severity="warn"
                data-testid="friends-pending-badge"
              />
            </NuxtLink>

            <Button
              data-testid="user-profile-button"
              :label="authStore.user?.display_name || 'Profile'"
              icon="pi pi-user"
              text
              severity="secondary"
              size="small"
            />
          </template>
        </div>
      </div>
    </header>
    <main class="flex-1">
      <slot />
    </main>
    <footer class="border-t border-surface-200 bg-surface-0 px-6 py-4 text-center text-sm text-surface-500 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-400">
      MeanTime &copy; 2026 - Containerized Development Environment
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import Badge from 'primevue/badge'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { friendsApi } from '~/api/friends'
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()
const pendingIncomingCount = ref(0)

const fetchPendingRequests = async () => {
  if (!authStore.isAuthenticated) {
    pendingIncomingCount.value = 0
    return
  }
  try {
    const res = await friendsApi.getRequests()
    pendingIncomingCount.value = res?.incoming?.length || 0
  } catch (err) {
    console.error('Failed to fetch friend requests in header:', err)
  }
}


onMounted(() => {
  if (authStore.isAuthenticated) {
    fetchPendingRequests()
  }
})

watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      fetchPendingRequests()
    } else {
      pendingIncomingCount.value = 0
    }
  }
)
</script>

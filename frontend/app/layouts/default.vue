<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b border-surface-200 bg-surface-0 px-6 py-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div class="mx-auto flex max-w-7xl items-center justify-between">
        <!-- Left: Static Brand Presentation & Primary Nav Cluster -->
        <div class="flex items-center gap-8">
          <div class="flex items-center gap-3">
            <i class="pi pi-clock text-2xl text-primary" />
            <span class="text-xl font-bold tracking-tight text-surface-900 dark:text-surface-0">MeanTime</span>
          </div>

          <nav v-if="authStore.isAuthenticated" class="flex items-center gap-2">
            <NuxtLink
              to="/"
              data-testid="boards-nav-link"
              :aria-current="isBoardsActive ? 'page' : undefined"
              class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              :class="[
                isBoardsActive
                  ? 'bg-surface-100 text-primary dark:bg-surface-800 dark:text-primary-400 font-semibold'
                  : 'text-surface-700 hover:bg-surface-100 hover:text-primary dark:text-surface-200 dark:hover:bg-surface-800'
              ]"
            >
              <i class="pi pi-th-large" />
              <span>Boards</span>
            </NuxtLink>

            <NuxtLink
              to="/friends"
              data-testid="friends-nav-link"
              :aria-current="isFriendsActive ? 'page' : undefined"
              class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              :class="[
                isFriendsActive
                  ? 'bg-surface-100 text-primary dark:bg-surface-800 dark:text-primary-400 font-semibold'
                  : 'text-surface-700 hover:bg-surface-100 hover:text-primary dark:text-surface-200 dark:hover:bg-surface-800'
              ]"
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
          </nav>
        </div>

        <!-- Right Utility Cluster: Profile, then Log out -->
        <div v-if="authStore.isAuthenticated || authStore.loggingOut" class="flex items-center gap-3">
          <Button
            v-if="authStore.isAuthenticated && authStore.user"
            data-testid="user-profile-button"
            :label="authStore.user.display_name || 'Profile'"
            icon="pi pi-user"
            text
            severity="secondary"
            size="small"
            @click="goToProfile"
          />

          <Button
            data-testid="logout-button"
            label="Log out"
            icon="pi pi-sign-out"
            severity="secondary"
            :loading="authStore.loggingOut"
            :disabled="authStore.loggingOut"
            @click="authStore.logout()"
          />
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
import { computed, onMounted, ref, watch } from 'vue'
import Badge from 'primevue/badge'
import Button from 'primevue/button'
import { friendsApi } from '~/api/friends'
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()
const route = useRoute()
const pendingIncomingCount = ref(0)

const isBoardsActive = computed(() => route.path === '/' || route.path.startsWith('/boards'))
const isFriendsActive = computed(() => route.path.startsWith('/friends'))

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

function goToProfile() {
  const userId = authStore.user?.id
  if (userId) {
    navigateTo(`/users/${userId}`)
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

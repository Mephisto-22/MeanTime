<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b border-surface bg-[var(--p-content-background)] px-6 py-3.5 shadow-sm">
      <div class="mx-auto max-w-7xl">
        <Menubar :model="menuItems" class="border-none bg-transparent p-0 gap-6">
          <template #start>
            <NuxtLink
              to="/"
              data-testid="brand-link"
              class="flex items-center gap-3 no-underline"
              aria-label="MeanTime Home"
            >
              <i class="pi pi-clock text-2xl text-primary" />
              <span class="text-xl font-bold tracking-tight text-[var(--p-text-color)]">MeanTime</span>
            </NuxtLink>
          </template>

          <template #item="{ item }">
            <NuxtLink
              :to="item.route"
              :data-testid="item.testId"
              :aria-current="item.active ? 'page' : undefined"
              class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              :class="[
                item.active
                  ? 'bg-surface-100 text-primary dark:bg-surface-800 font-semibold'
                  : 'text-surface-700 dark:text-surface-300'
              ]"
            >
              <i :class="item.icon" />
              <span>{{ item.label }}</span>
              <Badge
                v-if="item.badge"
                :value="item.badge"
                severity="warn"
                :data-testid="item.badgeTestId"
              />
            </NuxtLink>
          </template>

          <template #end>
            <div v-if="authStore.isAuthenticated || authStore.loggingOut" class="flex items-center gap-3">
              <Button
                v-if="authStore.isAuthenticated && authStore.user"
                data-testid="user-profile-button"
                :label="authStore.user.display_name || 'Profile'"
                icon="pi pi-user"
                text
                severity="secondary"
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
          </template>
        </Menubar>
      </div>
    </header>
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Badge from 'primevue/badge'
import Button from 'primevue/button'
import Menubar from 'primevue/menubar'
import { friendsApi } from '~/api/friends'
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()
const route = useRoute()
const pendingIncomingCount = ref(0)

const isBoardsActive = computed(
  () => route.path === '/' || route.path === '/boards' || route.path.startsWith('/boards/')
)
const isFriendsActive = computed(
  () => route.path === '/friends' || route.path.startsWith('/friends/')
)

const menuItems = computed(() => {
  if (!authStore.isAuthenticated) return []
  return [
    {
      label: 'Boards',
      icon: 'pi pi-th-large',
      route: '/',
      active: isBoardsActive.value,
      testId: 'boards-nav-link',
    },
    {
      label: 'Friends',
      icon: 'pi pi-users',
      route: '/friends',
      active: isFriendsActive.value,
      testId: 'friends-nav-link',
      badge: pendingIncomingCount.value > 0 ? pendingIncomingCount.value : undefined,
      badgeTestId: 'friends-pending-badge',
    },
  ]
})

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

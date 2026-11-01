<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b border-surface-200 bg-surface-0 px-6 py-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div class="mx-auto flex max-w-7xl items-center justify-between">
        <div class="flex items-center gap-3">
          <i class="pi pi-clock text-2xl text-primary" />
          <span class="text-xl font-bold tracking-tight">MeanTime</span>
        </div>
        <div class="flex items-center gap-4">
          <Button
            v-if="authStore.isAuthenticated && authStore.user"
            data-testid="user-profile-button"
            :label="authStore.user.display_name"
            icon="pi pi-user"
            text
            severity="secondary"
            @click="goToProfile"
          />
          <Tag value="v0.1.0-dev" severity="info" />
          <Button
            v-if="authStore.isAuthenticated || authStore.loggingOut"
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
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()

function goToProfile() {
  const userId = authStore.user?.id
  if (userId) {
    navigateTo(`/users/${userId}`)
  }
}
</script>

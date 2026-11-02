<template>
  <div class="space-y-4">
    <!-- Skeleton Loaders for Loading State -->
    <div
      v-if="loading"
      data-testid="blocked-users-loading-skeleton"
      class="flex flex-col gap-3"
    >
      <div
        v-for="i in 3"
        :key="i"
        class="flex items-center justify-between p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl"
      >
        <div class="flex items-center gap-3 w-full">
          <Skeleton shape="circle" size="3rem" class="shrink-0" />
          <div class="flex flex-col gap-2 w-full max-w-xs">
            <Skeleton width="40%" height="1.25rem" />
            <Skeleton width="70%" height="1rem" />
          </div>
        </div>
        <div class="flex gap-2">
          <Skeleton width="5rem" height="2rem" borderRadius="6px" />
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="blockedUsers.length === 0"
      data-testid="blocked-users-empty-state"
      class="flex flex-col items-center justify-center p-12 text-center bg-surface-0 dark:bg-surface-900 border border-dashed border-surface-300 dark:border-surface-700 rounded-2xl"
    >
      <div class="w-16 h-16 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4 text-surface-400 dark:text-surface-500">
        <i class="pi pi-ban text-3xl" />
      </div>
      <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-0 mb-1">
        No blocked users
      </h3>
      <p class="text-sm text-surface-500 dark:text-surface-400 max-w-sm">
        You haven't blocked any users. Users you block will appear here.
      </p>
    </div>

    <!-- Blocked Users List -->
    <div
      v-else
      data-testid="blocked-users-list"
      class="flex flex-col gap-3"
    >
      <div
        v-for="user in blockedUsers"
        :key="user.id"
        data-testid="blocked-user-card"
        class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl shadow-sm gap-4 transition-colors"
      >
        <!-- User Details -->
        <div class="flex items-center gap-3">
          <Avatar
            :label="getInitials(user.display_name, user.email)"
            shape="circle"
            size="large"
            data-testid="blocked-user-avatar"
            class="bg-surface-200 text-surface-700 dark:bg-surface-800 dark:text-surface-300 font-semibold shrink-0"
          />
          <div class="flex flex-col">
            <span
              data-testid="blocked-user-name"
              class="font-semibold text-surface-900 dark:text-surface-0 text-base"
            >
              {{ user.display_name || user.email }}
            </span>
            <span
              data-testid="blocked-user-email"
              class="text-xs text-surface-500 dark:text-surface-400"
            >
              {{ user.email }}
            </span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2 self-end sm:self-auto">
          <Button
            label="Unblock"
            severity="secondary"
            variant="outlined"
            size="small"
            :data-testid="'unblock-button-' + user.id"
            @click="handleUnblock(user.id)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserOut } from '~/api/friends'

interface Props {
  blockedUsers?: UserOut[]
  loading?: boolean
}

withDefaults(defineProps<Props>(), {
  blockedUsers: () => [],
  loading: false,
})

const emit = defineEmits<{
  (e: 'unblock', userId: number): void
}>()

function getInitials(name?: string, email?: string): string {
  const trimmed = name?.trim()
  if (trimmed) {
    const parts = trimmed.split(/\s+/)
    const first = parts[0]
    const last = parts[parts.length - 1]
    if (parts.length >= 2 && first && last && first[0] && last[0]) {
      return (first[0] + last[0]).toUpperCase()
    }
    if (first) {
      return first.slice(0, 1).toUpperCase()
    }
  }
  const emailTrimmed = email?.trim()
  if (emailTrimmed) {
    return emailTrimmed.slice(0, 1).toUpperCase()
  }
  return '?'
}

function handleUnblock(userId: number) {
  emit('unblock', userId)
}
</script>

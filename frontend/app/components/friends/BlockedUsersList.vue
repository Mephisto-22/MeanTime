<template>
  <div class="flex flex-col gap-4">
    <!-- Skeleton Loaders for Loading State -->
    <div
      v-if="loading"
      data-testid="blocked-users-loading-skeleton"
      class="flex flex-col gap-3"
    >
      <div
        v-for="i in 3"
        :key="i"
        class="user-item-skeleton"
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
      class="social-empty-state"
    >
      <div class="empty-state-icon-circle">
        <i class="pi pi-ban text-3xl" />
      </div>
      <div class="flex flex-col gap-1 max-w-sm">
        <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-0">
          No blocked users
        </h3>
        <p class="text-sm text-surface-500 dark:text-surface-400">
          You haven't blocked any users. Users you block will appear here.
        </p>
      </div>
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
        class="user-item-card"
      >
        <!-- User Details -->
        <div class="flex items-center gap-3">
          <UserAvatar
            :user="user"
            size="large"
            variant="secondary"
            data-testid="blocked-user-avatar"
          />
          <div class="flex flex-col gap-0.5">
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
import UserAvatar from '~/components/UserAvatar.vue'
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

function handleUnblock(userId: number) {
  emit('unblock', userId)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Skeleton Loaders for Loading State -->
    <div
      v-if="loading"
      data-testid="friends-loading-skeleton"
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
            <Skeleton width="30%" height="0.875rem" />
          </div>
        </div>
        <div class="flex gap-2">
          <Skeleton width="5rem" height="2rem" border-radius="6px" />
          <Skeleton width="4rem" height="2rem" border-radius="6px" />
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="friends.length === 0"
      data-testid="friends-empty-state"
      class="flex flex-col items-center justify-center p-12 text-center bg-surface-0 dark:bg-surface-900 border border-dashed border-surface-300 dark:border-surface-700 rounded-2xl"
    >
      <div class="w-16 h-16 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4 text-surface-400 dark:text-surface-500">
        <i class="pi pi-users text-3xl" />
      </div>
      <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-0 mb-1">
        No friends yet
      </h3>
      <p class="text-sm text-surface-500 dark:text-surface-400 max-w-sm">
        Head over to the "Add Friend" tab to connect with other users and schedule together!
      </p>
    </div>

    <!-- Friends List -->
    <div
      v-else
      class="flex flex-col gap-3"
    >
      <div
        v-for="friend in friends"
        :key="friend.id"
        data-testid="friend-card"
        class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl shadow-sm gap-4 transition-colors"
      >
        <!-- Friend Details -->
        <div class="flex items-center gap-3">
          <Avatar
            :label="getInitials(friend.display_name, friend.email)"
            shape="circle"
            size="large"
            data-testid="friend-avatar"
            class="bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300 font-semibold shrink-0"
          />
          <div class="flex flex-col">
            <span
              data-testid="friend-name"
              class="font-semibold text-surface-900 dark:text-surface-0 text-base"
            >
              {{ friend.display_name }}
            </span>
            <span
              data-testid="friend-email"
              class="text-xs text-surface-500 dark:text-surface-400"
            >
              {{ friend.email }}
            </span>
            <span
              data-testid="friend-timezone"
              class="text-xs text-surface-500 dark:text-surface-400 flex items-center gap-1 mt-0.5"
            >
              <i class="pi pi-globe text-[11px]" />
              {{ friend.timezone }}
            </span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2 self-end sm:self-auto">
          <Button
            label="Unfriend"
            severity="danger"
            variant="outlined"
            size="small"
            :data-testid="'unfriend-button-' + friend.id"
            @click="openUnfriendDialog(friend)"
          />
          <Button
            label="Block"
            severity="secondary"
            variant="text"
            size="small"
            :data-testid="'block-button-' + friend.id"
            @click="openBlockDialog(friend)"
          />
        </div>
      </div>
    </div>

    <!-- Unfriend Confirmation Dialog -->
    <Dialog
      v-model:visible="isUnfriendDialogOpen"
      data-testid="unfriend-confirm-dialog"
      modal
      :draggable="false"
      header="Unfriend Confirmation"
      class="w-[min(28rem,calc(100vw-2rem))]"
    >
      <div class="flex flex-col gap-3 py-2">
        <p class="text-surface-600 dark:text-surface-300">
          Are you sure you want to remove
          <strong class="text-surface-900 dark:text-surface-0">{{ targetFriend?.display_name }}</strong>
          from your friends list?
        </p>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            text
            data-testid="cancel-unfriend-button"
            @click="closeUnfriendDialog"
          />
          <Button
            type="button"
            label="Unfriend"
            severity="danger"
            data-testid="confirm-unfriend-button"
            @click="confirmUnfriend"
          />
        </div>
      </template>
    </Dialog>

    <!-- Block Confirmation Dialog -->
    <Dialog
      v-model:visible="isBlockDialogOpen"
      data-testid="block-confirm-dialog"
      modal
      :draggable="false"
      header="Block User Confirmation"
      class="w-[min(28rem,calc(100vw-2rem))]"
    >
      <div class="flex flex-col gap-3 py-2">
        <p class="text-surface-600 dark:text-surface-300">
          Are you sure you want to block
          <strong class="text-surface-900 dark:text-surface-0">{{ targetFriend?.display_name }}</strong>?
          They will be removed from your friends list and won't be able to send you friend requests.
        </p>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            text
            data-testid="cancel-block-button"
            @click="closeBlockDialog"
          />
          <Button
            type="button"
            label="Block"
            severity="danger"
            data-testid="confirm-block-button"
            @click="confirmBlock"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { UserOut } from '~/api/friends'

interface Props {
  friends?: UserOut[]
  loading?: boolean
}

withDefaults(defineProps<Props>(), {
  friends: () => [],
  loading: false,
})

const emit = defineEmits<{
  (e: 'unfriend', userId: number): void
  (e: 'block', userId: number): void
}>()

const isUnfriendDialogOpen = ref(false)
const isBlockDialogOpen = ref(false)
const targetFriend = ref<UserOut | null>(null)

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

function openUnfriendDialog(friend: UserOut) {
  targetFriend.value = friend
  isUnfriendDialogOpen.value = true
}

function closeUnfriendDialog() {
  isUnfriendDialogOpen.value = false
  targetFriend.value = null
}

function confirmUnfriend() {
  if (targetFriend.value) {
    emit('unfriend', targetFriend.value.id)
  }
  closeUnfriendDialog()
}

function openBlockDialog(friend: UserOut) {
  targetFriend.value = friend
  isBlockDialogOpen.value = true
}

function closeBlockDialog() {
  isBlockDialogOpen.value = false
  targetFriend.value = null
}

function confirmBlock() {
  if (targetFriend.value) {
    emit('block', targetFriend.value.id)
  }
  closeBlockDialog()
}
</script>

<template>
  <div class="space-y-6">
    <!-- Skeleton Loaders for Loading State -->
    <div
      v-if="loading"
      data-testid="requests-loading-skeleton"
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
          <Skeleton width="5rem" height="2rem" borderRadius="6px" />
          <Skeleton width="4rem" height="2rem" borderRadius="6px" />
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="incoming.length === 0 && outgoing.length === 0"
      data-testid="requests-empty-state"
      class="flex flex-col items-center justify-center p-12 text-center bg-surface-0 dark:bg-surface-900 border border-dashed border-surface-300 dark:border-surface-700 rounded-2xl"
    >
      <div class="w-16 h-16 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4 text-surface-400 dark:text-surface-500">
        <i class="pi pi-inbox text-3xl" />
      </div>
      <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-0 mb-1">
        No pending friend requests
      </h3>
      <p class="text-sm text-surface-500 dark:text-surface-400 max-w-sm">
        You have no pending incoming or outgoing friend requests. Head over to the "Add Friend" tab to find people to connect with!
      </p>
    </div>

    <!-- Requests Lists -->
    <div
      v-else
      class="space-y-6"
    >
      <!-- Incoming Requests Section -->
      <section
        v-if="incoming.length > 0"
        data-testid="incoming-requests-section"
        class="flex flex-col gap-3"
      >
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-surface-900 dark:text-surface-0">
            Incoming Requests
          </h3>
          <Badge
            :value="incoming.length"
            severity="secondary"
            data-testid="incoming-count-badge"
          />
        </div>

        <div class="flex flex-col gap-3">
          <div
            v-for="req in incoming"
            :key="req.id"
            data-testid="incoming-request-card"
            class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl shadow-sm gap-4 transition-colors"
          >
            <!-- Requester Details -->
            <div class="flex items-center gap-3">
              <Avatar
                :label="getInitials(req.user.display_name, req.user.email)"
                shape="circle"
                size="large"
                data-testid="incoming-user-avatar"
                class="bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300 font-semibold shrink-0"
              />
              <div class="flex flex-col">
                <span
                  data-testid="incoming-user-name"
                  class="font-semibold text-surface-900 dark:text-surface-0 text-base"
                >
                  {{ req.user.display_name }}
                </span>
                <span
                  data-testid="incoming-user-email"
                  class="text-xs text-surface-500 dark:text-surface-400"
                >
                  {{ req.user.email }}
                </span>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-surface-500 dark:text-surface-400">
                  <span
                    data-testid="incoming-user-timezone"
                    class="flex items-center gap-1"
                  >
                    <i class="pi pi-globe text-[11px]" />
                    {{ req.user.timezone }}
                  </span>
                  <span
                    data-testid="incoming-request-date"
                    class="flex items-center gap-1"
                  >
                    <i class="pi pi-calendar text-[11px]" />
                    Received {{ formatDate(req.created_at) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <Button
                label="Accept"
                severity="success"
                size="small"
                icon="pi pi-check"
                :data-testid="'accept-request-button-' + req.user.id"
                @click="emit('accept', req.user.id)"
              />
              <Button
                label="Decline"
                severity="secondary"
                variant="outlined"
                size="small"
                icon="pi pi-times"
                :data-testid="'decline-request-button-' + req.user.id"
                @click="emit('decline', req.user.id)"
              />
              <Button
                label="Block"
                severity="danger"
                variant="outlined"
                size="small"
                icon="pi pi-ban"
                :data-testid="'block-request-button-' + req.user.id"
                @click="openBlockDialog(req.user)"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- Outgoing Requests Section -->
      <section
        v-if="outgoing.length > 0"
        data-testid="outgoing-requests-section"
        class="flex flex-col gap-3"
      >
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-surface-900 dark:text-surface-0">
            Outgoing Requests
          </h3>
          <Badge
            :value="outgoing.length"
            severity="secondary"
            data-testid="outgoing-count-badge"
          />
        </div>

        <div class="flex flex-col gap-3">
          <div
            v-for="req in outgoing"
            :key="req.id"
            data-testid="outgoing-request-card"
            class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl shadow-sm gap-4 transition-colors"
          >
            <!-- Recipient Details -->
            <div class="flex items-center gap-3">
              <Avatar
                :label="getInitials(req.user.display_name, req.user.email)"
                shape="circle"
                size="large"
                data-testid="outgoing-user-avatar"
                class="bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-300 font-semibold shrink-0"
              />
              <div class="flex flex-col">
                <span
                  data-testid="outgoing-user-name"
                  class="font-semibold text-surface-900 dark:text-surface-0 text-base"
                >
                  {{ req.user.display_name }}
                </span>
                <span
                  data-testid="outgoing-user-email"
                  class="text-xs text-surface-500 dark:text-surface-400"
                >
                  {{ req.user.email }}
                </span>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-surface-500 dark:text-surface-400">
                  <span
                    data-testid="outgoing-user-timezone"
                    class="flex items-center gap-1"
                  >
                    <i class="pi pi-globe text-[11px]" />
                    {{ req.user.timezone }}
                  </span>
                  <span
                    data-testid="outgoing-request-date"
                    class="flex items-center gap-1"
                  >
                    <i class="pi pi-calendar text-[11px]" />
                    Sent {{ formatDate(req.created_at) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Cancel Button -->
            <div class="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <Button
                label="Cancel Request"
                severity="danger"
                variant="outlined"
                size="small"
                icon="pi pi-times"
                :data-testid="'cancel-request-button-' + req.user.id"
                @click="emit('cancel', req.user.id)"
              />
            </div>
          </div>
        </div>
      </section>
    </div>

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
          <strong class="text-surface-900 dark:text-surface-0">{{ targetUser?.display_name }}</strong>?
          Their friend request will be removed and they won't be able to send you friend requests.
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
import type { FriendRequestOut, UserOut } from '~/api/friends'

interface Props {
  incoming?: FriendRequestOut[]
  outgoing?: FriendRequestOut[]
  loading?: boolean
}

withDefaults(defineProps<Props>(), {
  incoming: () => [],
  outgoing: () => [],
  loading: false,
})

const emit = defineEmits<{
  (e: 'accept', userId: number): void
  (e: 'decline', userId: number): void
  (e: 'cancel', userId: number): void
  (e: 'block', userId: number): void
}>()

const isBlockDialogOpen = ref(false)
const targetUser = ref<UserOut | null>(null)

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

function formatDate(dateString?: string): string {
  if (!dateString) return ''
  try {
    const d = new Date(dateString)
    if (isNaN(d.getTime())) return dateString
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateString
  }
}

function openBlockDialog(user: UserOut) {
  targetUser.value = user
  isBlockDialogOpen.value = true
}

function closeBlockDialog() {
  isBlockDialogOpen.value = false
  targetUser.value = null
}

function confirmBlock() {
  if (targetUser.value) {
    emit('block', targetUser.value.id)
  }
  closeBlockDialog()
}
</script>

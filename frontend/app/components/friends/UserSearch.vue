<template>
  <div class="space-y-6">
    <!-- Search Bar Form -->
    <div class="p-6 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-2xl shadow-sm">
      <div class="max-w-2xl">
        <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-0 mb-1">
          Find Friends
        </h3>
        <p class="text-sm text-surface-500 dark:text-surface-400 mb-4">
          Search for users by exact email address or display name to connect and collaborate.
        </p>

        <form
          class="flex flex-col sm:flex-row gap-3"
          @submit.prevent="handleSearch"
        >
          <div class="relative flex-1">
            <InputText
              v-model="searchQuery"
              placeholder="Search by exact email or display name..."
              class="w-full pr-10"
              data-testid="user-search-input"
              :disabled="isSearching"
            />
            <button
              v-if="searchQuery.length > 0"
              type="button"
              data-testid="clear-search-button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 text-sm focus:outline-none"
              aria-label="Clear search"
              @click="clearSearch"
            >
              <i class="pi pi-times text-xs" />
            </button>
          </div>

          <Button
            type="submit"
            label="Search"
            icon="pi pi-search"
            data-testid="user-search-button"
            :loading="isSearching"
            :disabled="!searchQuery.trim() || isSearching"
            class="shrink-0"
          />
        </form>
      </div>
    </div>

    <!-- Self-Search Alert -->
    <div
      v-if="isSelfSearch"
      data-testid="self-search-alert"
      role="alert"
      class="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200 transition-all"
    >
      <i class="pi pi-info-circle text-lg shrink-0" />
      <div class="text-sm">
        <strong>This is your email address.</strong> You cannot send a friend request to yourself.
      </div>
    </div>

    <!-- Error Alert -->
    <div
      v-if="errorMessage"
      data-testid="search-error"
      role="alert"
      class="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-800 dark:text-red-200 transition-all"
    >
      <i class="pi pi-exclamation-triangle text-lg shrink-0" />
      <div class="text-sm">
        {{ errorMessage }}
      </div>
    </div>

    <!-- Empty Search Results State -->
    <div
      v-if="hasSearched && !isSearching && searchResults && searchResults.length === 0"
      data-testid="search-empty-state"
      class="flex flex-col items-center justify-center p-12 text-center bg-surface-0 dark:bg-surface-900 border border-dashed border-surface-300 dark:border-surface-700 rounded-2xl"
    >
      <div class="w-16 h-16 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4 text-surface-400 dark:text-surface-500">
        <i class="pi pi-search text-3xl" />
      </div>
      <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-0 mb-1">
        No users found
      </h3>
      <p class="text-sm text-surface-500 dark:text-surface-400 max-w-md">
        No user found matching '{{ lastSearchedQuery }}'. Please verify the exact email or username.
      </p>
    </div>

    <!-- Search Results List -->
    <div
      v-else-if="searchResults && searchResults.length > 0"
      data-testid="search-results-list"
      class="space-y-3"
    >
      <div class="flex items-center justify-between pb-1">
        <h4 class="text-sm font-semibold text-surface-700 dark:text-surface-300 uppercase tracking-wider">
          Results ({{ searchResults.length }})
        </h4>
      </div>

      <div class="flex flex-col gap-3">
        <div
          v-for="user in searchResults"
          :key="user.id"
          data-testid="search-result-card"
          :data-testid-user="user.id"
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl shadow-sm gap-4 transition-colors"
        >
          <!-- User Details -->
          <div class="flex items-center gap-3">
            <Avatar
              :label="getInitials(user.display_name, user.email)"
              shape="circle"
              size="large"
              data-testid="user-avatar"
              class="bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300 font-semibold shrink-0"
            />
            <div class="flex flex-col">
              <span
                data-testid="user-name"
                class="font-semibold text-surface-900 dark:text-surface-0 text-base"
              >
                {{ user.display_name }}
              </span>
              <span
                data-testid="user-email"
                class="text-xs text-surface-500 dark:text-surface-400"
              >
                {{ user.email }}
              </span>
              <span
                data-testid="user-timezone"
                class="text-xs text-surface-500 dark:text-surface-400 flex items-center gap-1 mt-0.5"
              >
                <i class="pi pi-globe text-[11px]" />
                {{ user.timezone }}
              </span>
            </div>
          </div>

          <!-- Relationship-aware Action Controls -->
          <div class="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <!-- Case 1: relationship_status === 'none' -->
            <template v-if="user.relationship_status === 'none'">
              <Button
                label="Send Friend Request"
                icon="pi pi-user-plus"
                size="small"
                :data-testid="'send-request-button-' + user.id"
                @click="handleSendRequest(user.id)"
              />
              <Button
                label="Block User"
                severity="secondary"
                variant="outlined"
                size="small"
                icon="pi pi-ban"
                :data-testid="'block-button-' + user.id"
                @click="openBlockDialog(user)"
              />
            </template>

            <!-- Case 2: relationship_status === 'friend' -->
            <template v-else-if="user.relationship_status === 'friend'">
              <Tag
                value="Friends"
                severity="success"
                icon="pi pi-check"
                :data-testid="'friend-tag-' + user.id"
              />
              <Button
                label="Unfriend"
                severity="danger"
                variant="outlined"
                size="small"
                :data-testid="'unfriend-button-' + user.id"
                @click="openUnfriendDialog(user)"
              />
              <Button
                label="Block User"
                severity="secondary"
                variant="text"
                size="small"
                :data-testid="'block-button-' + user.id"
                @click="openBlockDialog(user)"
              />
            </template>

            <!-- Case 3: relationship_status === 'pending_incoming' -->
            <template v-else-if="user.relationship_status === 'pending_incoming'">
              <Button
                label="Accept"
                severity="success"
                size="small"
                icon="pi pi-check"
                :data-testid="'accept-request-button-' + user.id"
                @click="handleAcceptRequest(user.id)"
              />
              <Button
                label="Decline"
                severity="secondary"
                variant="outlined"
                size="small"
                icon="pi pi-times"
                :data-testid="'decline-request-button-' + user.id"
                @click="handleDeclineRequest(user.id)"
              />
              <Button
                label="Block User"
                severity="secondary"
                variant="text"
                size="small"
                :data-testid="'block-button-' + user.id"
                @click="openBlockDialog(user)"
              />
            </template>

            <!-- Case 4: relationship_status === 'pending_outgoing' -->
            <template v-else-if="user.relationship_status === 'pending_outgoing'">
              <Tag
                value="Request Sent"
                severity="warn"
                icon="pi pi-clock"
                :data-testid="'request-sent-tag-' + user.id"
              />
              <Button
                label="Cancel Request"
                severity="danger"
                variant="outlined"
                size="small"
                icon="pi pi-times"
                :data-testid="'cancel-request-button-' + user.id"
                @click="handleCancelRequest(user.id)"
              />
            </template>
          </div>
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
          <strong class="text-surface-900 dark:text-surface-0">{{ targetUser?.display_name }}</strong>
          from your friends list?
        </p>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            variant="text"
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

    <!-- Block User Confirmation Dialog -->
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
          They will be blocked and won't be able to send you friend requests or interact with you.
        </p>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            variant="text"
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
import { friendsApi, type UserSearchResultOut } from '~/api/friends'
import { useAuthStore } from '~/stores/auth'

const emit = defineEmits<{
  (e: 'send-request', userId: number): void
  (e: 'accept-request', userId: number): void
  (e: 'decline-request', userId: number): void
  (e: 'cancel-request', userId: number): void
  (e: 'unfriend', userId: number): void
  (e: 'block', userId: number): void
}>()

const authStore = useAuthStore()

const searchQuery = ref('')
const lastSearchedQuery = ref('')
const searchResults = ref<UserSearchResultOut[] | null>(null)
const isSearching = ref(false)
const hasSearched = ref(false)
const isSelfSearch = ref(false)
const errorMessage = ref<string | null>(null)

const isUnfriendDialogOpen = ref(false)
const isBlockDialogOpen = ref(false)
const targetUser = ref<UserSearchResultOut | null>(null)

function getInitials(name?: string, email?: string): string {
  const trimmed = name?.trim()
  if (trimmed) {
    const parts = trimmed.split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0].slice(0, 1).toUpperCase()
  }
  const emailTrimmed = email?.trim()
  if (emailTrimmed) {
    return emailTrimmed.slice(0, 1).toUpperCase()
  }
  return '?'
}

async function handleSearch() {
  const query = searchQuery.value.trim()
  if (!query || isSearching.value) return

  const userEmail = authStore.user?.email?.trim().toLowerCase()
  if (userEmail && query.toLowerCase() === userEmail) {
    isSelfSearch.value = true
    searchResults.value = null
    hasSearched.value = false
    errorMessage.value = null
    return
  }

  isSelfSearch.value = false
  errorMessage.value = null
  isSearching.value = true
  hasSearched.value = true
  lastSearchedQuery.value = query

  try {
    searchResults.value = await friendsApi.searchUser(query)
  } catch (err: unknown) {
    searchResults.value = null
    const message = err instanceof Error ? err.message : 'Failed to search users. Please try again.'
    errorMessage.value = message
  } finally {
    isSearching.value = false
  }
}

function clearSearch() {
  searchQuery.value = ''
  lastSearchedQuery.value = ''
  searchResults.value = null
  hasSearched.value = false
  isSelfSearch.value = false
  errorMessage.value = null
}

function updateStatus(userId: number, status: UserSearchResultOut['relationship_status']) {
  if (searchResults.value) {
    const item = searchResults.value.find(u => u.id === userId)
    if (item) {
      item.relationship_status = status
    }
  }
}

function handleSendRequest(userId: number) {
  updateStatus(userId, 'pending_outgoing')
  emit('send-request', userId)
}

function handleAcceptRequest(userId: number) {
  updateStatus(userId, 'friend')
  emit('accept-request', userId)
}

function handleDeclineRequest(userId: number) {
  updateStatus(userId, 'none')
  emit('decline-request', userId)
}

function handleCancelRequest(userId: number) {
  updateStatus(userId, 'none')
  emit('cancel-request', userId)
}

function openUnfriendDialog(user: UserSearchResultOut) {
  targetUser.value = user
  isUnfriendDialogOpen.value = true
}

function closeUnfriendDialog() {
  isUnfriendDialogOpen.value = false
  targetUser.value = null
}

function confirmUnfriend() {
  if (targetUser.value) {
    const userId = targetUser.value.id
    updateStatus(userId, 'none')
    emit('unfriend', userId)
  }
  closeUnfriendDialog()
}

function openBlockDialog(user: UserSearchResultOut) {
  targetUser.value = user
  isBlockDialogOpen.value = true
}

function closeBlockDialog() {
  isBlockDialogOpen.value = false
  targetUser.value = null
}

function confirmBlock() {
  if (targetUser.value) {
    const userId = targetUser.value.id
    if (searchResults.value) {
      searchResults.value = searchResults.value.filter(u => u.id !== userId)
    }
    emit('block', userId)
  }
  closeBlockDialog()
}
</script>

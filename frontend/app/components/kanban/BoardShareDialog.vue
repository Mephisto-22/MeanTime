<template>
  <Dialog
    v-model:visible="visible"
    data-testid="board-share-dialog"
    modal
    :draggable="false"
    :header="dialogTitle"
    class="w-[min(34rem,calc(100vw-2rem))]"
  >
    <div class="flex flex-col gap-5 py-2">
      <!-- Owner Invite Section -->
      <div v-if="isOwner" data-testid="invite-section" class="flex flex-col gap-2">
        <label for="friend-share-select" class="text-sm font-medium text-surface-700 dark:text-surface-300">
          Invite friends to collaborate
        </label>
        <div class="flex gap-2">
          <select
            id="friend-share-select"
            v-model.number="selectedFriendId"
            data-testid="friend-select"
            class="w-full rounded-lg border border-surface-300 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-2 text-sm text-surface-900 dark:text-surface-0 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option :value="null" disabled>
              {{ availableFriends.length > 0 ? 'Select a friend...' : 'No new friends to invite' }}
            </option>
            <option
              v-for="friend in availableFriends"
              :key="friend.id"
              :value="friend.id"
            >
              {{ friend.display_name }} ({{ friend.email }})
            </option>
          </select>
          <Button
            label="Invite"
            icon="pi pi-user-plus"
            size="small"
            data-testid="invite-friend-button"
            :disabled="!selectedFriendId || isInviting"
            :loading="isInviting"
            @click="handleInviteFriend"
          />
        </div>
      </div>

      <!-- Non-owner Notice -->
      <p
        v-else-if="!isOwner"
        data-testid="non-owner-invite-message"
        class="text-xs text-surface-500 dark:text-surface-400"
      >
        Only the board owner can invite collaborators.
      </p>

      <!-- People with Access List -->
      <div class="flex flex-col gap-3">
        <h4 class="text-sm font-semibold tracking-wide text-surface-700 dark:text-surface-300">
          People with access
        </h4>

        <div class="flex flex-col divide-y divide-surface-200 dark:divide-surface-800 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-0 dark:bg-surface-900">
          <!-- Board Owner Row -->
          <div
            v-if="board.owner"
            data-testid="board-owner-row"
            class="flex items-center justify-between p-3"
          >
            <div class="flex items-center gap-3">
              <Avatar
                :label="getInitials(board.owner.display_name, board.owner.email)"
                shape="circle"
                class="bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300 text-xs font-bold"
              />
              <div class="flex flex-col">
                <span class="text-sm font-medium text-surface-900 dark:text-surface-0">
                  {{ board.owner.display_name }}
                  <span v-if="authStore.user?.id === board.owner.id" class="text-xs text-surface-500 font-normal">(you)</span>
                </span>
                <span class="text-xs text-surface-500 dark:text-surface-400">
                  {{ board.owner.email }}
                </span>
              </div>
            </div>
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
              Owner
            </span>
          </div>

          <!-- Collaborator Rows -->
          <template v-if="board.collaborators && board.collaborators.length > 0">
            <div
              v-for="collaborator in board.collaborators"
              :key="collaborator.id"
              :data-testid="'collaborator-row-' + collaborator.id"
              class="flex items-center justify-between p-3"
            >
              <div class="flex items-center gap-3">
                <Avatar
                  :label="getInitials(collaborator.display_name, collaborator.email)"
                  shape="circle"
                  class="bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-300 text-xs font-bold"
                />
                <div class="flex flex-col">
                  <span class="text-sm font-medium text-surface-900 dark:text-surface-0">
                    {{ collaborator.display_name }}
                    <span v-if="authStore.user?.id === collaborator.id" class="text-xs text-surface-500 font-normal">(you)</span>
                  </span>
                  <span class="text-xs text-surface-500 dark:text-surface-400">
                    {{ collaborator.email }}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-300">
                  Editor
                </span>
                <Button
                  v-if="isOwner"
                  :data-testid="'remove-collaborator-' + collaborator.id"
                  icon="pi pi-times"
                  text
                  rounded
                  severity="danger"
                  size="small"
                  aria-label="Remove collaborator"
                  :disabled="isRemovingId === collaborator.id"
                  :loading="isRemovingId === collaborator.id"
                  @click="handleRemoveCollaborator(collaborator)"
                />
              </div>
            </div>
          </template>

          <div
            v-else
            data-testid="no-collaborators-message"
            class="p-4 text-center text-xs text-surface-500 dark:text-surface-400"
          >
            No collaborators yet. Invite friends above to work together.
          </div>
        </div>
      </div>

      <!-- Leave Board Confirmation Banner (Collaborators only) -->
      <div
        v-if="isConfirmingLeave"
        data-testid="leave-board-confirmation"
        class="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30"
      >
        <p class="text-sm font-medium text-red-900 dark:text-red-200">
          Are you sure you want to leave "{{ board.title }}"? You will lose access to all tasks and columns.
        </p>
        <div class="mt-3 flex justify-end gap-2">
          <Button
            data-testid="cancel-leave-button"
            label="Cancel"
            text
            severity="secondary"
            size="small"
            :disabled="isLeaving"
            @click="isConfirmingLeave = false"
          />
          <Button
            data-testid="confirm-leave-button"
            label="Leave board"
            severity="danger"
            size="small"
            :loading="isLeaving"
            @click="handleConfirmLeave"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <Button
          v-if="!isOwner && isCollaborator && !isConfirmingLeave"
          data-testid="leave-board-button"
          label="Leave Board"
          icon="pi pi-sign-out"
          severity="danger"
          text
          size="small"
          @click="isConfirmingLeave = true"
        />
        <div v-else />
        <Button
          label="Done"
          severity="secondary"
          size="small"
          @click="visible = false"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { kanbanApi, type KanbanBoardDto } from '~/api/kanban'
import { friendsApi, type UserOut } from '~/api/friends'
import { useAuthStore } from '~/stores/auth'

interface Props {
  board: KanbanBoardDto
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'collaborators-updated'): void
  (e: 'left-board'): void
}>()

const visible = defineModel<boolean>('visible', { required: true })

const authStore = useAuthStore()
const notify = useNotifications()

const friends = ref<UserOut[]>([])
const selectedFriendId = ref<number | null>(null)
const isInviting = ref(false)
const isRemovingId = ref<number | null>(null)
const isLeaving = ref(false)
const isConfirmingLeave = ref(false)

const dialogTitle = computed(() => `Share "${props.board?.title || 'Board'}"`)

const isOwner = computed(() => {
  return Boolean(props.board?.owner?.id && authStore.user?.id && props.board.owner.id === authStore.user.id)
})

const isCollaborator = computed(() => {
  return props.board?.collaborators?.some(c => c.id === authStore.user?.id) ?? false
})

const availableFriends = computed(() => {
  const ownerId = props.board?.owner?.id
  const collaboratorIds = new Set(props.board?.collaborators?.map(c => c.id) || [])
  return friends.value.filter(f => f.id !== ownerId && !collaboratorIds.has(f.id))
})

async function loadFriends() {
  if (!isOwner.value) return
  try {
    const list = await friendsApi.getFriends()
    friends.value = list || []
  } catch (err) {
    notify.error(err, 'Failed to load friends list.')
  }
}

watch(visible, (isOpen) => {
  if (isOpen) {
    isConfirmingLeave.value = false
    selectedFriendId.value = null
    loadFriends()
  }
})

onMounted(() => {
  if (visible.value) {
    loadFriends()
  }
})

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

async function handleInviteFriend() {
  if (!selectedFriendId.value) return
  isInviting.value = true
  try {
    await kanbanApi.shareBoard(props.board.id, Number(selectedFriendId.value))
    notify.success('Friend invited to collaborate on board.')
    selectedFriendId.value = null
    emit('collaborators-updated')
  } catch (err) {
    notify.error(err, 'Failed to invite friend.')
  } finally {
    isInviting.value = false
  }
}

async function handleRemoveCollaborator(collaborator: UserOut) {
  isRemovingId.value = collaborator.id
  try {
    await kanbanApi.removeCollaborator(props.board.id, collaborator.id)
    notify.success(`${collaborator.display_name} removed from board.`)
    emit('collaborators-updated')
  } catch (err) {
    notify.error(err, 'Failed to remove collaborator.')
  } finally {
    isRemovingId.value = null
  }
}

async function handleConfirmLeave() {
  if (!authStore.user?.id) return
  isLeaving.value = true
  try {
    await kanbanApi.removeCollaborator(props.board.id, authStore.user.id)
    notify.success('You have left the board.')
    isConfirmingLeave.value = false
    visible.value = false
    emit('left-board')
  } catch (err) {
    notify.error(err, 'Failed to leave board.')
  } finally {
    isLeaving.value = false
  }
}
</script>

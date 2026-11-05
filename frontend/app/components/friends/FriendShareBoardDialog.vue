<template>
  <Dialog
    v-model:visible="visible"
    data-testid="friend-share-board-dialog"
    modal
    :draggable="false"
    :header="dialogTitle"
    class="dialog-sm"
  >
    <div class="flex flex-col gap-4 py-2">
      <p class="text-sm text-surface-600 dark:text-surface-300">
        Choose one of your boards to collaborate on with
        <strong class="text-surface-900 dark:text-surface-0">{{ friend?.display_name }}</strong>.
      </p>

      <div class="field-group">
        <label for="share-board-select" class="text-sm font-medium">
          Select Board
        </label>
        <Select
          id="share-board-select"
          v-model="selectedBoardId"
          data-testid="board-select"
          :options="eligibleBoards"
          option-value="id"
          option-label="title"
          :placeholder="eligibleBoards.length > 0 ? 'Select a board to share...' : 'No available boards to share'"
          :disabled="eligibleBoards.length === 0 || isLoading"
          class="w-full"
          size="small"
        />
        <Message
          v-if="eligibleBoards.length === 0 && !isLoading"
          severity="info"
          :closable="false"
          size="small"
        >
          All your owned boards are already shared with this friend, or you haven't created any boards yet.
        </Message>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button
          type="button"
          label="Cancel"
          severity="secondary"
          text
          data-testid="cancel-share-button"
          :disabled="isSharing"
          @click="visible = false"
        />
        <Button
          type="button"
          label="Share"
          severity="primary"
          data-testid="confirm-share-button"
          :disabled="!selectedBoardId || isSharing"
          :loading="isSharing"
          @click="handleShare"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { kanbanApi, type KanbanBoardDto } from '~/api/kanban'
import type { UserOut } from '~/api/friends'
import { useAuthStore } from '~/stores/auth'

interface Props {
  friend: UserOut | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'shared'): void
}>()

const visible = defineModel<boolean>('visible', { required: true })

const authStore = useAuthStore()
const notify = useNotifications()

const boards = ref<KanbanBoardDto[]>([])
const selectedBoardId = ref<number | null>(null)
const isLoading = ref(false)
const isSharing = ref(false)

const dialogTitle = computed(() => `Share board with ${props.friend?.display_name || 'Friend'}`)

const eligibleBoards = computed(() => {
  if (!props.friend) return []
  const currentUserId = authStore.user?.id
  return boards.value.filter(b => {
    // Only boards owned by current user
    const isOwner = Boolean(b.owner?.id && currentUserId && b.owner.id === currentUserId)
    if (!isOwner) return false
    // Must not already have friend as collaborator
    const alreadyShared = b.collaborators?.some(c => c.id === props.friend?.id)
    return !alreadyShared
  })
})

async function loadBoards() {
  isLoading.value = true
  try {
    const list = await kanbanApi.listBoards()
    boards.value = list || []
  } catch (err) {
    notify.error(err, 'Unable to load boards.')
  } finally {
    isLoading.value = false
  }
}

watch(visible, (isOpen) => {
  if (isOpen) {
    selectedBoardId.value = null
    loadBoards()
  }
})

onMounted(() => {
  if (visible.value) {
    loadBoards()
  }
})

async function handleShare() {
  if (!props.friend || !selectedBoardId.value) return
  isSharing.value = true
  try {
    await kanbanApi.shareBoard(selectedBoardId.value, props.friend.id)
    notify.success(`Board shared with ${props.friend.display_name}.`)
    visible.value = false
    emit('shared')
  } catch (err) {
    notify.error(err, 'Failed to share board.')
  } finally {
    isSharing.value = false
  }
}
</script>

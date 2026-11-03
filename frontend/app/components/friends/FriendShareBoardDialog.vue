<template>
  <Dialog
    v-model:visible="visible"
    data-testid="friend-share-board-dialog"
    modal
    :draggable="false"
    :header="dialogTitle"
    class="w-[min(30rem,calc(100vw-2rem))]"
  >
    <div class="flex flex-col gap-4 py-2">
      <p class="text-sm text-surface-600 dark:text-surface-300">
        Choose one of your boards to collaborate on with
        <strong class="text-surface-900 dark:text-surface-0">{{ friend?.display_name }}</strong>.
      </p>

      <div class="flex flex-col gap-2">
        <label for="share-board-select" class="text-sm font-medium text-surface-700 dark:text-surface-300">
          Select Board
        </label>
        <select
          id="share-board-select"
          v-model.number="selectedBoardId"
          data-testid="board-select"
          class="w-full rounded-lg border border-surface-300 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-2 text-sm text-surface-900 dark:text-surface-0 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option :value="null" disabled>
            {{ eligibleBoards.length > 0 ? 'Select a board to share...' : 'No available boards to share' }}
          </option>
          <option
            v-for="b in eligibleBoards"
            :key="b.id"
            :value="b.id"
          >
            {{ b.title }}
          </option>
        </select>
        <p v-if="eligibleBoards.length === 0 && !isLoading" class="text-xs text-surface-500 dark:text-surface-400 mt-1">
          All your owned boards are already shared with this friend, or you haven't created any boards yet.
        </p>
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
    const isOwner = !b.owner || b.owner.id === currentUserId
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
  if (!selectedBoardId.value || !props.friend) return
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

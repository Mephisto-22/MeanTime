<template>
  <div class="mx-auto max-w-7xl px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
    <section class="lg:col-span-8 flex flex-col gap-6 min-w-0">
      <!-- Header Toolbar -->
      <Toolbar class="border-none bg-transparent p-0">
        <template #start>
          <div class="flex flex-col gap-1">
            <h1 class="text-3xl font-extrabold tracking-tight text-surface-900 dark:text-surface-0">
              Your boards
            </h1>
            <p class="text-sm text-surface-600 dark:text-surface-400">
              Pick a board to open, or work directly from your docked Task Feed.
            </p>
          </div>
        </template>
        <template #end>
          <Button
            v-if="boards.length !== 0"
            data-testid="new-board-button"
            label="New board"
            icon="pi pi-plus"
            @click="openCreateDialog"
          />
        </template>
      </Toolbar>

      <!-- Loading (first load only; a re-fetch keeps showing the current boards) -->
      <div
        v-if="boardsStatus === 'pending' && boards.length === 0"
        data-testid="boards-loading"
        class="grid grid-cols-1 gap-5 sm:grid-cols-2"
      >
        <Skeleton
          v-for="n in 3"
          :key="n"
          height="14rem"
          border-radius="16px"
        />
      </div>

      <!-- Error -->
      <div
        v-else-if="boardsError"
        data-testid="boards-error"
        class="error-state-card"
      >
        <div class="flex flex-wrap items-center gap-3">
          <span>We couldn't load your boards.</span>
          <Button
            label="Try again"
            icon="pi pi-refresh"
            severity="danger"
            text
            size="small"
            @click="() => refreshBoards()"
          />
        </div>
      </div>

      <!-- Empty -->
      <Panel
        v-else-if="boards.length === 0"
        data-testid="boards-empty"
        class="border-dashed border-2 border-surface-200 dark:border-surface-800 rounded-2xl bg-surface-0/60 dark:bg-surface-900/60"
      >
        <div class="flex flex-col items-center justify-center gap-5 py-20 text-center">
          <div class="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400 border border-primary-200/50 dark:border-primary-800/50 shadow-sm">
            <i class="pi pi-th-large text-4xl" />
          </div>
          <div class="flex flex-col gap-1.5 max-w-sm">
            <h2 class="text-xl font-bold text-surface-900 dark:text-surface-0">
              You have no boards yet
            </h2>
            <p class="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
              Create your first board to start tracking tasks and recording focused time sessions.
            </p>
          </div>
          <Button
            label="New board"
            icon="pi pi-plus"
            @click="openCreateDialog"
          />
        </div>
      </Panel>

      <!-- Boards Grid -->
      <ul
        v-else
        class="grid grid-cols-1 gap-5 sm:grid-cols-2 list-none p-0 m-0"
      >
        <li
          v-for="board in boards"
          :key="board.id"
        >
          <KanbanBoardCard
            :board="board"
            @edit="openEditDialog"
          />
        </li>
      </ul>
    </section>

    <aside
      data-testid="task-feed-rail"
      class="lg:col-span-4 lg:sticky lg:top-20 lg:h-[calc(100vh-8rem)] flex flex-col min-h-[420px] min-w-0"
    >
      <KanbanTaskFeed
        :tasks="feedTasks"
        :user-tags="userTags"
        :loading="feedStatus === 'pending'"
        :error="feedError"
        @retry="() => refreshFeed()"
      />
    </aside>

    <KanbanBoardFormDialog
      v-model:visible="isDialogOpen"
      :board="boardBeingEdited"
      @saved="refreshAll"
      @deleted="refreshAll"
    />

    <KanbanTaskDialog
      v-model:visible="isTaskDialogOpen"
      mode="edit"
      :task="activeTask"
      :column-id="activeTask?.columnId ?? null"
      :board-id="activeTask?.boardId ?? null"
      :board-title="activeTask?.boardTitle ?? null"
      :columns="activeBoardColumns"
      :available-tags="activeBoardTags"
      @save="saveTask"
      @delete="deleteTask"
      @timer-expired="handleDialogTimerExpired"
    />
  </div>
</template>

<script setup lang="ts">
import {
  kanbanApi,
  kanbanContextKey,
  type KanbanBoardDto,
  type KanbanColumnSummary,
  type KanbanTaskDto,
  type TagDto,
  type TaskFeedItemDto,
  type TaskTimeEntryDto,
} from '~/api/kanban'
import KanbanTaskDialog from '~/components/kanban/TaskDialog.vue'
import KanbanTaskFeed from '~/components/kanban/TaskFeed.vue'
import {
  getBoardMembers,
  isBoardShared,
  sameId,
  useKanbanTaskActions,
} from '~/composables/useKanbanTaskActions'
import { useTaskFeedSync } from '~/composables/useTaskFeedSync'

const notify = useNotifications()

// The backend is the source of truth: after every board create, edit, or delete
// both boards and the Task Feed are fetched again in parallel.
const [
  {
    data: boards,
    status: boardsStatus,
    error: boardsError,
    refresh: refreshBoards,
  },
  {
    data: feedTasks,
    status: feedStatus,
    error: feedError,
    refresh: refreshFeed,
  },
  {
    data: userTags,
    error: userTagsError,
    refresh: refreshUserTags,
  },
] = await Promise.all([
  useAsyncData('kanban-boards', () => kanbanApi.listBoards(), {
    default: () => [],
    deep: true,
  }),
  useAsyncData('kanban-task-feed', () => kanbanApi.listTaskFeed(), {
    default: () => [],
    deep: true,
  }),
  useAsyncData('kanban-user-tags', () => kanbanApi.listUserTags(), {
    default: () => [],
  }),
])

const refreshAll = async (): Promise<void> => {
  await Promise.all([refreshBoards(), refreshFeed(), refreshUserTags()])
}

// State for the board create/edit dialog. A null boardBeingEdited means creating a new board.
const isDialogOpen = ref(false)
const boardBeingEdited = ref<KanbanBoardDto | null>(null)

function openCreateDialog(): void {
  boardBeingEdited.value = null
  isDialogOpen.value = true
}

function openEditDialog(board: KanbanBoardDto): void {
  boardBeingEdited.value = board
  isDialogOpen.value = true
}

const isTaskDialogOpen = ref(false)
const activeTask = ref<TaskFeedItemDto | null>(null)
const activeBoardTags = ref<TagDto[]>([])
let tagRequestCounter = 0

const activeBoard = computed(() => {
  if (!activeTask.value) return undefined
  return boards.value.find(board => sameId(board.id, activeTask.value?.boardId))
})

const activeBoardColumns = computed<KanbanColumnSummary[]>(() => {
  if (activeBoard.value?.columns && activeBoard.value.columns.length > 0) {
    return [...activeBoard.value.columns]
      .sort((a, b) => a.position - b.position)
      .map(col => ({ id: col.id, title: col.title }))
  }
  if (activeTask.value) {
    return [{ id: activeTask.value.columnId, title: activeTask.value.columnTitle }]
  }
  return []
})

const activeBoardIsShared = computed(() => isBoardShared(activeBoard.value))
const activeBoardMembers = computed(() => getBoardMembers(activeBoard.value))

const taskFeedSync = useTaskFeedSync({
  boards,
  feedTasks,
  userTags,
  activeTask,
})

const {
  updateTask,
  deleteTask,
  saveTask,
  createTag,
  startTimer,
  pauseTimer,
  stopTimer,
  setTaskTotal,
  handleTimerExpired,
} = useKanbanTaskActions({
  findTask: taskFeedSync.findFeedTask,
  availableTags: activeBoardTags,
  createSnapshot: taskFeedSync.createSnapshot,
  moveTaskLocally: taskFeedSync.moveTaskLocally,
  removeTaskLocally: taskFeedSync.removeTaskLocally,
  onAfterTaskUpdate: taskFeedSync.onAfterTaskUpdate,
  onAfterTagCreate: taskFeedSync.onAfterTagCreate,
  onAfterTimerChange: taskFeedSync.onAfterTimerChange,
  onAfterTaskTotalChange: taskFeedSync.onAfterTaskTotalChange,
})

const openEditTaskDialog = (task: KanbanTaskDto): void => {
  const feedTask = task as TaskFeedItemDto
  activeTask.value = feedTask
  activeBoardTags.value = []
  isTaskDialogOpen.value = true

  const requestId = ++tagRequestCounter
  void kanbanApi.listTags(feedTask.boardId).then(
    (tags) => {
      if (requestId !== tagRequestCounter) return
      activeBoardTags.value = tags || []
    },
    (err) => {
      if (requestId !== tagRequestCounter) return
      notify.error(err, 'Unable to fetch tags')
    },
  )
}

const handleDialogTimerExpired = (entry: TaskTimeEntryDto): void => {
  if (activeTask.value) {
    handleTimerExpired(activeTask.value, entry)
  }
}

provide(kanbanContextKey, {
  columns: activeBoardColumns,
  availableTags: computed(() => activeBoardTags.value),
  isShared: activeBoardIsShared,
  boardMembers: activeBoardMembers,
  createTag,
  openEditTaskDialog,
  updateTask,
  deleteTask,
  startTimer,
  pauseTimer,
  stopTimer,
  setTaskTotal,
  onTimerExpired: handleTimerExpired,
})

watch(boardsError, (value) => {
  if (value) notify.error(value, 'Unable to load boards')
}, { immediate: true })

watch(feedError, (value) => {
  if (value) notify.error(value, 'Unable to load task feed')
}, { immediate: true })

watch(userTagsError, (value) => {
  if (value) notify.error(value, 'Unable to load tags')
}, { immediate: true })
</script>

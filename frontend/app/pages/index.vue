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
  applyTaskUpdates,
  getBoardMembers,
  isBoardShared,
  sameId,
  useKanbanTaskActions,
} from '~/composables/useKanbanTaskActions'

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
] = await Promise.all([
  useAsyncData('kanban-boards', () => kanbanApi.listBoards(), {
    default: () => [],
    deep: true,
  }),
  useAsyncData('kanban-task-feed', () => kanbanApi.listTaskFeed(), {
    default: () => [],
    deep: true,
  }),
])

const refreshAll = async (): Promise<void> => {
  await Promise.all([refreshBoards(), refreshFeed()])
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

const reindexTasks = (tasks: KanbanTaskDto[]): void => {
  tasks.forEach((task, index) => {
    task.position = index
  })
}

const findFeedTask = (taskId: string | number): TaskFeedItemDto | undefined => {
  return feedTasks.value.find(task => sameId(task.id, taskId))
}

const findBoardTaskLocation = (taskId: string | number, boardId?: string | number) => {
  const targetBoards = boardId != null
    ? boards.value.filter(board => sameId(board.id, boardId))
    : boards.value
  for (const board of targetBoards) {
    for (const column of board.columns || []) {
      const index = (column.tasks || []).findIndex(task => sameId(task.id, taskId))
      if (index !== -1) {
        return {
          board,
          column,
          index,
          task: column.tasks[index]!,
        }
      }
    }
  }
  return undefined
}

const syncUpdatedTask = (feedTask: TaskFeedItemDto, updatedFromServer?: KanbanTaskDto): void => {
  const timestamp = updatedFromServer?.updatedAt ?? new Date().toISOString()
  feedTask.updatedAt = timestamp
  if (updatedFromServer?.totalSeconds !== undefined) {
    feedTask.totalSeconds = updatedFromServer.totalSeconds
  }
  if (updatedFromServer?.reminderAt !== undefined) {
    feedTask.reminderAt = updatedFromServer.reminderAt
  }
  if (updatedFromServer?.reminderSentAt !== undefined) {
    feedTask.reminderSentAt = updatedFromServer.reminderSentAt
  }

  const parentBoard = boards.value.find(board => sameId(board.id, feedTask.boardId))
  const matchedColumn = parentBoard?.columns?.find(col => sameId(col.id, feedTask.columnId))
  if (matchedColumn) {
    feedTask.columnTitle = matchedColumn.title
  }

  const boardLocation = findBoardTaskLocation(feedTask.id, feedTask.boardId)
  if (boardLocation) {
    const boardTask = boardLocation.task
    applyTaskUpdates(boardTask, feedTask)
    boardTask.columnId = feedTask.columnId
    boardTask.position = feedTask.position
    boardTask.totalSeconds = feedTask.totalSeconds
    boardTask.updatedAt = timestamp
    boardTask.recurringTaskId = feedTask.recurringTaskId
    boardTask.recurringTask = feedTask.recurringTask
    boardTask.reminderAt = feedTask.reminderAt
    boardTask.reminderSentAt = feedTask.reminderSentAt
    boardTask.timer = feedTask.timer ? { ...feedTask.timer } : null
  }
}

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
  findTask: findFeedTask,
  availableTags: activeBoardTags,
  createSnapshot: () => {
    const feedSnapshot = JSON.parse(JSON.stringify(feedTasks.value)) as TaskFeedItemDto[]
    const boardsSnapshot = JSON.parse(JSON.stringify(boards.value)) as KanbanBoardDto[]
    const activeTaskId = activeTask.value?.id
    return () => {
      feedTasks.value = feedSnapshot
      boards.value = boardsSnapshot
      if (activeTaskId != null) {
        activeTask.value = feedTasks.value.find(t => sameId(t.id, activeTaskId)) ?? null
      }
    }
  },
  moveTaskLocally: (task, destinationColumnId) => {
    const feedTask = task as TaskFeedItemDto
    const board = boards.value.find(b => sameId(b.id, feedTask.boardId))
    const destCol = board?.columns?.find(col => sameId(col.id, destinationColumnId))
    if (!board || !destCol) return null

    feedTask.columnId = destCol.id
    feedTask.columnTitle = destCol.title

    let existingBoardTask: KanbanTaskDto | undefined
    for (const col of board.columns) {
      const idx = (col.tasks || []).findIndex(t => sameId(t.id, feedTask.id))
      if (idx !== -1) {
        existingBoardTask = col.tasks.splice(idx, 1)[0]
        reindexTasks(col.tasks)
        break
      }
    }

    if (!destCol.tasks) destCol.tasks = []
    const targetPosition = destCol.tasks.length
    const movedBoardTask: KanbanTaskDto = existingBoardTask
      ? { ...existingBoardTask, columnId: destCol.id, position: targetPosition }
      : { ...feedTask, columnId: destCol.id, position: targetPosition }
    destCol.tasks.push(movedBoardTask)
    reindexTasks(destCol.tasks)
    feedTask.position = targetPosition
    return targetPosition
  },
  removeTaskLocally: (taskId) => {
    const feedIndex = feedTasks.value.findIndex(t => sameId(t.id, taskId))
    if (feedIndex === -1) return false
    const [removed] = feedTasks.value.splice(feedIndex, 1)
    if (removed) {
      const location = findBoardTaskLocation(taskId, removed.boardId)
      if (location) {
        location.column.tasks.splice(location.index, 1)
        reindexTasks(location.column.tasks)
      }
    }
    if (activeTask.value && sameId(activeTask.value.id, taskId)) {
      activeTask.value = null
    }
    return true
  },
  onAfterTaskUpdate: (task, updatedFromServer) => {
    syncUpdatedTask(task as TaskFeedItemDto, updatedFromServer)
  },
  onAfterTimerChange: (task) => {
    const feedTask = task as TaskFeedItemDto
    const timestamp = new Date().toISOString()
    feedTask.updatedAt = timestamp
    const boardTask = findBoardTaskLocation(feedTask.id, feedTask.boardId)?.task
    if (boardTask) {
      boardTask.timer = feedTask.timer ? { ...feedTask.timer } : null
      boardTask.updatedAt = timestamp
    }
  },
  onAfterTaskTotalChange: (taskId, totalSeconds) => {
    const timestamp = new Date().toISOString()
    const feedTask = findFeedTask(taskId)
    if (feedTask) {
      feedTask.updatedAt = timestamp
    }
    const boardTask = findBoardTaskLocation(taskId, feedTask?.boardId)?.task
    if (boardTask) {
      boardTask.totalSeconds = totalSeconds
      boardTask.updatedAt = timestamp
    }
  },
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
  moveTask: () => {},
  openCreateTaskDialog: () => {},
  openEditTaskDialog,
  createTask: () => {},
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
</script>

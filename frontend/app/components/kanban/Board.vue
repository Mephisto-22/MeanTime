<template>
  <Card
    data-testid="kanban-board"
    class="flex flex-col flex-1 min-h-0 border border-surface-200 dark:border-surface-800 shadow-sm"
    :pt="{ body: 'flex flex-col flex-1 min-h-0 p-4 gap-3', content: 'flex flex-col flex-1 min-h-0' }"
  >
    <template #title>
      <Toolbar class="border-none bg-transparent p-0">
        <template #start>
          <div class="flex flex-col gap-1">
            <span v-if="boardTitle" data-testid="board-title" class="text-xl font-bold tracking-tight text-surface-900 dark:text-surface-0">{{ boardTitle }}</span>
            <p
              v-if="boardDescription"
              data-testid="board-description"
              class="text-sm font-normal text-surface-600 dark:text-surface-400"
            >
              {{ boardDescription }}
            </p>
          </div>
        </template>
        <template #end>
          <div class="flex items-center gap-3">
            <slot name="actions" />
            <Button
              data-testid="add-column-button"
              label="Add Column"
              icon="pi pi-plus"
              severity="secondary"
              outlined
              class="h-fit shrink-0"
              @click="openCreateColumnDialog"
            />
          </div>
        </template>
      </Toolbar>
    </template>
    <template #content>
      <!-- Horizontal Column Track -->
      <div
        data-testid="kanban-columns-track"
        class="flex gap-4 overflow-x-auto flex-1 min-h-0 pb-1"
      >
        <template v-for="column in sortedColumns" :key="column.id">
          <slot name="column" :column="column">
            <KanbanColumn :column="column" @edit="openEditColumnDialog">
              <template v-if="$slots.task" #task="taskSlotProps">
                <slot name="task" v-bind="taskSlotProps" />
              </template>
            </KanbanColumn>
          </slot>
        </template>
      </div>

      <!-- Column Dialog -->
      <ColumnFormDialog
        v-model:visible="columnDialogVisible"
        :board-id="props.board.id"
        :column="selectedColumn"
        @created="handleColumnCreated"
        @updated="handleColumnUpdated"
        @deleted="handleColumnDeleted"
      />

      <!-- Centralized Task Dialog -->
      <KanbanTaskDialog
        v-model:visible="isTaskDialogOpen"
        :mode="dialogMode"
        :task="activeTask"
        :column-id="activeColumnId"
        @save="handleSaveTask"
        @delete="handleDeleteTask"
        @timer-expired="handleDialogTimerExpired"
      />

      <!-- Board-Scoped Live Chat Sidebar (only on shared boards) -->
      <ChatSidebar
        v-if="isShared"
        :board-title="boardTitle"
      />
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, watch, provide, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type {
  KanbanBoardDto,
  KanbanColumnDto,
  KanbanColumnSummary,
  KanbanTaskDto,
  TaskMoveContext,
  TagDto,
  TaskTimeEntryDto,
} from '~/api/kanban'
import type { UserOut } from '~/api/friends'
import { kanbanContextKey, kanbanApi } from '~/api/kanban'
import ColumnFormDialog from '~/components/kanban/ColumnFormDialog.vue'
import ChatSidebar from '~/components/chat/ChatSidebar.vue'
import { useBoardChat } from '~/composables/useBoardChat'
import { useBoardEvents, type BoardEvent } from '~/composables/useBoardEvents'
import {
  getBoardMembers,
  isBoardShared,
  reindexTasks,
  sameId,
  syncTaskFields,
  useKanbanTaskActions,
} from '~/composables/useKanbanTaskActions'

const notify = useNotifications()

const props = defineProps<{
  board: KanbanBoardDto
}>()

const boardTitle = ref(props.board.title)
const boardDescription = ref(props.board.description)

watch(
  () => [props.board.title, props.board.description],
  ([title, description]) => {
    boardTitle.value = title ?? ''
    boardDescription.value = description ?? ''
  },
)

defineSlots<{
  column?: (props: { column: KanbanColumnDto }) => any
  task?: (props: { task: KanbanTaskDto }) => any
  actions?: () => any
}>()

const localColumns = ref<KanbanColumnDto[]>([])
const availableTags = ref<TagDto[]>([])
const columnDialogVisible = ref(false)
const selectedColumn = ref<KanbanColumnDto | null>(null)

const boardChat = useBoardChat(() => props.board.id)

const loadTags = async (): Promise<void> => {
  try {
    const tags = await kanbanApi.listTags(props.board.id)
    availableTags.value = tags || []
  } catch (err) {
    notify.error(err, 'Unable to fetch tags')
  }
}

watch(
  () => props.board.columns,
  (newColumns) => {
    const raw = JSON.parse(JSON.stringify(newColumns || []))
    raw.forEach((col: KanbanColumnDto) => {
      col.tasks?.forEach((t: KanbanTaskDto) => {
        if (t.columnId == null) {
          t.columnId = col.id
        }
      })
    })
    localColumns.value = raw
  },
  { immediate: true, deep: true },
)

const sortedColumns = computed(() => {
  return [...localColumns.value].sort((a, b) => a.position - b.position)
})

const columnRegistry = computed<KanbanColumnSummary[]>(() => {
  return sortedColumns.value.map(col => ({
    id: col.id,
    title: col.title,
    position: col.position,
  }))
})

const findColumn = (columnId: string | number) =>
  localColumns.value.find(col => sameId(col.id, columnId))

const findTaskLocation = (taskId: string | number) => {
  for (const column of localColumns.value) {
    const index = column.tasks.findIndex(task => sameId(task.id, taskId))

    if (index !== -1) {
      return {
        column,
        index,
        task: column.tasks[index]!,
      }
    }
  }

  return undefined
}

const upsertTask = (incoming: KanbanTaskDto): void => {
  const existing = findTaskLocation(incoming.id)
  const destination = findColumn(incoming.columnId)

  if (!destination) return

  if (existing) {
    existing.column.tasks.splice(existing.index, 1)
  }

  const position = Math.max(
    0,
    Math.min(incoming.position ?? destination.tasks.length, destination.tasks.length),
  )

  destination.tasks.splice(position, 0, {
    ...existing?.task,
    ...incoming,
    columnId: destination.id,
  })

  reindexTasks(destination.tasks)

  if (existing && existing.column !== destination) {
    reindexTasks(existing.column.tasks)
  }
}

const applyTaskMove = (
  incoming: KanbanTaskDto,
  destinationColumnId: string | number,
  position: number,
): void => {
  const destination = findColumn(destinationColumnId)
  if (!destination) return

  const existing = findTaskLocation(incoming.id)

  if (existing) {
    existing.column.tasks.splice(existing.index, 1)
    reindexTasks(existing.column.tasks)
  }

  const updatedTask = {
    ...existing?.task,
    ...incoming,
    columnId: destination.id,
  }

  const targetPosition = Math.max(
    0,
    Math.min(position, destination.tasks.length),
  )

  destination.tasks.splice(targetPosition, 0, updatedTask)
  reindexTasks(destination.tasks)
}


const handleBoardEvent = (event: BoardEvent): void => {
  const auth = useAuthStore()

  // ignore events published by the currently authenticated user as their UI is already
  // updated through local state
  if (String(event.actorId) === String(auth.user?.id)) {
    return
  }

  const data = event.data

  switch (event.type) {
    case 'board.updated': {
      if (data.board) {
        boardTitle.value = data.board.title
        boardDescription.value = data.board.description
      }
      break
    }

    case 'board.deleted': {
      void navigateTo('/boards')
      break
    }

    case 'board.access_revoked': {
      const auth = useAuthStore()

      if (String(data.userId) === String(auth.user?.id)) {
        void navigateTo('/boards')
      }
      break
    }

    case 'column.created': {
      const incoming = data.column as KanbanColumnDto

      if (!findColumn(incoming.id)) {
        localColumns.value.push({
          ...incoming,
          tasks: incoming.tasks ?? [],
        })
      }
      break
    }

    case 'column.updated': {
      const incoming = data.column as KanbanColumnDto
      const existing = findColumn(incoming.id)

      if (existing) {
        Object.assign(existing, incoming)
      }
      break
    }

    case 'column.deleted': {
      localColumns.value = localColumns.value.filter(
        column => !sameId(column.id, data.columnId),
      )
      break
    }

    case 'task.created': {
      upsertTask(data.task as KanbanTaskDto)
      break
    }

    case 'task.updated': {
      const incoming = data.task as KanbanTaskDto
      const existing = findTaskLocation(incoming.id)

      if (existing) {
        Object.assign(existing.task, incoming)
      } else {
        upsertTask(incoming)
      }
      break
    }

    case 'task.deleted': {
      const existing = findTaskLocation(data.taskId)

      if (existing) {
        existing.column.tasks.splice(existing.index, 1)
        reindexTasks(existing.column.tasks)
      }
      break
    }

    case 'task.moved': {
      applyTaskMove(
        data.task as KanbanTaskDto,
        data.destinationColumnId,
        data.position,
      )
      break
    }

    case 'task.timer_updated': {
      const existing = findTaskLocation(data.taskId)

      if (existing) {
        existing.task.timer = {
          ...existing.task.timer,
          ...data.timer,
          taskId: data.taskId,
        }
      }
      break
    }

    case 'time_entry.created':
    case 'time_entry.updated':
    case 'time_entry.deleted': {
      void refreshTaskTotal(data.taskId)
      break
    }

    case 'chat.message_created': {
      if (data.message) {
        boardChat.receiveMessage(data.message)
      }
      break
    }
  }
}

const handleBoardReconnect = async (): Promise<void> => {
  await refreshNuxtData()
  if (boardChat.isOpen.value) {
    await boardChat.loadHistory()
  }
}

// initialize SSE board event handling
const boardEvents = useBoardEvents({
  boardId: props.board.id,
  onEvent: handleBoardEvent,
  onReconnect: handleBoardReconnect,
})

watch(
  () => props.board.id,
  () => loadTags(),
  { immediate: true },
)

onMounted(() => {
  void boardEvents.connect()
})

onBeforeUnmount(() => {
  boardEvents.stop()
})

const insertTaskAtPosition = (
  tasks: KanbanTaskDto[],
  task: KanbanTaskDto,
  targetPosition: number,
): void => {
  const clampedPosition = Math.max(0, Math.min(targetPosition, tasks.length))
  tasks.splice(clampedPosition, 0, task)
}

const handleMoveTask = async (req: TaskMoveContext): Promise<void> => {
  await nextTick()

  const fromCol = localColumns.value.find(col => sameId(col.id, req.fromColumnId))
  const toCol = localColumns.value.find(col => sameId(col.id, req.toColumnId))

  if (!fromCol || !toCol) {
    return
  }

  let task = fromCol.tasks.find(t => sameId(t.id, req.taskId))
  if (!task) {
    task = toCol.tasks.find(t => sameId(t.id, req.taskId))
  }
  if (!task) {
    for (const col of localColumns.value) {
      task = col.tasks.find(t => sameId(t.id, req.taskId))
      if (task) break
    }
  }

  if (!task) {
    return
  }

  if (sameId(req.fromColumnId, req.toColumnId)) {
    const currentPosition = fromCol.tasks.findIndex(t => sameId(t.id, req.taskId))
    if (currentPosition !== -1 && currentPosition !== req.targetPosition) {
      fromCol.tasks.splice(currentPosition, 1)
      insertTaskAtPosition(fromCol.tasks, task, req.targetPosition)
    }
    reindexTasks(fromCol.tasks)
  } else {
    const fromPosition = fromCol.tasks.findIndex(t => sameId(t.id, req.taskId))
    const toPosition = toCol.tasks.findIndex(t => sameId(t.id, req.taskId))

    if (fromPosition !== -1) {
      fromCol.tasks.splice(fromPosition, 1)
    }

    if (toPosition === -1) {
      insertTaskAtPosition(toCol.tasks, task, req.targetPosition)
    } else if (toPosition !== req.targetPosition) {
      toCol.tasks.splice(toPosition, 1)
      insertTaskAtPosition(toCol.tasks, task, req.targetPosition)
    }

    task.columnId = req.toColumnId

    reindexTasks(fromCol.tasks)
    reindexTasks(toCol.tasks)
  }

  try {
    await kanbanApi.moveTask(req.taskId, {
      toColumnId: req.toColumnId,
      targetPosition: req.targetPosition,
    })
  } catch (err) {
    notify.error(err, 'Unable to move task')
  }
}

const isTaskDialogOpen = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const activeTask = ref<KanbanTaskDto | null>(null)
const activeColumnId = ref<string | number | null>(null)

const openCreateTaskDialog = (columnId: string | number): void => {
  dialogMode.value = 'create'
  activeTask.value = null
  activeColumnId.value = columnId
  isTaskDialogOpen.value = true
}

const openEditTaskDialog = (task: KanbanTaskDto): void => {
  dialogMode.value = 'edit'
  activeTask.value = task
  let colId = task.columnId
  if (colId == null) {
    const containingCol = localColumns.value.find(c => c.tasks.some(t => sameId(t.id, task.id)))
    if (containingCol) colId = containingCol.id
  }
  if (task.columnId == null && colId != null) {
    task.columnId = colId
  }
  activeColumnId.value = colId ?? null
  isTaskDialogOpen.value = true
}

const closeTaskDialog = (): void => {
  isTaskDialogOpen.value = false
}

const handleCreateTask = async (
  columnId: string | number,
  payload: Partial<KanbanTaskDto> & { tag_ids?: Array<string | number> },
): Promise<void> => {
  const targetCol = localColumns.value.find(col => sameId(col.id, columnId))
  if (!targetCol) return

  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const optimisticTask: KanbanTaskDto = {
    id: tempId,
    title: payload.title ?? '',
    description: payload.description ?? '',
    position: targetCol.tasks.length,
    columnId,
    priority: payload.priority ?? null,
    tags: payload.tags ?? [],
    dueAt: payload.dueAt ?? null,
    reminderOffsetSeconds: payload.reminderOffsetSeconds ?? null,
    recurringTaskId: null,
    recurringTask: null,
  }
  targetCol.tasks.push(optimisticTask)

  try {
    const createPayload: any = {
      title: payload.title,
      description: payload.description,
    }
    if (payload.priority !== undefined) {
      createPayload.priority = payload.priority
    }
    if (payload.tagIds !== undefined) {
      createPayload.tagIds = payload.tagIds
    }
    if (payload.dueAt !== undefined) {
      createPayload.dueAt = payload.dueAt
    }
    if (payload.reminderOffsetSeconds !== undefined) {
      createPayload.reminderOffsetSeconds = payload.reminderOffsetSeconds
    }
    if (payload.recurrence) {
      createPayload.recurrence = payload.recurrence
    }
    if (payload.timer?.mode && payload.timer.mode !== 'NONE') {
      createPayload.timerMode = payload.timer.mode
      createPayload.targetDurationSeconds = payload.timer.targetDurationSeconds
    }

    const createdTask = await kanbanApi.createTask(columnId, createPayload)
    notify.success('Task created.')

    if (createdTask) {
      const alreadyReceived = findTaskLocation(createdTask.id)
      const optimisticLocation = findTaskLocation(tempId)

      if (optimisticLocation && alreadyReceived) {
        // SSE already inserted the real task.
        // Remove the temporary optimistic task.
        optimisticLocation.column.tasks.splice(
          optimisticLocation.index,
          1,
        )

        reindexTasks(optimisticLocation.column.tasks)
      } else if (optimisticLocation) {
        // API response arrived before the SSE event.
        // Replace the temporary ID with the real ID.
        optimisticLocation.task.id = createdTask.id
        optimisticLocation.task.columnId =
          createdTask.columnId ?? optimisticLocation.task.columnId
        optimisticLocation.task.position =
          createdTask.position ?? optimisticLocation.task.position
        syncTaskFields(optimisticLocation.task, createdTask)
      }
    }
  } catch (err) {
    let containingCol = targetCol
    let taskPosition = containingCol.tasks.findIndex(t => sameId(t.id, tempId))
    if (taskPosition === -1) {
      for (const col of localColumns.value) {
        taskPosition = col.tasks.findIndex(t => sameId(t.id, tempId))
        if (taskPosition !== -1) {
          containingCol = col
          break
        }
      }
    }
    if (taskPosition !== -1) {
      containingCol.tasks.splice(taskPosition, 1)
      reindexTasks(containingCol.tasks)
    }
    notify.error(err, 'Unable to create task')
  }
}

const findTaskById = (taskId: string | number): KanbanTaskDto | undefined => {
  return findTaskLocation(taskId)?.task
}

const {
  updateTask: handleUpdateTask,
  deleteTask: handleDeleteTask,
  saveTask: handleSaveTask,
  createTag: handleCreateTag,
  startTimer: handleStartTimer,
  pauseTimer: handlePauseTimer,
  stopTimer: handleStopTimer,
  setTaskTotal: handleSetTaskTotal,
  refreshTaskTotal,
  handleTimerExpired,
} = useKanbanTaskActions({
  findTask: findTaskById,
  availableTags,
  onCreateTask: handleCreateTask,
  createSnapshot: () => {
    const columnsSnapshot = JSON.parse(JSON.stringify(localColumns.value))
    return () => {
      localColumns.value = columnsSnapshot
    }
  },
  moveTaskLocally: (task, destinationColumnId) => {
    const sourceLocation = findTaskLocation(task.id)
    const destCol = findColumn(destinationColumnId)
    if (!sourceLocation || !destCol) return null

    const targetPosition = destCol.tasks.length
    sourceLocation.column.tasks.splice(sourceLocation.index, 1)
    reindexTasks(sourceLocation.column.tasks)

    task.columnId = destCol.id
    destCol.tasks.push(task)
    reindexTasks(destCol.tasks)
    return targetPosition
  },
  removeTaskLocally: (taskId) => {
    const location = findTaskLocation(taskId)
    if (!location) return false
    location.column.tasks.splice(location.index, 1)
    reindexTasks(location.column.tasks)
    return true
  },
})

const handleDialogTimerExpired = (entry: TaskTimeEntryDto): void => {
  const task = activeTask.value
  if (task) {
    handleTimerExpired(task, entry)
  }
}

const openCreateColumnDialog = () => {
  console.log('Add Column clicked')

  selectedColumn.value = null
  columnDialogVisible.value = true

  console.log('Dialog visibility:', columnDialogVisible.value)
}

const openEditColumnDialog = (column: KanbanColumnDto) => {
  selectedColumn.value = column
  columnDialogVisible.value = true
}

const handleColumnCreated = (column: KanbanColumnDto) => {
  const existing = findColumn(column.id)

  if (!existing) {
    localColumns.value.push({
      ...column,
      tasks: column.tasks ?? [],
    })
  }

  notify.success('Column created.')
}

const handleColumnUpdated = (updatedColumn: KanbanColumnDto) => {
  const index = localColumns.value.findIndex(
    column => sameId(column.id, updatedColumn.id),
  )

  if (index !== -1) {
    const existingColumn = localColumns.value[index]

    if (!existingColumn) return

    localColumns.value[index] = {
      ...existingColumn,
      ...updatedColumn,
      tasks: existingColumn.tasks ?? updatedColumn.tasks ?? [],
    }

    notify.success('Column updated.')
  }
}

const handleColumnDeleted = (columnId: string | number) => {
  localColumns.value = localColumns.value.filter(
    column => !sameId(column.id, columnId),
  )

  notify.success('Column deleted.')
}

const isShared = computed<boolean>(() => isBoardShared(props.board))

watch(isShared, (shared) => {
  if (!shared) {
    boardChat.close()
  }
})

const boardMembers = computed<UserOut[]>(() => getBoardMembers(props.board))

provide(kanbanContextKey, {
  columns: columnRegistry,
  availableTags: computed(() => availableTags.value),
  isShared,
  boardMembers,
  createTag: handleCreateTag,
  moveTask: handleMoveTask,
  openCreateTaskDialog,
  openEditTaskDialog,
  createTask: handleCreateTask,
  updateTask: handleUpdateTask,
  deleteTask: handleDeleteTask,
  startTimer: handleStartTimer,
  pauseTimer: handlePauseTimer,
  stopTimer: handleStopTimer,
  setTaskTotal: handleSetTaskTotal,
  onTimerExpired: handleTimerExpired,
  boardChat,
})

defineExpose({
  localColumns,
  availableTags,
  boardChat,
  handleBoardEvent,
  handleBoardReconnect,
  handleMoveTask,
  isTaskDialogOpen,
  dialogMode,
  activeTask,
  activeColumnId,
  openCreateTaskDialog,
  openEditTaskDialog,
  closeTaskDialog,
  loadTags,
  handleCreateTag,
  handleCreateTask,
  handleUpdateTask,
  handleDeleteTask,
  handleSaveTask,
  handleStartTimer,
  handlePauseTimer,
  handleStopTimer,
  handleTimerExpired,
})
</script>

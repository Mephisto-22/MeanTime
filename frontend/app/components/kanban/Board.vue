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
  TaskDialogSavePayload,
  TagDto,
  TaskPriorityType,
  TaskTimerDto,
  TaskTimeEntryDto,
} from '~/api/kanban'
import type { UserOut } from '~/api/friends'
import { kanbanContextKey, kanbanApi } from '~/api/kanban'
import { sumEntryDurations } from '~/composables/useTaskTimer'
import ColumnFormDialog from '~/components/kanban/ColumnFormDialog.vue'
import { useBoardEvents, type BoardEvent } from '~/composables/useBoardEvents'

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

const sameId = (a: string | number, b: string | number): boolean => String(a) === String(b)

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
    Math.min(incoming.position, destination.tasks.length),
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
  }
}

// initialize SSE board event handling
const boardEvents = useBoardEvents({
  boardId: props.board.id,
  onEvent: handleBoardEvent,
  onReconnect: async () => {
    await refreshNuxtData()
  },
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

const reindexTasks = (tasks: KanbanTaskDto[]): void => {
  tasks.forEach((t, i) => {
    t.position = i
  })
}

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
  }
  targetCol.tasks.push(optimisticTask)

  try {
    const createdTask = await kanbanApi.createTask(columnId, {
      title: payload.title,
      description: payload.description,
      priority: payload.priority,
      tagIds: payload.tagIds,
    })
    notify.success('Task created.')

    let taskInCol = targetCol.tasks.find(t => sameId(t.id, tempId))
    if (!taskInCol) {
      for (const col of localColumns.value) {
        taskInCol = col.tasks.find(t => sameId(t.id, tempId))
        if (taskInCol) break
      }
    }
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
        optimisticLocation.task.priority =
          createdTask.priority ?? optimisticLocation.task.priority
        optimisticLocation.task.tags =
          createdTask.tags ?? optimisticLocation.task.tags
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

const applyTaskUpdates = (
  target: KanbanTaskDto,
  source: {
    title?: string
    description?: string
    priority?: TaskPriorityType
    tags?: TagDto[]
  },
): void => {
  if (source.title !== undefined) target.title = source.title
  if (source.description !== undefined) target.description = source.description
  if (source.priority !== undefined) target.priority = source.priority
  if (source.tags !== undefined) target.tags = source.tags
}

const handleUpdateTask = async (
  taskId: string | number,
  payload: Omit<Partial<KanbanTaskDto>, 'columnId'> & {
    columnId?: string | number | null
  },
): Promise<void> => {
  let sourceCol: KanbanColumnDto | undefined
  let sourceIndex = -1
  let targetTask: KanbanTaskDto | undefined

  for (const col of localColumns.value) {
    const idx = col.tasks.findIndex(t => sameId(t.id, taskId))
    if (idx !== -1) {
      sourceCol = col
      sourceIndex = idx
      targetTask = col.tasks[idx]
      break
    }
  }

  if (!sourceCol || !targetTask || sourceIndex === -1) return

  const columnsSnapshot = JSON.parse(JSON.stringify(localColumns.value))

  const destinationColumnId =
    payload.columnId != null
      ? payload.columnId
      : (targetTask.columnId ?? sourceCol.id)
  const isColumnChanged = !sameId(sourceCol.id, destinationColumnId)
  const destCol = isColumnChanged
    ? localColumns.value.find(col => sameId(col.id, destinationColumnId))
    : sourceCol

  if (!destCol) {
    notify.error(new Error('Destination column not found'), 'Unable to update task')
    return
  }

  const targetPosition = destCol.tasks.length

  // Optimistic update of task fields
  applyTaskUpdates(targetTask, payload)

  // Optimistic column relocation
  if (isColumnChanged) {
    sourceCol.tasks.splice(sourceIndex, 1)
    reindexTasks(sourceCol.tasks)

    targetTask.columnId = destCol.id
    destCol.tasks.push(targetTask)
    reindexTasks(destCol.tasks)
  }

  try {
    const updatePayload: any = {
      title: payload.title,
      description: payload.description,
    }
    if (payload.priority !== undefined) {
      updatePayload.priority = payload.priority
    }
    if (payload.tagIds !== undefined) {
      updatePayload.tagIds = payload.tagIds
    }

    const updatePromise = kanbanApi.updateTask(taskId, updatePayload)
    let updated: KanbanTaskDto | undefined

    if (isColumnChanged) {
      const movePromise = kanbanApi.moveTask(taskId, {
        toColumnId: destCol.id,
        targetPosition: targetPosition,
      })
      const [updateResult] = await Promise.all([updatePromise, movePromise])
      updated = updateResult
    } else {
      updated = await updatePromise
    }

    notify.success('Task updated.')
    if (updated) {
      applyTaskUpdates(targetTask, updated)
      if (updated.position !== undefined) {
        targetTask.position = updated.position
      }
      if (updated.columnId != null) {
        targetTask.columnId = updated.columnId
      }
    }
  } catch (err) {
    localColumns.value = columnsSnapshot
    notify.error(err, 'Unable to update task')
  }
}

const handleDeleteTask = async (taskId: string | number): Promise<void> => {
  let targetCol: KanbanColumnDto | undefined
  let targetIndex = -1
  let deletedTask: KanbanTaskDto | undefined

  for (const col of localColumns.value) {
    const idx = col.tasks.findIndex(t => sameId(t.id, taskId))
    if (idx !== -1) {
      targetCol = col
      targetIndex = idx
      deletedTask = col.tasks[idx]
      break
    }
  }

  if (!targetCol || !deletedTask || targetIndex === -1) return

  const originalColId = targetCol.id
  const originalPosition = targetIndex
  const snapshotTask: KanbanTaskDto = { ...deletedTask }

  // Optimistically remove from column
  targetCol.tasks.splice(targetIndex, 1)
  reindexTasks(targetCol.tasks)

  try {
    await kanbanApi.deleteTask(taskId)
    notify.success('Task deleted.')
  } catch (err) {
    // Restore task to original column and position
    let restoreCol = localColumns.value.find(col => sameId(col.id, originalColId)) || targetCol
    const restorePos = Math.max(0, Math.min(originalPosition, restoreCol.tasks.length))
    restoreCol.tasks.splice(restorePos, 0, snapshotTask)
    reindexTasks(restoreCol.tasks)

    notify.error(err, 'Unable to delete task')
  }
}

const handleSaveTask = async (savePayload: TaskDialogSavePayload): Promise<void> => {
  if (savePayload.mode === 'create' && savePayload.columnId != null) {
    await handleCreateTask(savePayload.columnId, {
      title: savePayload.title,
      description: savePayload.description,
      priority: savePayload.priority,
      tags: savePayload.tags,
      tagIds: savePayload.tagIds,
    })
  } else if (savePayload.mode === 'edit' && savePayload.taskId != null) {
    await handleUpdateTask(savePayload.taskId, {
      title: savePayload.title,
      description: savePayload.description,
      priority: savePayload.priority,
      tags: savePayload.tags,
      tagIds: savePayload.tagIds,
      columnId: savePayload.columnId,
    })
    if (savePayload.timer) {
      try {
        const updatedTimer = await kanbanApi.updateTaskTimer(savePayload.taskId, savePayload.timer)
        const targetTask = findTaskById(savePayload.taskId)
        if (targetTask && updatedTimer) {
          targetTask.timer = {
            ...targetTask.timer,
            ...updatedTimer,
            taskId: savePayload.taskId,
          }
        }
      } catch (err) {
        notify.error(err, 'Unable to update timer configuration')
      }
    }
  }
}

const handleCreateTag = async (payload: { name: string } | string): Promise<TagDto> => {
  const name = typeof payload === 'string' ? payload : payload.name
  try {
    const created = await kanbanApi.createTag({ name })
    const exists = availableTags.value.some(
      t => sameId(t.id, created.id) || t.name.toLowerCase() === created.name.toLowerCase(),
    )
    if (!exists) {
      availableTags.value.push(created)
    }
    return created
  } catch (err) {
    notify.error(err, 'Unable to create tag')
    throw err
  }
}

const findTaskById = (taskId: string | number): KanbanTaskDto | undefined => {
  for (const col of localColumns.value) {
    const t = col.tasks.find(task => sameId(task.id, taskId))
    if (t) return t
  }
  return undefined
}

const handleStartTimer = async (taskId: string | number, defaultTimer?: Partial<TaskTimerDto>): Promise<void> => {
  const task = findTaskById(taskId)
  if (!task) return

  const nowIso = new Date().toISOString()
  const isResuming = task.timer?.state === 'PAUSED' && Boolean(task.timer?.startedAt)
  const sessionStartedAt = isResuming ? task.timer!.startedAt : (defaultTimer?.startedAt || nowIso)

  const updatedTimer: TaskTimerDto = {
    taskId,
    mode: defaultTimer?.mode || task.timer?.mode || 'COUNT_DOWN',
    targetDurationSeconds: defaultTimer?.targetDurationSeconds ?? task.timer?.targetDurationSeconds ?? 1500,
    state: 'RUNNING',
    startedAt: sessionStartedAt,
    lastResumedAt: nowIso,
    lastPausedAt: null,
    elapsedSeconds: task.timer?.elapsedSeconds || 0,
  }

  task.timer = { ...updatedTimer }

  try {
    const persisted = await kanbanApi.updateTaskTimer(taskId, updatedTimer)
    if (persisted) {
      task.timer = {
        ...task.timer,
        ...persisted,
        taskId,
      }
    }
  } catch (err) {
    notify.error(err, 'Unable to start timer')
  }
}

const handlePauseTimer = async (taskId: string | number): Promise<void> => {
  const task = findTaskById(taskId)
  if (!task || !task.timer) return

  const currentTimer = task.timer
  const nowIso = new Date().toISOString()
  let accumulated = currentTimer.elapsedSeconds || 0
  const anchorTime = currentTimer.lastResumedAt || currentTimer.startedAt
  if (currentTimer.state === 'RUNNING' && anchorTime) {
    const delta = Math.max(0, Math.floor((Date.now() - new Date(anchorTime).getTime()) / 1000))
    accumulated += delta
  }

  const pausedTimer: TaskTimerDto = {
    ...currentTimer,
    state: 'PAUSED',
    startedAt: currentTimer.startedAt,
    lastResumedAt: null,
    lastPausedAt: nowIso,
    elapsedSeconds: accumulated,
  }

  task.timer = { ...pausedTimer }

  try {
    const persisted = await kanbanApi.updateTaskTimer(taskId, pausedTimer)
    if (persisted) {
      task.timer = {
        ...task.timer,
        ...persisted,
        taskId,
      }
    }
  } catch (err) {
    notify.error(err, 'Unable to pause timer')
  }
}

const recentAlerts = new Map<string | number, number>()
const recentlyStoppedTasks = new Map<string | number, number>()

const handleStopTimer = async (taskId: string | number, entry?: TaskTimeEntryDto): Promise<void> => {
  const lastStopped = recentlyStoppedTasks.get(taskId) ?? 0
  const now = Date.now()
  if (now - lastStopped < 2000) {
    return
  }
  recentlyStoppedTasks.set(taskId, now)

  const task = findTaskById(taskId)
  if (!task || !task.timer) return
  if (task.timer.state === 'IDLE') return

  const currentTimer = task.timer
  let totalElapsed = currentTimer.elapsedSeconds || 0
  const anchorTime = currentTimer.lastResumedAt || currentTimer.startedAt
  if (currentTimer.state === 'RUNNING' && anchorTime) {
    const delta = Math.max(0, Math.floor((Date.now() - new Date(anchorTime).getTime()) / 1000))
    totalElapsed += delta
  }

  const idleTimer: TaskTimerDto = {
    ...currentTimer,
    state: 'IDLE',
    startedAt: null,
    lastResumedAt: null,
    lastPausedAt: null,
    elapsedSeconds: totalElapsed,
  }

  task.timer = {
    ...idleTimer,
    elapsedSeconds: 0,
  }

  if (entry) {
    handleTimerExpired(task, entry)
  }

  try {
    const persisted = await kanbanApi.updateTaskTimer(taskId, idleTimer)
    if (persisted) {
      task.timer = {
        ...task.timer,
        ...persisted,
        taskId,
      }
    }
  } catch (err) {
    notify.error(err, 'Unable to stop timer')
    return
  }

  // Stopping saves the session as a time entry on the server.
  await refreshTaskTotal(taskId)
}

const handleSetTaskTotal = (taskId: string | number, totalSeconds: number): void => {
  const task = findTaskById(taskId)
  if (task) {
    task.totalSeconds = totalSeconds
  }
}

/** Reload a task's time entries and update the total shown on its card. */
const refreshTaskTotal = async (taskId: string | number): Promise<void> => {
  try {
    const entries = await kanbanApi.listTimeEntries(taskId)
    handleSetTaskTotal(taskId, sumEntryDurations(entries))
  } catch {
    // Keep the previous total; the next board load corrects it.
  }
}

const handleTimerExpired = (task: KanbanTaskDto, entry?: TaskTimeEntryDto): void => {
  const lastAlertTime = recentAlerts.get(task.id) ?? 0
  const now = Date.now()
  if (now - lastAlertTime < 3000) {
    return
  }
  recentAlerts.set(task.id, now)
  notify.timerComplete(task.title)
}

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
      tasks: updatedColumn.tasks ?? existingColumn.tasks,
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

const isShared = computed<boolean>(() => {
  const hasCollaborators = (props.board.collaborators?.length ?? 0) > 0
  const isNotOwner = props.board.isOwner === false
  return hasCollaborators || isNotOwner
})

const boardMembers = computed<UserOut[]>(() => {
  const members: UserOut[] = []
  if (props.board.owner) {
    members.push(props.board.owner)
  }
  if (props.board.collaborators) {
    for (const collab of props.board.collaborators) {
      if (!members.some(m => m.id === collab.id)) {
        members.push(collab)
      }
    }
  }
  return members
})

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
})

defineExpose({
  localColumns,
  availableTags,
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

<template>
  <Card data-testid="kanban-board">
    <template v-if="board.title" #title>
      <span data-testid="board-title">{{ board.title }}</span>
    </template>
    <template v-if="board.description" #subtitle>
      <span data-testid="board-description">{{ board.description }}</span>
    </template>
    <template #content>
      <!-- Horizontal Column Track -->
      <div
        data-testid="kanban-columns-track"
        class="flex w-full items-start gap-4 overflow-x-auto overflow-y-hidden pb-2"
      >
        <template v-for="column in sortedColumns" :key="column.id">
          <slot name="column" :column="column">
            <KanbanColumn :column="column">
              <template v-if="$slots.task" #task="taskSlotProps">
                <slot name="task" v-bind="taskSlotProps" />
              </template>
            </KanbanColumn>
          </slot>
        </template>
      </div>

      <!-- Centralized Task Dialog -->
      <KanbanTaskDialog
        v-model:visible="isTaskDialogOpen"
        :mode="dialogMode"
        :task="activeTask"
        :column-id="activeColumnId"
        @save="handleSaveTask"
        @delete="handleDeleteTask"
      />
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, watch, provide, nextTick, onMounted } from 'vue'
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
import { kanbanContextKey, kanbanApi } from '~/api/kanban'

const notify = useNotifications()

const props = defineProps<{
  board: KanbanBoardDto
}>()

defineSlots<{
  column?: (props: { column: KanbanColumnDto }) => any
  task?: (props: { task: KanbanTaskDto }) => any
}>()

const localColumns = ref<KanbanColumnDto[]>([])
const availableTags = ref<TagDto[]>([])

const loadTags = async (): Promise<void> => {
  try {
    const tags = await kanbanApi.listTags()
    availableTags.value = tags || []
  } catch (err) {
    notify.error(err, 'Unable to fetch tags')
  }
}

onMounted(() => {
  loadTags()
})

watch(
  () => props.board.columns,
  (newColumns) => {
    const raw = JSON.parse(JSON.stringify(newColumns || []))
    raw.forEach((col: KanbanColumnDto) => {
      col.tasks?.forEach((t: KanbanTaskDto) => {
        if (t.columnId == null) {
          t.columnId = (t as any).column_id ?? col.id
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
      to_column_id: req.toColumnId,
      target_position: req.targetPosition,
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
  let colId = task.columnId ?? (task as any).column_id
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
      tag_ids: payload.tag_ids,
    } as any)
    notify.success('Task created.')

    let taskInCol = targetCol.tasks.find(t => sameId(t.id, tempId))
    if (!taskInCol) {
      for (const col of localColumns.value) {
        taskInCol = col.tasks.find(t => sameId(t.id, tempId))
        if (taskInCol) break
      }
    }
    if (taskInCol && createdTask) {
      taskInCol.id = createdTask.id
      if (createdTask.columnId != null || (createdTask as any).column_id != null) {
        taskInCol.columnId = createdTask.columnId ?? (createdTask as any).column_id
      }
      if (createdTask.position !== undefined) {
        taskInCol.position = createdTask.position
      }
      if (createdTask.priority !== undefined) {
        taskInCol.priority = createdTask.priority
      }
      if (createdTask.tags !== undefined) {
        taskInCol.tags = createdTask.tags
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
    tag_ids?: Array<string | number>
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
      : (targetTask.columnId ?? (targetTask as any)?.column_id ?? sourceCol.id)
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
    if (payload.tag_ids !== undefined) {
      updatePayload.tag_ids = payload.tag_ids
    }

    const updatePromise = kanbanApi.updateTask(taskId, updatePayload)
    let updated: KanbanTaskDto | undefined

    if (isColumnChanged) {
      const movePromise = kanbanApi.moveTask(taskId, {
        to_column_id: destCol.id,
        target_position: targetPosition,
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
      if (updated.columnId != null || (updated as any)?.column_id != null) {
        targetTask.columnId = updated.columnId ?? (updated as any)?.column_id
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
      tag_ids: savePayload.tag_ids,
    })
  } else if (savePayload.mode === 'edit' && savePayload.taskId != null) {
    await handleUpdateTask(savePayload.taskId, {
      title: savePayload.title,
      description: savePayload.description,
      priority: savePayload.priority,
      tags: savePayload.tags,
      tag_ids: savePayload.tag_ids,
      columnId: savePayload.columnId,
    })
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
  const updatedTimer: TaskTimerDto = {
    taskId,
    mode: defaultTimer?.mode || task.timer?.mode || 'COUNT_DOWN',
    targetDurationSeconds: defaultTimer?.targetDurationSeconds ?? task.timer?.targetDurationSeconds ?? 1500,
    state: 'RUNNING',
    startedAt: nowIso,
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
  let accumulated = currentTimer.elapsedSeconds || 0
  if (currentTimer.state === 'RUNNING' && currentTimer.startedAt) {
    const delta = Math.max(0, Math.floor((Date.now() - new Date(currentTimer.startedAt).getTime()) / 1000))
    accumulated += delta
  }

  const pausedTimer: TaskTimerDto = {
    ...currentTimer,
    state: 'PAUSED',
    startedAt: null,
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

const handleStopTimer = async (taskId: string | number, entry?: TaskTimeEntryDto): Promise<void> => {
  const task = findTaskById(taskId)
  if (!task || !task.timer) return

  const currentTimer = task.timer
  let totalElapsed = currentTimer.elapsedSeconds || 0
  if (currentTimer.state === 'RUNNING' && currentTimer.startedAt) {
    const delta = Math.max(0, Math.floor((Date.now() - new Date(currentTimer.startedAt).getTime()) / 1000))
    totalElapsed += delta
  }

  const idleTimer: TaskTimerDto = {
    ...currentTimer,
    state: 'IDLE',
    startedAt: null,
    elapsedSeconds: totalElapsed,
  }

  task.timer = {
    ...idleTimer,
    elapsedSeconds: 0,
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
  }
}

const handleTimerExpired = (task: KanbanTaskDto, entry: TaskTimeEntryDto): void => {
  notify.success(`Focus session completed for "${task.title}"!`)
}

provide(kanbanContextKey, {
  columns: columnRegistry,
  availableTags: computed(() => availableTags.value),
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

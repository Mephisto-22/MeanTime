<template>
  <Card data-testid="kanban-board">
    <template v-if="board.title" #title>
      <span data-testid="board-title">{{ board.title }}</span>
    </template>
    <template v-if="board.description" #subtitle>
      <span data-testid="board-description">{{ board.description }}</span>
    </template>
    <template #content>
      <!-- Error Notification Banner -->
      <Message
        v-if="errorMessage"
        data-testid="kanban-error-banner"
        severity="error"
        class="mb-3"
        @close="errorMessage = null"
      >
        {{ errorMessage }}
      </Message>

      <!-- Horizontal Column Track -->
      <div
        data-testid="kanban-columns-track"
        class="flex items-start gap-4 overflow-x-auto overflow-y-hidden pb-2"
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
      />
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, watch, provide, nextTick } from 'vue'
import type {
  KanbanBoardDto,
  KanbanColumnDto,
  KanbanColumnSummary,
  KanbanTaskDto,
  TaskMoveContext,
  TaskDialogSavePayload,
} from '~/api/kanban'
import { kanbanContextKey, kanbanApi } from '~/api/kanban'

const props = defineProps<{
  board: KanbanBoardDto
}>()

defineSlots<{
  column?: (props: { column: KanbanColumnDto }) => any
  task?: (props: { task: KanbanTaskDto }) => any
}>()

const localColumns = ref<KanbanColumnDto[]>([])

watch(
  () => props.board.columns,
  (newColumns) => {
    localColumns.value = JSON.parse(JSON.stringify(newColumns || []))
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
    console.warn('Failed to persist task movement:', err)
  }
}

const isTaskDialogOpen = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const activeTask = ref<KanbanTaskDto | null>(null)
const activeColumnId = ref<string | number | null>(null)
const errorMessage = ref<string | null>(null)

const openCreateTaskDialog = (columnId: string | number): void => {
  dialogMode.value = 'create'
  activeTask.value = null
  activeColumnId.value = columnId
  isTaskDialogOpen.value = true
}

const openEditTaskDialog = (task: KanbanTaskDto): void => {
  dialogMode.value = 'edit'
  activeTask.value = task
  activeColumnId.value = task.columnId
  isTaskDialogOpen.value = true
}

const closeTaskDialog = (): void => {
  isTaskDialogOpen.value = false
}

const handleCreateTask = async (
  columnId: string | number,
  payload: Partial<KanbanTaskDto>,
): Promise<void> => {
  const targetCol = localColumns.value.find(col => sameId(col.id, columnId))
  if (!targetCol) return

  errorMessage.value = null
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const optimisticTask: KanbanTaskDto = {
    id: tempId,
    title: payload.title ?? '',
    description: payload.description ?? '',
    position: targetCol.tasks.length,
    columnId,
  }
  targetCol.tasks.push(optimisticTask)

  try {
    const createdTask = await kanbanApi.createTask(columnId, {
      title: payload.title,
      description: payload.description,
    })

    const taskInCol = targetCol.tasks.find(t => sameId(t.id, tempId))
    if (taskInCol && createdTask) {
      taskInCol.id = createdTask.id
      if (createdTask.position !== undefined) {
        taskInCol.position = createdTask.position
      }
    }
  } catch (err) {
    const taskIndex = targetCol.tasks.findIndex(t => sameId(t.id, tempId))
    if (taskIndex !== -1) {
      targetCol.tasks.splice(taskIndex, 1)
      reindexTasks(targetCol.tasks)
    }
    const message = (err as any)?.message
      ? `Failed to create task: ${(err as any).message}`
      : 'Failed to create task'
    errorMessage.value = message
    console.warn('Failed to create task:', err)
  }
}

const handleUpdateTask = async (
  taskId: string | number,
  payload: Partial<KanbanTaskDto>,
): Promise<void> => {
  try {
    await kanbanApi.updateTask(taskId, payload)
  } catch (err) {
    console.warn('Failed to update task:', err)
  }
}

const handleDeleteTask = async (taskId: string | number): Promise<void> => {
  try {
    await kanbanApi.deleteTask(taskId)
  } catch (err) {
    console.warn('Failed to delete task:', err)
  }
}

const handleSaveTask = async (savePayload: TaskDialogSavePayload): Promise<void> => {
  if (savePayload.mode === 'create' && savePayload.columnId != null) {
    await handleCreateTask(savePayload.columnId, {
      title: savePayload.title,
      description: savePayload.description,
    })
  } else if (savePayload.mode === 'edit' && savePayload.taskId != null) {
    await handleUpdateTask(savePayload.taskId, {
      title: savePayload.title,
      description: savePayload.description,
    })
  }
}

provide(kanbanContextKey, {
  columns: columnRegistry,
  moveTask: handleMoveTask,
  openCreateTaskDialog,
  openEditTaskDialog,
  createTask: handleCreateTask,
  updateTask: handleUpdateTask,
  deleteTask: handleDeleteTask,
})

defineExpose({
  localColumns,
  handleMoveTask,
  isTaskDialogOpen,
  dialogMode,
  activeTask,
  activeColumnId,
  errorMessage,
  openCreateTaskDialog,
  openEditTaskDialog,
  closeTaskDialog,
  handleCreateTask,
  handleUpdateTask,
  handleDeleteTask,
  handleSaveTask,
})
</script>

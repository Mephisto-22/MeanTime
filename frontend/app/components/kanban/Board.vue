<template>
  <Card data-testid="kanban-board">
    <template v-if="board.name" #title>
      <span data-testid="board-title">{{ board.name }}</span>
    </template>
    <template v-if="board.description" #subtitle>
      <span data-testid="board-description">{{ board.description }}</span>
    </template>
    <template #content>
      <!-- Horizontal Column Track -->
      <div
        data-testid="kanban-columns-track"
        class="flex items-start gap-4 overflow-x-auto pb-2"
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
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, watch, provide } from 'vue'
import type {
  KanbanBoardDto,
  KanbanColumnDto,
  KanbanColumnSummary,
  KanbanTaskDto,
  TaskMoveRequest,
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
  return [...localColumns.value].sort((a, b) => a.order - b.order)
})

const columnRegistry = computed<KanbanColumnSummary[]>(() => {
  return sortedColumns.value.map(col => ({
    id: col.id,
    name: col.name,
    order: col.order,
  }))
})

const reindexTasks = (tasks: KanbanTaskDto[]): void => {
  tasks.forEach((t, i) => {
    t.order = i
  })
}

const handleMoveTask = async (req: TaskMoveRequest): Promise<void> => {
  const fromCol = localColumns.value.find(col => col.id === req.fromColumnId)
  const toCol = localColumns.value.find(col => col.id === req.toColumnId)

  if (!fromCol || !toCol) {
    return
  }

  const taskIndex = fromCol.tasks.findIndex(t => t.id === req.taskId)
  if (taskIndex === -1) {
    return
  }

  const [task] = fromCol.tasks.splice(taskIndex, 1)
  if (!task) {
    return
  }
  task.columnId = req.toColumnId
  task.order = toCol.tasks.length
  toCol.tasks.push(task)

  reindexTasks(fromCol.tasks)
  reindexTasks(toCol.tasks)

  try {
    await kanbanApi.moveTask({
      ...req,
      targetOrder: task.order,
    })
  } catch (err) {
    console.error('Failed to persist task movement:', err)
  }
}

provide(kanbanContextKey, {
  columns: columnRegistry,
  moveTask: handleMoveTask,
})
</script>

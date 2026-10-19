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

const handleMoveTask = async (req: TaskMoveRequest): Promise<void> => {
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
    const currentIndex = fromCol.tasks.findIndex(t => sameId(t.id, req.taskId))
    if (currentIndex !== -1 && currentIndex !== req.targetOrder) {
      fromCol.tasks.splice(currentIndex, 1)
      const targetIdx = Math.max(0, Math.min(req.targetOrder, fromCol.tasks.length))
      fromCol.tasks.splice(targetIdx, 0, task)
    }
    reindexTasks(fromCol.tasks)
  } else {
    const fromIndex = fromCol.tasks.findIndex(t => sameId(t.id, req.taskId))
    const toIndex = toCol.tasks.findIndex(t => sameId(t.id, req.taskId))

    if (fromIndex !== -1) {
      fromCol.tasks.splice(fromIndex, 1)
    }

    if (toIndex === -1) {
      const targetIdx = Math.max(0, Math.min(req.targetOrder, toCol.tasks.length))
      toCol.tasks.splice(targetIdx, 0, task)
    } else if (toIndex !== req.targetOrder) {
      toCol.tasks.splice(toIndex, 1)
      const targetIdx = Math.max(0, Math.min(req.targetOrder, toCol.tasks.length))
      toCol.tasks.splice(targetIdx, 0, task)
    }

    task.columnId = req.toColumnId

    reindexTasks(fromCol.tasks)
    reindexTasks(toCol.tasks)
  }

  try {
    await kanbanApi.moveTask({
      taskId: req.taskId,
      fromColumnId: req.fromColumnId,
      toColumnId: req.toColumnId,
      targetOrder: req.targetOrder,
    })
  } catch (err) {
    console.warn('Failed to persist task movement:', err)
  }
}

provide(kanbanContextKey, {
  columns: columnRegistry,
  moveTask: handleMoveTask,
})

defineExpose({
  localColumns,
  handleMoveTask,
})
</script>

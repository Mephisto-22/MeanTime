<template>
  <div
    data-testid="kanban-column"
    :data-column-id="column.id"
    class="flex h-[50vh] flex-1 min-w-64 flex-col rounded-lg bg-surface-100 p-3 transition-colors duration-200 dark:bg-surface-800"
  >
    <!-- Column Header -->
    <div class="mb-3 flex shrink-0 items-center justify-between">
      <h3 class="text-sm font-semibold">
        {{ column.title }}
      </h3>
      <Tag
        data-testid="column-task-count"
        :value="column.tasks.length"
        severity="secondary"
        rounded
      />
    </div>

    <!-- Draggable Tasks Container -->
    <div class="relative flex flex-1 min-h-[120px] flex-col overflow-y-auto">
      <!-- Empty State Placeholder (Non-draggable, hidden by CSS when ghost hovers) -->
      <div
        v-if="tasks.length === 0"
        data-testid="column-empty-placeholder"
        class="absolute inset-0 flex items-center justify-center rounded border-2 border-dashed border-surface-300 text-sm text-surface-500 select-none pointer-events-none dark:border-surface-600"
      >
        No tasks
      </div>

      <VueDraggable
        v-model="tasks"
        data-testid="kanban-tasks-container"
        :data-column-id="column.id"
        group="kanban-tasks"
        :animation="150"
        draggable="[data-testid='kanban-task']"
        ghost-class="kanban-task-ghost"
        drag-class="kanban-task-drag"
        chosen-class="kanban-task-chosen"
        :delay="200"
        :delay-on-touch-only="true"
        :empty-insert-threshold="10"
        class="flex flex-1 min-h-[120px] flex-col gap-2"
        @update="onUpdate"
        @add="onAdd"
      >
        <KanbanTask
          v-for="task in tasks"
          :key="task.id"
          :task="task"
        />
      </VueDraggable>
    </div>

    <!-- Add Task Button -->
    <div class="mt-2 shrink-0 pt-1">
      <Button
        data-testid="add-task-button"
        label="Add Task"
        severity="secondary"
        icon="pi pi-plus"
        size="small"
        class="w-full justify-center bg-surface-200 hover:bg-surface-300 dark:bg-surface-700 dark:hover:bg-surface-600"
        @click="handleAddTask"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { KanbanColumnDto, KanbanColumnSummary, KanbanTaskDto } from '~/api/kanban'
import { kanbanContextKey } from '~/api/kanban'

const props = defineProps<{
  column: KanbanColumnDto
  columns?: KanbanColumnSummary[]
}>()

defineSlots<{
  task?: (props: { task: KanbanTaskDto }) => any
}>()

const kanbanContext = inject(kanbanContextKey, null)

const tasks = computed({
  get: () => props.column.tasks,
  set: (newTasks: KanbanTaskDto[]) => {
    props.column.tasks.splice(0, props.column.tasks.length, ...newTasks)
  },
})

const onUpdate = (event: any) => {
  const taskId = event.item?.getAttribute('data-task-id') || event.data?.id
  const targetPosition = event.newDraggableIndex ?? event.newIndex
  if (taskId !== undefined && targetPosition !== undefined && kanbanContext) {
    kanbanContext.moveTask({
      taskId,
      fromColumnId: props.column.id,
      toColumnId: props.column.id,
      targetPosition,
    })
  }
}

const onAdd = (event: any) => {
  const taskId = event.item?.getAttribute('data-task-id') || event.data?.id
  const fromColumnId =
    event.from?.getAttribute('data-column-id') ||
    event.from?.closest('[data-column-id]')?.getAttribute('data-column-id')
  const targetPosition = event.newDraggableIndex ?? event.newIndex

  if (taskId !== undefined && fromColumnId !== undefined && targetPosition !== undefined && kanbanContext) {
    kanbanContext.moveTask({
      taskId,
      fromColumnId,
      toColumnId: props.column.id,
      targetPosition,
    })
  }
}

const handleAddTask = () => {
  if (kanbanContext?.openCreateTaskDialog) {
    kanbanContext.openCreateTaskDialog(props.column.id)
  }
}

defineExpose({
  tasks,
  onUpdate,
  onAdd,
  handleAddTask,
})
</script>

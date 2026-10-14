<template>
  <div
    data-testid="kanban-column"
    :data-column-id="column.id"
    :data-is-drop-target="isDropTarget"
    class="flex h-[50vh] flex-1 min-w-64 max-w-xs flex-col rounded-lg bg-surface-100 p-3 transition-colors duration-200 dark:bg-surface-800"
    :class="{
      'ring-2 ring-primary-500 border-primary-500 dark:ring-primary-400 is-drop-target': isDropTarget,
    }"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover.prevent
    @drop="onDrop"
  >
    <!-- Column Header -->
    <div class="mb-3 flex shrink-0 items-center justify-between">
      <h3 class="text-sm font-semibold">
        {{ column.name }}
      </h3>
      <Tag
        data-testid="column-task-count"
        :value="column.tasks.length"
        severity="secondary"
        rounded
      />
    </div>

    <!-- Draggable Tasks Container -->
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
      class="flex flex-1 min-h-[120px] flex-col gap-2 overflow-y-auto"
      @update="onUpdate"
      @add="onAdd"
      @change="onChange"
      @end="onDragEnd"
    >
      <!-- Empty State Placeholder (Non-draggable, hidden while ghost hovers) -->
      <div
        v-if="tasks.length === 0"
        v-show="!isGhostHovering"
        data-testid="column-empty-placeholder"
        class="flex flex-1 min-h-[100px] items-center justify-center rounded border-2 border-dashed border-surface-300 text-sm text-surface-500 select-none pointer-events-none dark:border-surface-600"
      >
        No tasks
      </div>

      <template v-for="task in tasks" :key="task.id">
        <slot name="task" :task="task">
          <KanbanTask :task="task" :columns="columns" />
        </slot>
      </template>
    </VueDraggable>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
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

const isDropTarget = ref(false)
const isGhostHovering = ref(false)
let dragCounter = 0

const tasks = computed({
  get: () => props.column.tasks,
  set: (newTasks: KanbanTaskDto[]) => {
    props.column.tasks.splice(0, props.column.tasks.length, ...newTasks)
  },
})

const onDragEnter = () => {
  dragCounter++
  isDropTarget.value = true
  if (tasks.value.length === 0) {
    isGhostHovering.value = true
  }
}

const onDragLeave = () => {
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    isDropTarget.value = false
    isGhostHovering.value = false
  }
}

const onDrop = () => {
  dragCounter = 0
  isDropTarget.value = false
  isGhostHovering.value = false
}

const onDragEnd = () => {
  dragCounter = 0
  isDropTarget.value = false
  isGhostHovering.value = false
}

const onUpdate = (event: any) => {
  const taskId = event.item?.getAttribute('data-task-id') || event.data?.id
  const targetOrder = event.newDraggableIndex ?? event.newIndex
  if (taskId !== undefined && targetOrder !== undefined && kanbanContext) {
    kanbanContext.moveTask({
      taskId,
      fromColumnId: props.column.id,
      toColumnId: props.column.id,
      targetOrder,
    })
  }
}

const onAdd = (event: any) => {
  dragCounter = 0
  isDropTarget.value = false
  isGhostHovering.value = false

  const taskId = event.item?.getAttribute('data-task-id') || event.data?.id
  const fromColumnId =
    event.from?.getAttribute('data-column-id') ||
    event.from?.closest('[data-column-id]')?.getAttribute('data-column-id')
  const targetOrder = event.newDraggableIndex ?? event.newIndex

  if (taskId !== undefined && fromColumnId !== undefined && targetOrder !== undefined && kanbanContext) {
    kanbanContext.moveTask({
      taskId,
      fromColumnId,
      toColumnId: props.column.id,
      targetOrder,
    })
  }
}

const onChange = (event: any) => {
  if (!kanbanContext) return
  if (event?.added) {
    const { element, newIndex } = event.added
    kanbanContext.moveTask({
      taskId: element.id,
      fromColumnId: element.columnId,
      toColumnId: props.column.id,
      targetOrder: newIndex,
    })
  } else if (event?.moved) {
    const { element, newIndex } = event.moved
    kanbanContext.moveTask({
      taskId: element.id,
      fromColumnId: props.column.id,
      toColumnId: props.column.id,
      targetOrder: newIndex,
    })
  }
}
</script>

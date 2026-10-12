<template>
  <Card
    data-testid="kanban-task"
    :data-task-id="task.id"
    class="rounded-lg border border-surface-200 bg-surface-0 shadow-xs hover:shadow-sm dark:border-surface-800 dark:bg-surface-900"
    :pt="{
      body: { class: 'p-3' },
      content: { class: 'p-0' },
    }"
  >
    <template #content>
      <div class="flex items-center justify-between gap-2">
        <span class="break-words text-sm font-medium text-surface-800 dark:text-surface-100">
          {{ task.name }}
        </span>
        <div class="flex-shrink-0">
          <Button
            data-testid="task-action-menu-button"
            icon="pi pi-ellipsis-v"
            severity="secondary"
            text
            rounded
            size="small"
            aria-label="Task actions"
            class="!h-7 !w-7 p-0 text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200"
            @click="toggleMenu"
          />
          <Menu
            ref="menuRef"
            :model="menuItems"
            :popup="true"
          />
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import type { KanbanColumnSummary, KanbanTaskDto, TaskMoveRequest } from '~/types/kanban'
import { kanbanContextKey } from '~/types/kanban'

const props = defineProps<{
  task: KanbanTaskDto
  columns?: KanbanColumnSummary[]
}>()

const emit = defineEmits<{
  (e: 'move', payload: TaskMoveRequest): void
}>()

const kanbanContext = inject(kanbanContextKey, null)
const menuRef = ref()

const availableColumns = computed(() => {
  if (props.columns) {
    return props.columns
  }
  if (kanbanContext?.columns) {
    return kanbanContext.columns.value
  }
  return []
})

const targetColumns = computed(() => {
  return availableColumns.value.filter(col => col.id !== props.task.columnId)
})

const menuItems = computed(() => {
  return targetColumns.value.map(col => ({
    label: `Move to ${col.name}`,
    icon: 'pi pi-arrow-right',
    command: () => handleMoveTo(col.id),
  }))
})

const toggleMenu = (event: Event) => {
  menuRef.value?.toggle(event)
}

const handleMoveTo = (toColumnId: string | number) => {
  const payload: TaskMoveRequest = {
    taskId: props.task.id,
    fromColumnId: props.task.columnId,
    toColumnId,
    targetOrder: 0,
  }

  if (kanbanContext) {
    kanbanContext.moveTask(payload)
  } else {
    emit('move', payload)
  }
}
</script>

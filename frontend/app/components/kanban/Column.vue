<template>
  <div
    data-testid="kanban-column"
    :data-column-id="column.id"
    class="flex w-72 sm:w-80 flex-shrink-0 flex-col rounded-xl border border-surface-200 bg-surface-100 p-3 shadow-xs dark:border-surface-700/60 dark:bg-surface-800/40"
  >
    <!-- Column Header -->
    <div class="mb-3 flex items-center justify-between px-1">
      <h3 class="text-sm font-semibold text-surface-800 dark:text-surface-100">
        {{ column.name }}
      </h3>
      <Tag
        data-testid="column-task-count"
        :value="column.tasks.length"
        severity="secondary"
        rounded
        class="px-2 py-0.5 text-xs font-semibold"
      />
    </div>

    <!-- Empty State Placeholder -->
    <div
      v-if="sortedTasks.length === 0"
      data-testid="column-empty-placeholder"
      class="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-surface-300 text-xs font-medium text-surface-500 dark:border-surface-700 dark:text-surface-400"
    >
      No tasks
    </div>

    <!-- Task List -->
    <div v-else class="flex flex-col gap-2.5">
      <template v-for="task in sortedTasks" :key="task.id">
        <slot name="task" :task="task">
          <KanbanTask :task="task" />
        </slot>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { KanbanColumnDto, KanbanTaskDto } from '~/types/kanban'

const props = defineProps<{
  column: KanbanColumnDto
}>()

defineSlots<{
  task?: (props: { task: KanbanTaskDto }) => any
}>()

const sortedTasks = computed(() => {
  return [...props.column.tasks].sort((a, b) => a.order - b.order)
})
</script>

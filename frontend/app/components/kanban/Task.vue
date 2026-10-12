<template>
  <Card
    data-testid="kanban-task"
    :data-task-id="task.id"
    class="shadow-xs hover:shadow-sm border border-surface-200 dark:border-surface-800 bg-surface-0 dark:bg-surface-900 rounded-lg"
    :pt="{
      body: { class: 'p-3' },
      content: { class: 'p-0' },
    }"
  >
    <template #content>
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-medium text-surface-800 dark:text-surface-100 break-words">
          {{ task.name }}
        </span>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import type { KanbanTaskDto } from '~/types/kanban'

defineProps<{
  task: KanbanTaskDto
}>()
</script>

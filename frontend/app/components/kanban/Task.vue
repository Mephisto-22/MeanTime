<template>
  <Card
    data-testid="kanban-task"
    :data-task-id="task.id"
    :pt="{ body: 'p-2.5', content: 'p-0' }"
    class="cursor-grab active:cursor-grabbing select-none transition-shadow duration-150"
  >
    <template #content>
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium">{{ task.title }}</span>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import type { KanbanTaskDto } from '~/api/kanban'

defineProps<{
  task: KanbanTaskDto
}>()
</script>

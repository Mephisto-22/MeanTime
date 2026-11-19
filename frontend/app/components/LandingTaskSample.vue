<template>
  <div class="task-sample" role="img" :aria-label="description">
    <!-- Keep the real task UI, but exclude demo controls from pointer/keyboard interaction. -->
    <div inert>
      <KanbanTask :task="task" />
    </div>
  </div>
</template>

<script setup lang="ts">
import KanbanTask from '~/components/kanban/Task.vue'
import type { KanbanTaskDto } from '~/api/kanban'

const props = defineProps<{ task: KanbanTaskDto }>()
const description = computed(() => [
  'Example task', props.task.title, props.task.description,
  props.task.priority ? `${props.task.priority.toLowerCase()} priority` : '',
  ...(props.task.tags?.map(tag => tag.name) ?? []),
  props.task.timer ? 'with a sample focus timer' : '',
].filter(Boolean).join('. '))
</script>

<style scoped>
.task-sample { min-width: 0; text-align: left; font-family: Arial, Helvetica, sans-serif; font-style: normal; letter-spacing: normal; }
.task-sample :deep(.kanban-task-card) { cursor: default; }
</style>

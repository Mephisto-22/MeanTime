<template>
  <div
    v-if="loading && tasks.length === 0"
    data-testid="task-feed-loading"
    class="kanban-column"
  >
    <div class="flex items-center justify-between">
      <Skeleton width="6rem" height="1.25rem" />
      <Skeleton width="2rem" height="1.25rem" border-radius="9999px" />
    </div>
    <Skeleton
      v-for="n in 3"
      :key="n"
      height="7rem"
      border-radius="12px"
    />
  </div>

  <div
    v-else-if="error"
    data-testid="task-feed-error"
    class="error-state-card"
  >
    <div class="flex flex-wrap items-center gap-3">
      <span>We couldn't load your task feed.</span>
      <Button
        label="Try again"
        icon="pi pi-refresh"
        severity="danger"
        text
        size="small"
        @click="emit('retry')"
      />
    </div>
  </div>

  <KanbanColumn
    v-else
    :column="feedColumn"
    :draggable="false"
    :show-edit-button="false"
    :show-add-task="false"
    :empty-text="emptyText"
  >
    <template v-if="$slots['header-actions']" #header-actions>
      <slot name="header-actions" />
    </template>

    <template v-if="$slots.subheader" #subheader>
      <slot name="subheader" />
    </template>

    <template #task="{ task }">
      <KanbanTask :task="task" :draggable="false">
        <template #before-timer>
          <div
            data-testid="feed-task-context"
            class="mt-2 pt-1.5 border-t border-surface-200/70 dark:border-surface-800/80 flex items-center gap-1 text-[10px] font-medium text-surface-500 dark:text-surface-400 truncate"
          >
            <i class="pi pi-th-large text-[9px] text-primary shrink-0" aria-hidden="true" />
            <span class="truncate font-semibold text-surface-700 dark:text-surface-300">{{ (task as TaskFeedItemDto).boardTitle }}</span>
            <span aria-hidden="true">&rsaquo;</span>
            <span class="truncate">{{ (task as TaskFeedItemDto).columnTitle }}</span>
          </div>
        </template>
      </KanbanTask>
    </template>
  </KanbanColumn>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { KanbanColumnDto, TaskFeedItemDto } from '~/api/kanban'
import KanbanColumn from '~/components/kanban/Column.vue'
import KanbanTask from '~/components/kanban/Task.vue'

const props = withDefaults(
  defineProps<{
    tasks: TaskFeedItemDto[]
    loading?: boolean
    error?: unknown
    emptyText?: string
  }>(),
  {
    loading: false,
    emptyText: 'No active tasks across your boards yet',
  },
)

const emit = defineEmits<{
  retry: []
}>()

defineSlots<{
  'header-actions'?: () => any
  subheader?: () => any
}>()

const feedColumn = computed<KanbanColumnDto>(() => ({
  id: 'task-feed',
  title: 'Task Feed',
  position: 0,
  boardId: 'home',
  tasks: props.tasks,
}))
</script>

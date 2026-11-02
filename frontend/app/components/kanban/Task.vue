<template>
  <Card
    data-testid="kanban-task"
    :data-task-id="task.id"
    :pt="{ body: 'p-2.5', content: 'p-0' }"
    class="cursor-grab active:cursor-grabbing select-none transition-shadow duration-150"
    :class="priorityBorderClass"
    @click="handleClick"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @mousedown="handlePointerDown"
    @mousemove="handlePointerMove"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <template #content>
      <div class="flex items-start justify-between gap-3">
        <!-- Left Column: Title and Description -->
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-semibold text-surface-900 leading-snug break-words dark:text-surface-100">
            {{ task.title }}
          </h4>
          <p
            v-if="hasDescription"
            data-testid="task-description"
            class="line-clamp-1 text-xs text-surface-500 mt-0.5 dark:text-surface-400"
          >
            {{ task.description }}
          </p>
        </div>

        <!-- Right Column: Priority Micro-Pip and Tags -->
        <div
          v-if="task.priority || (task.tags && task.tags.length > 0)"
          data-testid="task-card-indicators"
          class="shrink-0 flex flex-col items-end gap-1.5 pt-0.5"
        >
          <!-- Priority micro-pip (omitted completely if null) -->
          <span
            v-if="task.priority"
            data-testid="task-priority-indicator"
            class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
            :class="priorityBadgeClass"
          >
            <span
              data-testid="task-priority-dot"
              class="h-1.5 w-1.5 rounded-full"
              :class="priorityDotClass"
            />
            {{ priorityLabel }}
          </span>

          <!-- Tags row: compact dot-prefixed pills capped at 3 with overflow badge -->
          <div
            v-if="task.tags && task.tags.length > 0"
            data-testid="task-tags-row"
            class="flex flex-wrap items-center justify-end gap-1"
          >
            <span
              v-for="tag in visibleTags"
              :key="tag.id"
              data-testid="task-tag-chip"
              class="inline-flex items-center gap-1 rounded bg-surface-100 px-1.5 py-0.5 text-[10px] font-medium text-surface-600 dark:bg-surface-800 dark:text-surface-300"
            >
              <span class="text-surface-400">&bull;</span>
              {{ tag.name }}
            </span>
            <span
              v-if="overflowTagCount > 0"
              data-testid="task-tag-overflow-badge"
              class="inline-flex items-center rounded bg-surface-200 px-1.5 py-0.5 text-[10px] font-medium text-surface-600 dark:bg-surface-700 dark:text-surface-300"
            >
              +{{ overflowTagCount }}
            </span>
          </div>
        </div>
      </div>

      <!-- Task Timer Bottom Row: Unified flush dock with inherited 1-click start and micro-controls -->
      <TaskTimerDock
        :task-id="task.id"
        :timer="task.timer"
        @start="handleTimerStart"
        @pause="handleTimerPause"
        @stop="handleTimerStop"
      />
    </template>
  </Card>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { KanbanTaskDto, TaskTimerDto, TaskTimeEntryDto } from '~/api/kanban'
import { kanbanContextKey } from '~/api/kanban'
import { useTaskInteraction } from '~/composables/useTaskInteraction'
import TaskTimerDock from '~/components/kanban/TaskTimerDock.vue'

const props = defineProps<{
  task: KanbanTaskDto
  onOpenEdit?: (task: KanbanTaskDto) => void
  onTimerStart?: (taskId: string | number, defaultTimer?: Partial<TaskTimerDto>) => void
  onTimerPause?: (taskId: string | number) => void
  onTimerStop?: (taskId: string | number, entry?: TaskTimeEntryDto) => void
}>()

const kanbanContext = inject(kanbanContextKey, null)

const handleTimerStart = (taskId: string | number, defaultTimer?: Partial<TaskTimerDto>) => {
  if (props.onTimerStart) props.onTimerStart(taskId, defaultTimer)
  else if (kanbanContext?.startTimer) kanbanContext.startTimer(taskId, defaultTimer)
}

const handleTimerPause = (taskId: string | number) => {
  if (props.onTimerPause) props.onTimerPause(taskId)
  else if (kanbanContext?.pauseTimer) kanbanContext.pauseTimer(taskId)
}

const handleTimerStop = (taskId: string | number, entry?: TaskTimeEntryDto) => {
  if (props.onTimerStop) props.onTimerStop(taskId, entry)
  else if (kanbanContext?.stopTimer) kanbanContext.stopTimer(taskId)
}

const {
  isDragging,
  handlePointerDown,
  handlePointerMove,
  handleDragStart,
  handleDragEnd,
  handleClick,
} = useTaskInteraction(() => props.task, props.onOpenEdit)

const hasDescription = computed(() => {
  return Boolean(props.task.description && props.task.description.trim().length > 0)
})

const priorityBorderClass = computed(() => {
  switch (props.task.priority) {
    case 'HIGH':
      return 'border-l-4 border-l-red-500 dark:border-l-red-500'
    case 'MEDIUM':
    case 'MED' as any:
      return 'border-l-4 border-l-amber-500 dark:border-l-amber-500'
    case 'LOW':
      return 'border-l-4 border-l-sky-500 dark:border-l-sky-500'
    default:
      return 'border-l-4 border-l-transparent'
  }
})

const priorityLabel = computed(() => {
  switch (props.task.priority) {
    case 'HIGH':
      return 'HIGH'
    case 'MEDIUM':
    case 'MED' as any:
      return 'MED'
    case 'LOW':
      return 'LOW'
    default:
      return ''
  }
})

const priorityBadgeClass = computed(() => {
  switch (props.task.priority) {
    case 'HIGH':
      return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
    case 'MEDIUM':
    case 'MED' as any:
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
    case 'LOW':
      return 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
    default:
      return ''
  }
})

const priorityDotClass = computed(() => {
  switch (props.task.priority) {
    case 'HIGH':
      return 'bg-red-500'
    case 'MEDIUM':
    case 'MED' as any:
      return 'bg-amber-500'
    case 'LOW':
      return 'bg-sky-500'
    default:
      return ''
  }
})

const MAX_VISIBLE_TAGS = 3

const visibleTags = computed(() => {
  if (!props.task.tags || props.task.tags.length === 0) return []
  return props.task.tags.slice(0, MAX_VISIBLE_TAGS)
})

const overflowTagCount = computed(() => {
  if (!props.task.tags) return 0
  return Math.max(0, props.task.tags.length - MAX_VISIBLE_TAGS)
})

defineExpose({
  isDragging,
  handleClick,
  handlePointerDown,
  handlePointerMove,
  handleDragStart,
  handleDragEnd,
  priorityBorderClass,
  priorityLabel,
  priorityBadgeClass,
  priorityDotClass,
  hasDescription,
  visibleTags,
  overflowTagCount,
  handleTimerStart,
  handleTimerPause,
  handleTimerStop,
})
</script>

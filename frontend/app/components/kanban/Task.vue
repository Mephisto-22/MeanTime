<template>
  <Card
    data-testid="kanban-task"
    :data-task-id="task.id"
    :pt="{
      body: 'p-2.5 flex flex-col justify-between h-full flex-1',
      content: 'p-0 flex flex-col justify-between flex-1 min-h-0',
    }"
    class="kanban-task-card cursor-grab active:cursor-grabbing select-none rounded-xl overflow-hidden shadow-sm h-32 shrink-0"
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
      <!-- Top Section: Header (Title + Priority micro-pip) & Description -->
      <div class="flex flex-col min-w-0">
        <div class="flex items-start justify-between gap-2">
          <h4 class="text-sm font-semibold text-surface-900 break-words dark:text-surface-100 line-clamp-2 flex-1 min-w-0">
            {{ task.title }}
          </h4>

          <div class="flex items-center gap-1.5 shrink-0">
            <!-- Recurring Icon Badge -->
            <span
              v-if="isRecurring"
              data-testid="task-recurring-badge"
              class="inline-flex items-center text-surface-400 dark:text-surface-500"
              title="Recurring task"
            >
              <i class="pi pi-sync text-[11px]" aria-hidden="true" />
            </span>

            <!-- Priority micro-pip (omitted completely if null) -->
            <span
              v-if="task.priority"
              data-testid="task-priority-indicator"
              class="kanban-priority-pip shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
              :class="priorityBadgeClass"
            >
              <span
                data-testid="task-priority-dot"
                class="h-1.5 w-1.5 rounded-full"
                :class="priorityDotClass"
              />
              {{ priorityLabel }}
            </span>
          </div>
        </div>

        <p
          v-if="hasDescription"
          data-testid="task-description"
          class="line-clamp-1 text-xs text-surface-500 mt-0.5 dark:text-surface-400"
        >
          {{ task.description }}
        </p>
      </div>

      <!-- Lower Section: Total tracked time (left) and tags row (right) stabilized at bottom content area -->
      <div
        v-if="hasTotal || (task.tags && task.tags.length > 0)"
        data-testid="task-tags-row"
        class="flex flex-wrap items-center justify-end gap-1 mt-auto pt-1"
      >
        <span
          v-if="hasTotal"
          data-testid="task-total-time"
          class="mr-auto inline-flex items-center gap-1 text-[10px] font-medium text-surface-500 dark:text-surface-400"
          :title="`${formattedTotal} tracked`"
        >
          <i class="pi pi-clock text-[10px]" aria-hidden="true" />
          {{ formattedTotal }}
        </span>
        <span
          v-for="tag in visibleTags"
          :key="tag.id"
          data-testid="task-tag-chip"
          class="kanban-tag-chip inline-flex items-center gap-1 rounded bg-surface-100 px-1.5 py-0.5 text-[10px] font-medium text-surface-600 dark:bg-surface-800 dark:text-surface-300"
        >
          <span class="text-surface-400">&bull;</span>
          {{ tag.name }}
        </span>
        <span
          v-if="overflowTagCount > 0"
          data-testid="task-tag-overflow-badge"
          class="kanban-tag-overflow inline-flex items-center rounded bg-surface-200 px-1.5 py-0.5 text-[10px] font-medium text-surface-600 dark:bg-surface-700 dark:text-surface-300"
        >
          +{{ overflowTagCount }}
        </span>
      </div>

      <!-- Task Timer Bottom Row: Unified flush dock with inherited 1-click start and micro-controls -->
      <TaskTimerDock
        v-if="hasActiveTimer"
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
import { kanbanContextKey, TASK_PRIORITY_CONFIG, DEFAULT_TASK_PRIORITY_BORDER_CLASS } from '~/api/kanban'
import { useTaskInteraction } from '~/composables/useTaskInteraction'
import { formatDurationBadge } from '~/composables/useTaskTimer'
import TaskTimerDock from '~/components/kanban/TaskTimerDock.vue'

const props = defineProps<{
  task: KanbanTaskDto
  onOpenEdit?: (task: KanbanTaskDto) => void
  onTimerStart?: (taskId: string | number, defaultTimer?: Partial<TaskTimerDto>) => void
  onTimerPause?: (taskId: string | number) => void
  onTimerStop?: (taskId: string | number, entry?: TaskTimeEntryDto) => void
}>()

const kanbanContext = inject(kanbanContextKey, null)

const hasActiveTimer = computed(() => {
  return props.task.timer != null && props.task.timer.mode !== 'NONE'
})

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
  else if (kanbanContext?.stopTimer) kanbanContext.stopTimer(taskId, entry)
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

const isRecurring = computed(() => {
  return Boolean(props.task.recurringTaskId || props.task.recurringTask)
})

const priorityConfig = computed(() => {
  const p = props.task.priority
  return (p && p in TASK_PRIORITY_CONFIG) ? TASK_PRIORITY_CONFIG[p] : null
})

const priorityBorderClass = computed(() => {
  return priorityConfig.value?.borderClass ?? DEFAULT_TASK_PRIORITY_BORDER_CLASS
})

const priorityLabel = computed(() => {
  return priorityConfig.value?.shortLabel ?? ''
})

const priorityBadgeClass = computed(() => {
  return priorityConfig.value?.badgeClass ?? ''
})

const priorityDotClass = computed(() => {
  return priorityConfig.value?.dotClass ?? ''
})

// Total tracked time is hidden until the task has any recorded time.
const hasTotal = computed(() => (props.task.totalSeconds ?? 0) > 0)

const formattedTotal = computed(() => formatDurationBadge(props.task.totalSeconds))

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
  hasTotal,
  formattedTotal,
  visibleTags,
  overflowTagCount,
  handleTimerStart,
  handleTimerPause,
  handleTimerStop,
})
</script>

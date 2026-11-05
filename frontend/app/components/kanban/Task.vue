<template>
  <Card
    data-testid="kanban-task"
    :data-task-id="task.id"
    :pt="{ body: 'p-2.5', content: 'p-0' }"
    class="cursor-grab active:cursor-grabbing select-none border border-surface-200 dark:border-surface-800 rounded-xl overflow-hidden"
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
      <div class="flex justify-between gap-3">
        <!-- Left Column: Title and Description -->
        <div class="flex-1 min-w-0 flex flex-col">
          <h4 class="text-sm font-semibold text-surface-900 break-words dark:text-surface-100">
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
            class="kanban-priority-pip"
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
              class="kanban-tag-chip"
            >
              <span class="text-surface-400">&bull;</span>
              {{ tag.name }}
            </span>
            <span
              v-if="overflowTagCount > 0"
              data-testid="task-tag-overflow-badge"
              class="kanban-tag-overflow"
            >
              +{{ overflowTagCount }}
            </span>
          </div>
        </div>
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

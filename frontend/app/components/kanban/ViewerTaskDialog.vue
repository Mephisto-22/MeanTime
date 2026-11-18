<template>
  <Dialog
    v-model:visible="visible"
    header="Task details"
    modal
    :draggable="false"
    class="dialog-lg"
    data-testid="viewer-task-dialog"
  >
    <div v-if="task" class="flex flex-col gap-4">
      <Tag value="Viewer access" severity="info" class="self-start" />

      <h2 class="text-lg font-semibold break-words">
        {{ task.title }}
      </h2>

      <div class="flex flex-wrap gap-2">
        <Tag v-if="columnTitle" :value="columnTitle" severity="secondary" />
        <Tag
          v-if="task.priority"
          :value="task.priority"
          severity="secondary"
        />
        <Tag
          v-for="tag in task.tags"
          :key="tag.id"
          :value="tag.name"
          severity="secondary"
        />
      </div>

      <p class="whitespace-pre-wrap break-words">
        {{ task.description || 'No description provided.' }}
      </p>

      <p v-if="schedule" class="text-sm text-surface-500">
        {{ schedule }}
      </p>

      <TaskTimerDock
        :task-id="task.id"
        :timer="task.timer"
        read-only
      />

      <section class="flex flex-col gap-3">
        <h3 class="font-semibold">Time history</h3>

        <p v-if="loading" role="status">Loading time history…</p>
        <Message v-else-if="loadError" severity="error" :closable="false">
          {{ loadError }}
        </Message>
        <template v-else>
          <p class="text-sm text-surface-500">
            Total tracked: {{ formatDurationBadge(totalSeconds) }}
          </p>

          <p v-if="entries.length === 0" class="text-sm text-surface-500">
            No time recorded yet.
          </p>

          <ul v-else class="flex flex-col gap-3">
            <li
              v-for="entry in entries"
              :key="entry.id"
              class="border-b border-surface-200 pb-3 dark:border-surface-700"
            >
              <p class="text-sm font-medium">
                {{ formatDurationBadge(entry.durationSeconds) }}
                <span v-if="entry.user?.email">
                  · {{ entry.user.email }}
                </span>
              </p>
              <p class="text-xs text-surface-500">
                {{ formatDateLabel(entry.startedAt) }}
                · {{ formatTimeRange(entry.startedAt, entry.endedAt) }}
              </p>
              <p v-if="entry.note" class="text-sm whitespace-pre-wrap">
                {{ entry.note }}
              </p>
            </li>
          </ul>
        </template>
      </section>
    </div>

    <template #footer>
      <Button
        label="Close"
        severity="secondary"
        @click="visible = false"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import {
  kanbanApi,
  kanbanContextKey,
  type KanbanTaskDto,
  type TaskTimeEntryDto,
} from '~/api/kanban'
import {
  formatDateLabel,
  formatDurationBadge,
  formatTimeRange,
  sumEntryDurations,
} from '~/composables/useTaskTimer'
import TaskTimerDock from '~/components/kanban/TaskTimerDock.vue'

const props = defineProps<{
  task: KanbanTaskDto | null
}>()

const visible = defineModel<boolean>('visible', { required: true })
const context = inject(kanbanContextKey, null)

const entries = ref<TaskTimeEntryDto[]>([])
const loading = ref(false)
const loadError = ref('')

const totalSeconds = computed(() => sumEntryDurations(entries.value))

const columnTitle = computed(() =>
  context?.columns.value.find(column =>
    String(column.id) === String(props.task?.columnId),
  )?.title ?? '',
)

const schedule = computed(() => {
  const recurrence = props.task?.recurringTask
  if (!recurrence) {
    return props.task?.recurringTaskId ? 'Recurring task' : ''
  }

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const detail = recurrence.cadence === 'WEEKLY'
    ? recurrence.daysOfWeek.map(day => days[day]).join(', ')
    : recurrence.cadence === 'MONTHLY'
      ? `day ${recurrence.dayOfMonth}`
      : ''

  return [
    recurrence.isActive ? 'Recurring' : 'Recurrence paused',
    recurrence.cadence,
    detail,
    recurrence.timeOfDay,
    recurrence.timezone,
  ].filter(Boolean).join(' · ')
})

watch(
  () => [visible.value, props.task?.id] as const,
  async ([isOpen, taskId], _, onCleanup) => {
    let cancelled = false
    onCleanup(() => { cancelled = true })

    if (!isOpen || taskId == null) return

    entries.value = []
    loadError.value = ''
    loading.value = true

    try {
      const result = await kanbanApi.listTimeEntries(taskId)
      if (!cancelled) entries.value = result
    } catch {
      if (!cancelled) loadError.value = 'Unable to load time history.'
    } finally {
      if (!cancelled) loading.value = false
    }
  },
  { immediate: true },
)

watch(
  () => props.task?.timeEntries,
  (updated) => {
    if (visible.value && updated) {
      entries.value = [...updated]
    }
  },
)
</script>
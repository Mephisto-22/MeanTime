<template>
  <Dialog
    v-model:visible="visible"
    header="Task details"
    modal
    :draggable="false"
    class="dialog-lg"
    data-testid="viewer-task-dialog"
  >
    <div v-if="task" class="flex flex-col gap-5 pt-1">
      <!-- Title -->
      <div class="border-b border-surface-200 pb-4 dark:border-surface-700">
        <Tag value="Viewer access" severity="info" class="mb-3" />
        <h2 class="text-xl font-bold tracking-tight break-words">
          {{ task.title }}
        </h2>
      </div>

      <!-- Properties: same grouping as the editor -->
      <div
        class="grid grid-cols-1 gap-5 border-b border-surface-200 pb-5 dark:border-surface-800 md:grid-cols-12"
      >
        <dl class="flex flex-col gap-4 md:col-span-5">
          <div>
            <dt class="mb-2 text-xs font-semibold text-surface-500 dark:text-surface-400">
              Column
            </dt>
            <dd class="text-sm font-medium">
              {{ columnTitle || 'Not specified' }}
            </dd>
          </div>

          <div>
            <dt class="mb-2 text-xs font-semibold text-surface-500 dark:text-surface-400">
              Priority
            </dt>
            <dd>
              <span
                v-if="priorityConfig"
                class="inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-sm font-medium"
                :class="priorityConfig.badgeClass"
              >
                <span
                  class="h-2 w-2 rounded-full"
                  :class="priorityConfig.dotClass"
                  aria-hidden="true"
                />
                {{ priorityConfig.label }}
              </span>
              <span v-else class="text-sm text-surface-500">
                No priority
              </span>
            </dd>
          </div>
        </dl>

        <section
          class="md:col-span-7 md:border-l md:border-surface-200 md:pl-5 dark:md:border-surface-800"
          aria-labelledby="viewer-tags-heading"
        >
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3
              id="viewer-tags-heading"
              class="text-xs font-semibold text-surface-500 dark:text-surface-400"
            >
              Tags
            </h3>
            <span class="text-xs text-surface-500">
              {{ task.tags?.length ?? 0 }} attached
            </span>
          </div>

          <div v-if="task.tags?.length" class="flex flex-wrap gap-2">
            <span
              v-for="tag in task.tags"
              :key="tag.id"
              class="max-w-full break-words rounded-full border border-surface-200 bg-surface-100 px-3 py-1.5 text-sm font-medium dark:border-surface-700 dark:bg-surface-800"
            >
              {{ tag.name }}
            </span>
          </div>

          <p v-else class="text-sm text-surface-500">
            No tags attached.
          </p>
        </section>
      </div>

      <!-- Description -->
      <section aria-labelledby="viewer-description-heading">
        <h3
          id="viewer-description-heading"
          class="mb-2 text-xs font-semibold text-surface-500 dark:text-surface-400"
        >
          Notes &amp; Description
        </h3>
        <div
          tabindex="0"
          role="region"
          aria-labelledby="viewer-description-heading"
          class="max-h-48 min-h-28 overflow-y-auto rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-950/40"
        >
          <p
            class="whitespace-pre-wrap break-words text-sm leading-relaxed"
            :class="{ 'text-surface-500': !task.description?.trim() }"
          >
            {{ task.description?.trim() ? task.description : 'No description provided.' }}
          </p>
        </div>
      </section>

      <!-- Recurrence -->
      <section
        v-if="schedule"
        class="flex items-start gap-3 rounded-xl border border-surface-200 p-4 dark:border-surface-800"
      >
        <i class="pi pi-sync mt-0.5 text-surface-500" aria-hidden="true" />
        <div>
          <h3 class="text-sm font-semibold">Repeat schedule</h3>
          <p class="mt-1 text-sm text-surface-500">{{ schedule }}</p>
        </div>
      </section>

      <!-- Timer and history -->
      <section
        class="rounded-xl border border-surface-200 p-4 dark:border-surface-800"
      >
        <div
          class="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-surface-200 pb-3 dark:border-surface-800"
        >
          <h3 class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <i class="pi pi-hourglass text-amber-500" aria-hidden="true" />
            Timer
          </h3>
          <span class="text-xs text-surface-500">
            {{ timerModeLabel }}
          </span>
        </div>

        <div class="grid grid-cols-1 gap-5 md:grid-cols-12">
          <!-- Large timer display -->
          <div
            class="md:col-span-5 md:border-r md:border-surface-200 md:pr-5 dark:md:border-surface-800"
          >
            <div
              class="rounded-xl border border-surface-200 bg-surface-50 px-4 py-8 text-center dark:border-surface-700 dark:bg-surface-800/60"
              data-testid="viewer-timer-display"
            >
              <template v-if="hasTimer">
                <p class="text-xs font-semibold uppercase tracking-wide text-surface-500">
                  {{ timerStatusLabel }}
                </p>

                <p class="mt-3 font-mono text-5xl font-bold tabular-nums tracking-tight">
                  {{ displayTime }}
                </p>

                <template v-if="isCountDown">
                  <p class="mt-3 text-xs text-surface-500">
                    Target: {{ formatDurationBadge(targetDurationSeconds) }}
                  </p>
                  <ProgressBar
                    :value="progressPercent"
                    :show-value="false"
                    class="mt-4 !h-1.5"
                  />
                </template>
              </template>

              <template v-else>
                <i class="pi pi-clock text-2xl text-surface-400" aria-hidden="true" />
                <p class="mt-3 text-sm text-surface-500">
                  No timer configured.
                </p>
              </template>
            </div>
          </div>

          <!-- Time history -->
          <div class="min-w-0 md:col-span-7">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-semibold">Time history</h3>
              <Tag
                v-if="!loading && !loadError"
                :value="String(entries.length)"
                severity="secondary"
              />
              <span
                v-if="!loading && !loadError"
                class="text-xs font-medium text-primary"
              >
                {{ formatDurationBadge(totalSeconds) }} total
              </span>
            </div>

            <p v-if="loading" role="status" class="text-sm text-surface-500">
              Loading time history...
            </p>

            <Message v-else-if="loadError" severity="error" :closable="false">
              {{ loadError }}
            </Message>

            <p v-else-if="entries.length === 0" class="text-sm text-surface-500">
              No time recorded yet.
            </p>

            <ul
              v-else
              class="flex max-h-96 flex-col gap-3 overflow-y-auto pr-1"
              aria-label="Recorded time sessions"
            >
              <li
                v-for="entry in entries"
                :key="entry.id"
                class="rounded-xl border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800/40"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <Tag
                    :value="formatDurationBadge(entry.durationSeconds)"
                    severity="info"
                  />
                  <span class="text-xs text-surface-500">
                    {{ formatDateLabel(entry.startedAt) }}
                    &middot;
                    {{ formatTimeRange(entry.startedAt, entry.endedAt) }}
                  </span>
                </div>

                <p
                  class="mt-3 whitespace-pre-wrap break-words text-sm"
                  :class="{ 'text-surface-500': !entry.note }"
                >
                  {{ entry.note || 'No session note recorded.' }}
                </p>

                <p
                  v-if="entry.user?.email"
                  class="mt-3 break-all text-xs text-surface-500"
                >
                  {{ entry.user.email }}
                </p>
              </li>
            </ul>
          </div>
        </div>
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
  TASK_PRIORITY_CONFIG,
  TIMER_MODE_CONFIG,
} from '~/api/kanban'
import {
  formatDateLabel,
  formatDurationBadge,
  formatTimeRange,
  sumEntryDurations,
  useTaskTimer
} from '~/composables/useTaskTimer'

const props = defineProps<{
  task: KanbanTaskDto | null
}>()

const visible = defineModel<boolean>('visible', { required: true })
const context = inject(kanbanContextKey, null)

const priorityConfig = computed(() => {
  const priority = props.task?.priority
  return priority ? TASK_PRIORITY_CONFIG[priority] : null
})

const hasTimer = computed(() => {
  const timer = props.task?.timer
  return timer != null && timer.mode !== 'NONE'
})

const timerModeLabel = computed(() => {
  const mode = props.task?.timer?.mode ?? 'NONE'
  return TIMER_MODE_CONFIG[mode].label
})

const {
  displayTime,
  isCountDown,
  progressPercent,
  targetDurationSeconds,
} = useTaskTimer(() =>
  visible.value ? props.task?.timer : null,
)

const timerStatusLabel = computed(() => {
  const timer = props.task?.timer

  if (timer?.state === 'PAUSED') return 'Paused at'

  if (timer?.state === 'RUNNING') {
    return timer.mode === 'COUNT_DOWN'
      ? 'Remaining time'
      : 'Elapsed time'
  }

  return timer?.mode === 'COUNT_DOWN'
    ? 'Target interval'
    : 'Elapsed time'
})

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
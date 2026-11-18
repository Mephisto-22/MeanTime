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
      <div class="flex flex-col items-start gap-2">
        <Tag value="Viewer access" severity="info" />
        <h2 class="text-xl font-bold tracking-tight break-words">
          {{ task.title }}
        </h2>
      </div>

      <Divider class="my-0" />

      <!-- Properties: same grouping as the editor -->
      <div class="flex flex-col gap-5 md:flex-row md:items-stretch">
        <dl class="flex flex-col gap-4 md:w-5/12">
          <div class="flex flex-col gap-1.5">
            <dt class="text-xs font-semibold text-surface-500 dark:text-surface-400">
              Column
            </dt>
            <dd class="text-sm font-medium">
              {{ columnTitle || 'Not specified' }}
            </dd>
          </div>

          <div class="flex flex-col gap-1.5">
            <dt class="text-xs font-semibold text-surface-500 dark:text-surface-400">
              Priority
            </dt>
            <dd>
              <Tag
                v-if="priorityConfig"
                :class="priorityConfig.badgeClass"
              >
                <span class="inline-flex items-center gap-2">
                  <span
                    class="h-2 w-2 rounded-full"
                    :class="priorityConfig.dotClass"
                    aria-hidden="true"
                  />
                  {{ priorityConfig.label }}
                </span>
              </Tag>
              <span v-else class="text-sm text-surface-500">
                No priority
              </span>
            </dd>
          </div>
        </dl>

        <Divider layout="vertical" class="hidden md:flex mx-0" />

        <section
          class="flex flex-1 flex-col gap-3 min-w-0"
          aria-labelledby="viewer-tags-heading"
        >
          <div class="flex items-center justify-between gap-3">
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
            <Tag
              v-for="tag in task.tags"
              :key="tag.id"
              :value="tag.name"
              severity="secondary"
              rounded
              class="max-w-full break-words"
            />
          </div>

          <p v-else class="text-sm text-surface-500">
            No tags attached.
          </p>
        </section>
      </div>

      <Divider class="my-0" />

      <!-- Description -->
      <Panel
        aria-labelledby="viewer-description-heading"
        :pt="{ header: 'pb-0 border-b-0', content: 'pt-2' }"
      >
        <template #header>
          <h3
            id="viewer-description-heading"
            class="text-xs font-semibold text-surface-500 dark:text-surface-400"
          >
            Notes &amp; Description
          </h3>
        </template>
        <div
          tabindex="0"
          role="region"
          aria-labelledby="viewer-description-heading"
          class="max-h-48 min-h-20 overflow-y-auto"
        >
          <p
            class="whitespace-pre-wrap break-words text-sm leading-relaxed"
            :class="{ 'text-surface-500': !task.description?.trim() }"
          >
            {{ task.description?.trim() ? task.description : 'No description provided.' }}
          </p>
        </div>
      </Panel>

      <!-- Recurrence -->
      <Panel v-if="schedule">
        <div class="flex items-start gap-3">
          <i class="pi pi-sync text-surface-500" aria-hidden="true" />
          <div class="flex flex-col gap-1">
            <h3 class="text-sm font-semibold">Repeat schedule</h3>
            <p class="text-sm text-surface-500">{{ schedule }}</p>
          </div>
        </div>
      </Panel>

      <!-- Timer and history -->
      <Panel :pt="{ content: 'flex flex-col gap-4' }">
        <template #header>
          <div class="flex flex-1 flex-wrap items-center justify-between gap-2">
            <h3 class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              <i class="pi pi-hourglass text-amber-500" aria-hidden="true" />
              Timer
            </h3>
            <span class="text-xs text-surface-500">
              {{ timerModeLabel }}
            </span>
          </div>
        </template>

        <div class="flex flex-col gap-5 md:flex-row md:items-stretch">
          <!-- Large timer display -->
          <div class="md:w-5/12">
            <Card
              class="border border-surface-200 bg-surface-50 shadow-none dark:border-surface-700 dark:bg-surface-800/60"
              :pt="{ body: 'px-4 py-8 text-center', content: 'flex flex-col items-center gap-3 p-0' }"
              data-testid="viewer-timer-display"
            >
              <template #content>
                <template v-if="hasTimer">
                  <p class="text-xs font-semibold uppercase tracking-wide text-surface-500">
                    {{ timerStatusLabel }}
                  </p>

                  <p class="font-mono text-5xl font-bold tabular-nums tracking-tight">
                    {{ displayTime }}
                  </p>

                  <template v-if="isCountDown">
                    <p class="text-xs text-surface-500">
                      Target: {{ formatDurationBadge(targetDurationSeconds) }}
                    </p>
                    <ProgressBar
                      :value="progressPercent"
                      :show-value="false"
                      class="self-stretch !h-1.5"
                    />
                  </template>
                </template>

                <template v-else>
                  <i class="pi pi-clock text-2xl text-surface-400" aria-hidden="true" />
                  <p class="text-sm text-surface-500">
                    No timer configured.
                  </p>
                </template>
              </template>
            </Card>
          </div>

          <Divider layout="vertical" class="hidden md:flex mx-0" />

          <!-- Time history -->
          <div class="flex flex-1 flex-col gap-3 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-semibold">Time history</h3>
              <Tag
                v-if="!loading && !hasLoadError"
                :value="String(entries.length)"
                severity="secondary"
              />
              <span
                v-if="!loading && !hasLoadError"
                class="text-xs font-medium text-primary"
              >
                {{ formatDurationBadge(totalSeconds) }} total
              </span>
            </div>

            <p v-if="loading" role="status" class="text-sm text-surface-500">
              Loading time history...
            </p>

            <Message v-else-if="hasLoadError" severity="error" :closable="false">
              <div class="flex flex-wrap items-center gap-3">
                <span>Unable to load time history.</span>
                <Button
                  label="Try again"
                  icon="pi pi-refresh"
                  severity="danger"
                  text
                  size="small"
                  @click="retryLoadTimeEntries"
                />
              </div>
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
              >
                <Card
                  class="border border-surface-200 bg-surface-50 shadow-none dark:border-surface-700 dark:bg-surface-800/40"
                  :pt="{ body: 'p-3', content: 'flex flex-col gap-3 p-0' }"
                >
                  <template #content>
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
                      class="whitespace-pre-wrap break-words text-sm"
                      :class="{ 'text-surface-500': !entry.note }"
                    >
                      {{ entry.note || 'No session note recorded.' }}
                    </p>

                    <p
                      v-if="entry.user?.email"
                      class="break-all text-xs text-surface-500"
                    >
                      {{ entry.user.email }}
                    </p>
                  </template>
                </Card>
              </li>
            </ul>
          </div>
        </div>
      </Panel>
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
const notify = useNotifications()

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
const hasLoadError = ref(false)
let activeRequestToken = 0

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

async function loadTimeEntries(taskId: string | number) {
  const requestToken = ++activeRequestToken
  entries.value = []
  hasLoadError.value = false
  loading.value = true

  try {
    const result = await kanbanApi.listTimeEntries(taskId)
    if (requestToken === activeRequestToken) {
      entries.value = result
    }
  } catch (err) {
    if (requestToken === activeRequestToken) {
      hasLoadError.value = true
      notify.error(err, 'Unable to load time history.')
    }
  } finally {
    if (requestToken === activeRequestToken) {
      loading.value = false
    }
  }
}

function retryLoadTimeEntries() {
  if (props.task?.id != null) {
    void loadTimeEntries(props.task.id)
  }
}

watch(
  () => [visible.value, props.task?.id] as const,
  ([isOpen, taskId], _, onCleanup) => {
    onCleanup(() => { activeRequestToken++ })

    if (!isOpen || taskId == null) return
    void loadTimeEntries(taskId)
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

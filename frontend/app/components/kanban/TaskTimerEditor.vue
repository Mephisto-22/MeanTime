<template>
  <Card
    data-testid="task-timer-editor"
    class="border border-surface-200 dark:border-surface-800 shadow-xs"
    :pt="{ body: 'p-4 flex flex-col gap-4', content: 'p-0 flex flex-col gap-4' }"
  >
    <template #content>
      <!-- Section Header with Mode Dropdown & Status -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-surface-200/80 pb-3 dark:border-surface-800">
        <div class="flex items-center gap-2">
          <i class="pi pi-hourglass text-amber-500 text-sm" />
          <h3 class="text-xs font-semibold uppercase tracking-wider text-surface-600 dark:text-surface-300">
            Focus & Work Journal
          </h3>
          <Tag
            v-if="isRunning"
            :class="TIMER_STATE_CONFIG.RUNNING.badgeClass"
            class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold"
          >
            <span class="h-1.5 w-1.5 rounded-full" :class="TIMER_STATE_CONFIG.RUNNING.dotClass" />
            {{ TIMER_STATE_CONFIG.RUNNING.label }}
          </Tag>
          <Tag
            v-else-if="isPaused"
            :class="TIMER_STATE_CONFIG.PAUSED.badgeClass"
            class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold"
          >
            <i class="pi pi-pause text-[8px]" />
            {{ TIMER_STATE_CONFIG.PAUSED.label }}
          </Tag>
        </div>

        <!-- Mode Selector: Clean Select Dropdown -->
        <div class="flex items-center gap-2">
          <Label for="timer-mode-select" class="text-xs text-surface-500">Mode:</Label>
          <Select
            id="timer-mode-select"
            v-model="localTimer.mode"
            :options="modeOptions"
            option-label="label"
            option-value="value"
            size="small"
            :disabled="isRunning || isPaused"
            class="!text-xs !w-44"
            data-testid="timer-mode-select"
            @change="onModeChange"
          />
        </div>
      </div>

      <!-- Asymmetric 2-Column Split: Left Focus Desk (42%) & Right Activity Chronicle (58%) -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-5">
        <!-- Left Column: Active Focus Instrument (5 cols / ~42%) -->
        <div class="flex flex-col gap-3 md:col-span-5 md:pr-4 md:border-r md:border-surface-200 dark:md:border-surface-800">
          <div class="flex items-center justify-between text-xs font-medium text-surface-500">
            <Label class="text-xs font-medium text-surface-500">Active Instrument</Label>
            <span v-if="localTimer.mode !== 'NONE'" class="text-[11px] text-surface-400">
              {{ localTimer.mode === 'COUNT_DOWN' ? 'Countdown Block' : 'Stopwatch' }}
            </span>
          </div>

          <!-- If Mode is NONE: Clean Callout to Enable -->
          <Card
            v-if="localTimer.mode === 'NONE'"
            class="border border-dashed border-surface-200 dark:border-surface-800 text-surface-400 text-xs text-center shadow-none bg-transparent"
            :pt="{ body: 'p-6 flex flex-col items-center justify-center gap-2', content: 'p-0 flex flex-col items-center gap-2' }"
          >
            <template #content>
              <i class="pi pi-clock text-lg opacity-40" />
              <span>Timer disabled for this task.</span>
              <Button
                label="Enable Countdown (25m)"
                size="small"
                text
                class="!text-xs"
                @click="setMode('COUNT_DOWN')"
              />
            </template>
          </Card>

          <!-- Active Focus Stage -->
          <template v-else>
            <!-- Countdown Duration Config: Presets + Custom Target Input -->
            <div v-if="localTimer.mode === 'COUNT_DOWN'" class="flex flex-col gap-2">
              <div class="flex items-center justify-between text-[11px] text-surface-600 dark:text-surface-400">
                <Label class="font-medium">Target duration:</Label>
                <Tag
                  :value="`${targetMinutes} min`"
                  severity="secondary"
                  class="font-bold text-surface-900 dark:text-surface-100 font-mono !text-[11px] !py-0.5 !px-2"
                />
              </div>

              <!-- Quick-Pick Presets -->
              <div class="flex items-center gap-1.5">
                <Button
                  v-for="p in [15, 25, 45, 60]"
                  :key="p"
                  type="button"
                  :label="`${p}m`"
                  size="small"
                  :severity="targetMinutes === p ? 'primary' : 'secondary'"
                  :outlined="targetMinutes !== p"
                  :disabled="isRunning || isPaused"
                  class="!text-xs !py-1 !px-2 flex-1 cursor-pointer"
                  :data-testid="`timer-preset-${p}`"
                  @click="setPresetMinutes(p)"
                />
              </div>
            </div>

            <!-- Digital Readout Display Slab (Double-Click to Edit Custom Target) -->
            <Card
              class="group text-center transition-all border border-surface-200/80 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-800/60 shadow-none"
              :class="{ 'ring-2 ring-primary-500/50 bg-primary-50/20 dark:bg-primary-950/20': isEditingTarget }"
              :pt="{ body: 'p-4 flex flex-col items-center justify-center gap-1', content: 'p-0 w-full flex flex-col items-center gap-1' }"
            >
              <template #content>
                <!-- Header Label / Inline Edit Prompt -->
                <div class="flex items-center justify-center gap-1 text-[10px] uppercase font-bold tracking-wider text-surface-400">
                  <span v-if="isEditingTarget" class="text-primary-600 dark:text-primary-400 flex items-center gap-1">
                    <i class="pi pi-pencil text-[9px]" />
                    Type Target (e.g. 30, 45:00) & Enter
                  </span>
                  <span v-else>
                    {{ isRunning ? 'Remaining Time' : (isPaused ? 'Paused At' : 'Target Interval') }}
                  </span>
                </div>

                <!-- Readout when NOT editing -->
                <div
                  v-if="!isEditingTarget"
                  data-testid="timer-digital-readout"
                  class="font-mono text-3xl font-bold tracking-normal tabular-nums text-surface-900 dark:text-surface-100 select-none transition-transform"
                  :class="{
                    'cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 hover:scale-[1.02]': !isRunning && !isPaused && localTimer.mode === 'COUNT_DOWN'
                  }"
                  :title="(!isRunning && !isPaused && localTimer.mode === 'COUNT_DOWN') ? 'Double-click to set custom target' : undefined"
                  @dblclick="startEditingTarget"
                >
                  {{ displayTime }}
                </div>

                <!-- Inline Input when double-clicked -->
                <div v-else class="flex items-center justify-center py-0.5">
                  <InputText
                    ref="targetInputRef"
                    v-model="targetInputText"
                    type="text"
                    maxlength="8"
                    class="font-mono !text-3xl !font-bold !tracking-normal !tabular-nums !text-center !bg-transparent !border-0 !border-b-2 !border-primary-500 !text-surface-900 dark:!text-surface-100 !focus:outline-none !w-36 !py-0 !shadow-none"
                    data-testid="timer-inline-target-input"
                    placeholder="25:00"
                    @keydown.enter="commitTargetInput"
                    @keydown.esc="cancelTargetEditing"
                    @blur="commitTargetInput"
                  />
                </div>

                <!-- Double-Click Hint (Shown when IDLE in COUNT_DOWN mode) -->
                <div
                  v-if="!isEditingTarget && !isRunning && !isPaused && localTimer.mode === 'COUNT_DOWN'"
                  class="text-[10px] text-surface-400 opacity-60 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 cursor-pointer select-none"
                  title="Double-click to edit custom target"
                  @click="startEditingTarget"
                >
                  <i class="pi pi-pencil text-[8px]" />
                  <span>Double-click timer to set time</span>
                </div>

                <!-- Hairline Progress Line -->
                <div v-if="localTimer.mode === 'COUNT_DOWN'" class="w-full mt-2">
                  <ProgressBar
                    :value="progressPercent"
                    :show-value="false"
                    class="!h-1.5 rounded-full overflow-hidden"
                  />
                  <div class="flex justify-between text-[10px] text-surface-400 mt-1">
                    <span>{{ progressPercent }}% elapsed</span>
                    <span>{{ formatDigital(elapsedSeconds) }}</span>
                  </div>
                </div>
              </template>
            </Card>

            <!-- 3 Persistent Rounded-Square Buttons Across the Bottom (Evenly Stretched Full Width) -->
            <div class="grid grid-cols-3 gap-2 w-full pt-1">
              <!-- 1. Start / Resume Button (Disabled when RUNNING) -->
              <Button
                type="button"
                severity="primary"
                :disabled="isRunning"
                class="!w-full !h-10 rounded-lg flex items-center justify-center cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:opacity-30 transition-all"
                style="width: 100% !important;"
                :title="isPaused ? 'Resume Focus Session' : 'Start Focus Session'"
                :aria-label="isPaused ? 'Resume Focus Session' : 'Start Focus Session'"
                data-testid="timer-btn-start"
                @click="handleStart"
              >
                <i class="pi pi-play text-base" />
              </Button>

              <!-- 2. Pause Button (Disabled when NOT RUNNING) -->
              <Button
                type="button"
                severity="warn"
                :disabled="!isRunning"
                class="!w-full !h-10 rounded-lg flex items-center justify-center cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:opacity-30 transition-all"
                style="width: 100% !important;"
                title="Pause Focus Session"
                aria-label="Pause Focus Session"
                data-testid="timer-btn-pause"
                @click="handlePause"
              >
                <i class="pi pi-pause text-base" />
              </Button>

              <!-- 3. Stop Button (Disabled when IDLE) -->
              <Button
                type="button"
                severity="danger"
                outlined
                :disabled="isIdle"
                class="!w-full !h-10 rounded-lg flex items-center justify-center cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:opacity-30 transition-all"
                style="width: 100% !important;"
                title="Stop & Save Session"
                aria-label="Stop & Save Session"
                data-testid="timer-btn-stop"
                @click="handleStop"
              >
                <i class="pi pi-stop text-base" />
              </Button>
            </div>
          </template>
        </div>

        <!-- Right Column: Activity Chronicle & Past Work (7 cols / ~58%) -->
        <div class="flex flex-col gap-3 md:col-span-7">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-xs font-medium text-surface-500">
              <Label class="text-xs font-medium text-surface-500">Session Chronicle</Label>
              <Tag
                :value="`(${entries.length})`"
                severity="secondary"
                rounded
                class="!text-[10px] !py-0 !px-1.5 font-bold"
              />
              <span v-if="totalDurationSeconds > 0" class="text-xs text-primary-600 dark:text-primary-400 font-semibold">
                &bull; {{ formatDurationBadge(totalDurationSeconds) }} total
              </span>
            </div>

            <Button
              type="button"
              icon="pi pi-plus"
              :label="isManualLogOpen ? 'Cancel' : 'Log past work'"
              size="small"
              text
              class="!text-xs !py-0.5"
              data-testid="btn-toggle-log-past-work"
              @click="toggleManualLog"
            />
          </div>

          <!-- "Log Past Work" Form with Start/End Times and Symmetrical Grid Spacing -->
          <Card
            v-if="isManualLogOpen"
            data-testid="manual-work-form"
            class="border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/80 shadow-xs"
            :pt="{ body: 'p-3.5 flex flex-col gap-3 text-xs', content: 'p-0 flex flex-col gap-3' }"
          >
            <template #content>
              <div class="flex items-center justify-between border-b border-surface-200 dark:border-surface-700 pb-2">
                <span class="font-bold text-surface-800 dark:text-surface-100">Log Past Work Session</span>
                <span class="text-[10px] text-surface-400 font-mono">Calculated duration: {{ formatDurationBadge((Number(manualDurationMinutes) || 0) * 60) }}</span>
              </div>

              <!-- Row 1: Date (Flex-1) and Duration (Fixed Width Stepper) -->
              <div class="flex items-center gap-3">
                <!-- Date (takes natural expanded space) -->
                <div class="flex-1 min-w-0 flex flex-col gap-1">
                  <Label for="manual-date" class="text-[10px] font-semibold uppercase tracking-wider text-surface-500">Date</Label>
                  <InputText
                    id="manual-date"
                    v-model="manualDate"
                    type="date"
                    fluid
                    class="!text-xs !py-1.5 !px-2.5"
                    data-testid="manual-input-date"
                  />
                </div>

                <!-- Duration (compact dedicated stepper) -->
                <div class="w-28 shrink-0 flex flex-col gap-1">
                  <Label for="manual-duration-mins" class="text-[10px] font-semibold uppercase tracking-wider text-surface-500">Duration</Label>
                  <InputNumber
                    id="manual-duration-mins"
                    v-model="manualDurationMinutes"
                    suffix=" min"
                    :min="1"
                    :max="1440"
                    fluid
                    input-class="!text-xs !py-1.5 !px-2 !text-center"
                    data-testid="manual-input-duration"
                    @update:model-value="onManualDurationInputChanged"
                  />
                </div>
              </div>

              <!-- Row 2: Start Time and End Time (Spacious 2-Column Split) -->
              <div class="grid grid-cols-2 gap-3">
                <!-- Start Time -->
                <div class="flex flex-col gap-1">
                  <Label for="manual-start-time" class="text-[10px] font-semibold uppercase tracking-wider text-surface-500">Start Time</Label>
                  <InputText
                    id="manual-start-time"
                    v-model="manualStartTime"
                    type="time"
                    fluid
                    class="!text-xs !py-1.5 !px-2.5"
                    data-testid="manual-input-start-time"
                    @change="onManualTimeInputChanged"
                  />
                </div>

                <!-- End Time -->
                <div class="flex flex-col gap-1">
                  <Label for="manual-end-time" class="text-[10px] font-semibold uppercase tracking-wider text-surface-500">End Time</Label>
                  <InputText
                    id="manual-end-time"
                    v-model="manualEndTime"
                    type="time"
                    fluid
                    class="!text-xs !py-1.5 !px-2.5"
                    data-testid="manual-input-end-time"
                    @change="onManualTimeInputChanged"
                  />
                </div>
              </div>

              <!-- Row 3: Note Field (Dedicated Full-Width Space) -->
              <div class="flex flex-col gap-1">
                <Label for="manual-session-note" class="text-[10px] font-semibold uppercase tracking-wider text-surface-500">Session Note</Label>
                <InputText
                  id="manual-session-note"
                  v-model="manualNote"
                  placeholder="What did you accomplish in this session?"
                  fluid
                  class="!text-xs !py-1.5"
                  data-testid="manual-input-note"
                />
              </div>

              <!-- Row 4: Action Buttons -->
              <div class="flex justify-end gap-2 pt-1 border-t border-surface-200/80 dark:border-surface-700">
                <Button
                  label="Cancel"
                  size="small"
                  text
                  severity="secondary"
                  class="!text-xs"
                  @click="isManualLogOpen = false"
                />
                <Button
                  label="Record Session"
                  icon="pi pi-check"
                  size="small"
                  severity="primary"
                  class="!text-xs"
                  data-testid="manual-save-btn"
                  @click="submitManualEntry"
                />
              </div>
            </template>
          </Card>

          <!-- Sessions List (With Full Time & Duration Editing) -->
          <div v-if="entries.length > 0" class="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
            <Card
              v-for="entry in entries"
              :key="entry.id"
              :data-testid="`session-entry-${entry.id}`"
              class="group relative border border-surface-200/90 bg-surface-50/50 transition-all hover:bg-surface-50 dark:border-surface-800 dark:bg-surface-800/40 dark:hover:bg-surface-800/80 shadow-none"
              :pt="{ body: 'p-3 flex flex-col gap-2 text-xs', content: 'p-0 flex flex-col gap-2' }"
            >
              <template #content>
                <!-- Normal View (When Not Editing this Entry) -->
                <template v-if="editingEntryId !== entry.id">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <Tag
                        :value="formatDurationBadge(entry.durationSeconds ?? entry.duration_seconds)"
                        class="font-mono text-[11px] font-bold !bg-primary-100/70 !text-primary-700 dark:!bg-primary-950 dark:!text-primary-300 !border-0"
                      />
                      <span class="text-[11px] text-surface-500 font-medium">
                        {{ formatDateLabel(entry.startedAt ?? entry.started_at) }} &bull; {{ formatTimeRange(entry.startedAt ?? entry.started_at, entry.endedAt ?? entry.ended_at) }}
                      </span>
                    </div>

                    <!-- Actions: Edit & Delete -->
                    <div class="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      <Button
                        type="button"
                        icon="pi pi-pencil"
                        size="small"
                        text
                        severity="secondary"
                        class="!h-6 !w-6 !p-0 text-surface-500 hover:text-surface-900 dark:hover:text-surface-100"
                        title="Edit session time & duration"
                        aria-label="Edit session"
                        :data-testid="`btn-edit-session-${entry.id}`"
                        @click="startEditingSession(entry)"
                      />
                      <Button
                        type="button"
                        icon="pi pi-trash"
                        size="small"
                        text
                        severity="danger"
                        class="!h-6 !w-6 !p-0 text-surface-400 hover:text-red-500"
                        title="Delete session"
                        aria-label="Delete session"
                        :data-testid="`btn-delete-session-${entry.id}`"
                        @click="deleteEntry(entry.id)"
                      />
                    </div>
                  </div>

                  <!-- Note Display -->
                  <p
                    class="text-surface-700 dark:text-surface-200 text-xs leading-relaxed cursor-pointer hover:text-primary-600 transition-colors"
                    title="Click to edit session"
                    @click="startEditingSession(entry)"
                  >
                    {{ entry.note || '(No session note recorded)' }}
                  </p>
                </template>

                <!-- Inline Session Editor (When Editing this Entry) -->
                <Card
                  v-else
                  data-testid="inline-session-editor"
                  class="border border-primary-200 dark:border-primary-800 bg-surface-0 dark:bg-surface-900 shadow-none"
                  :pt="{ body: 'p-2.5 flex flex-col gap-2.5', content: 'p-0 flex flex-col gap-2.5' }"
                >
                  <template #content>
                    <div class="text-[11px] font-bold text-primary-600 dark:text-primary-400">
                      Edit Work Session
                    </div>

                    <!-- Editable Timestamps & Duration (Spacious Multi-Row Layout) -->
                    <!-- Row 1: Date + Duration Stepper -->
                    <div class="flex items-center gap-2.5">
                      <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                        <Label class="text-[10px] uppercase font-semibold text-surface-400">Date</Label>
                        <InputText
                          v-model="editDate"
                          type="date"
                          fluid
                          class="!text-xs !py-1 !px-2"
                        />
                      </div>
                      <div class="w-28 shrink-0 flex flex-col gap-0.5">
                        <Label class="text-[10px] uppercase font-semibold text-surface-400">Duration</Label>
                        <InputNumber
                          v-model="editDurationMinutes"
                          suffix=" min"
                          :min="1"
                          :max="1440"
                          fluid
                          input-class="!text-xs !py-1 !px-2 !text-center"
                          data-testid="edit-session-duration"
                          @update:model-value="onEditDurationChanged"
                        />
                      </div>
                    </div>

                    <!-- Row 2: Start Time & End Time -->
                    <div class="grid grid-cols-2 gap-2.5">
                      <div class="flex flex-col gap-0.5">
                        <Label class="text-[10px] uppercase font-semibold text-surface-400">Start Time</Label>
                        <InputText
                          v-model="editStartTime"
                          type="time"
                          fluid
                          class="!text-xs !py-1 !px-2"
                          @change="onEditTimeChanged"
                        />
                      </div>
                      <div class="flex flex-col gap-0.5">
                        <Label class="text-[10px] uppercase font-semibold text-surface-400">End Time</Label>
                        <InputText
                          v-model="editEndTime"
                          type="time"
                          fluid
                          class="!text-xs !py-1 !px-2"
                          @change="onEditTimeChanged"
                        />
                      </div>
                    </div>

                    <!-- Editable Note -->
                    <div class="flex flex-col gap-0.5">
                      <Label class="text-[10px] uppercase font-semibold text-surface-400">Note</Label>
                      <InputText
                        v-model="editNoteText"
                        placeholder="Session notes..."
                        fluid
                        class="!text-xs !py-1"
                        data-testid="edit-session-note"
                        @keydown.enter="saveSessionEdits(entry)"
                      />
                    </div>

                    <!-- Edit Action Buttons -->
                    <div class="flex justify-end gap-1.5 pt-1 border-t border-surface-200/80 dark:border-surface-700">
                      <Button
                        label="Cancel"
                        size="small"
                        text
                        severity="secondary"
                        class="!text-xs"
                        @click="editingEntryId = null"
                      />
                      <Button
                        label="Save Changes"
                        icon="pi pi-check"
                        size="small"
                        severity="primary"
                        class="!text-xs"
                        data-testid="btn-save-session-edits"
                        @click="saveSessionEdits(entry)"
                      />
                    </div>
                  </template>
                </Card>
              </template>
            </Card>
          </div>

          <div v-else class="text-xs text-surface-400 italic py-4 text-center">
            No work sessions recorded yet. Start tracking or click "+ Log past work" above.
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, inject, onMounted } from 'vue'
import type { TaskTimerDto, TaskTimeEntryDto, TimerMode } from '~/api/kanban'
import {
  TIMER_MODE_CONFIG,
  TIMER_STATE_CONFIG,
  kanbanApi,
  kanbanContextKey,
  normalizeTimeEntry,
  normalizeTaskTimer,
} from '~/api/kanban'
import {
  useTaskTimer,
  formatDigital,
  formatDurationBadge,
  formatTimeRange,
  formatDateLabel,
  toLocalTimeString,
  toLocalDateString,
  combineDateAndTime,
} from '~/composables/useTaskTimer'

const props = defineProps<{
  timer?: TaskTimerDto | null
  timeEntries?: TaskTimeEntryDto[]
  taskId: string | number
}>()

const emit = defineEmits<{
  (e: 'update:timer', timer: TaskTimerDto): void
  (e: 'update:timeEntries', entries: TaskTimeEntryDto[]): void
  (e: 'timerExpired', entry: TaskTimeEntryDto): void
}>()

const kanbanContext = inject(kanbanContextKey, null)

const modeOptions = [
  { label: TIMER_MODE_CONFIG.NONE.label, value: 'NONE' },
  { label: `Stopwatch (${TIMER_MODE_CONFIG.COUNT_UP.label})`, value: 'COUNT_UP' },
  { label: `Countdown (${TIMER_MODE_CONFIG.COUNT_DOWN.label})`, value: 'COUNT_DOWN' },
]

const localTimer = ref<TaskTimerDto>({
  taskId: props.taskId,
  mode: props.timer?.mode ?? 'NONE',
  targetDurationSeconds: props.timer?.targetDurationSeconds ?? 1500,
  state: props.timer?.state ?? 'IDLE',
  startedAt: props.timer?.startedAt ?? null,
  elapsedSeconds: props.timer?.elapsedSeconds ?? 0,
})

const entries = ref<TaskTimeEntryDto[]>(
  props.timeEntries ? props.timeEntries.map(normalizeTimeEntry) : [],
)

const isPersistedTaskId = computed(() => {
  if (!props.taskId) return false
  const str = String(props.taskId)
  return !str.startsWith('draft') && !str.startsWith('new') && !str.startsWith('temp')
})

const loadPersistedEntries = async () => {
  if (!isPersistedTaskId.value) {
    if (!props.timeEntries || props.timeEntries.length === 0) {
      entries.value = []
    }
    return
  }
  try {
    const data = await kanbanApi.listTimeEntries(props.taskId)
    if (data && Array.isArray(data)) {
      entries.value = data.map(normalizeTimeEntry)
      syncEntriesOut()
    }
  } catch {
    // Fallback gracefully
  }
}

onMounted(() => {
  if (props.timeEntries && props.timeEntries.length > 0) {
    entries.value = props.timeEntries.map(normalizeTimeEntry)
  } else if (!props.timeEntries) {
    loadPersistedEntries()
  }
})

watch(
  () => props.taskId,
  (newId) => {
    if (newId) {
      localTimer.value.taskId = newId
      loadPersistedEntries()
    }
  },
)

watch(
  () => props.timer,
  (t) => {
    if (t) localTimer.value = normalizeTaskTimer(t)
  },
  { deep: true },
)

watch(
  () => props.timeEntries,
  (list) => {
    if (list && list.length > 0) {
      entries.value = list.map(normalizeTimeEntry)
    } else if (list && list.length === 0) {
      entries.value = []
    } else {
      loadPersistedEntries()
    }
  },
  { deep: true },
)

const syncTimerOut = () => emit('update:timer', { ...localTimer.value })
const syncEntriesOut = () => emit('update:timeEntries', [...entries.value])

// Target duration & inline editing
const targetMinutes = computed(() => {
  const target = localTimer.value.targetDurationSeconds ?? localTimer.value.target_duration_seconds ?? 1500
  return Math.floor(target / 60)
})
const customMinutes = ref(targetMinutes.value)

watch(targetMinutes, (m) => {
  customMinutes.value = m
})

// Inline double-click editing on the digital readout
const isEditingTarget = ref(false)
const targetInputText = ref('')
const targetInputRef = ref<any>(null)

const startEditingTarget = () => {
  if (isRunning.value || isPaused.value || localTimer.value.mode !== 'COUNT_DOWN') return
  isEditingTarget.value = true
  targetInputText.value = formatDigital(localTimer.value.targetDurationSeconds || 1500)
  nextTick(() => {
    const el = targetInputRef.value?.$el ?? targetInputRef.value
    if (el?.focus) {
      el.focus()
      el.select?.()
    }
  })
}

const parseTargetDurationString = (input: string): number | null => {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null

  // If format "MM:SS" e.g. "25:00" or "10:30"
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(Number)
    const mins = parts[0] ?? 0
    const secs = parts[1] ?? 0
    const total = mins * 60 + secs
    return total > 0 ? total : null
  }

  // If format "45m" or "45min"
  if (trimmed.endsWith('m') || trimmed.endsWith('min')) {
    const num = parseFloat(trimmed)
    if (!isNaN(num) && num > 0) return Math.round(num * 60)
  }

  // If format "30s" or "30sec"
  if (trimmed.endsWith('s') || trimmed.endsWith('sec')) {
    const num = parseFloat(trimmed)
    if (!isNaN(num) && num > 0) return Math.round(num)
  }

  // If plain number e.g. "35" or "10", treat as minutes
  const val = parseFloat(trimmed)
  if (!isNaN(val) && val > 0) {
    return Math.round(val * 60)
  }

  return null
}

const commitTargetInput = () => {
  if (!isEditingTarget.value) return
  const parsedSeconds = parseTargetDurationString(targetInputText.value)
  if (parsedSeconds && parsedSeconds >= 10 && parsedSeconds <= 720 * 60) {
    localTimer.value.targetDurationSeconds = parsedSeconds
    customMinutes.value = Math.round(parsedSeconds / 60)
    syncTimerOut()
  }
  isEditingTarget.value = false
}

const cancelTargetEditing = () => {
  isEditingTarget.value = false
}

const setPresetMinutes = (m: number) => {
  if (isRunning.value || isPaused.value) return
  localTimer.value.targetDurationSeconds = m * 60
  customMinutes.value = m
  syncTimerOut()
}

const onModeChange = () => {
  if (localTimer.value.mode === 'COUNT_DOWN' && !localTimer.value.targetDurationSeconds) {
    localTimer.value.targetDurationSeconds = 1500
  }
  syncTimerOut()
}

const setMode = (m: TimerMode) => {
  localTimer.value.mode = m
  onModeChange()
}

const totalDurationSeconds = computed(() => {
  return entries.value.reduce((acc, cur) => {
    const dur = Number(cur.durationSeconds ?? cur.duration_seconds ?? 0)
    return acc + (isNaN(dur) ? 0 : dur)
  }, 0)
})

const {
  isRunning,
  isPaused,
  isIdle,
  elapsedSeconds,
  progressPercent,
  displayTime,
} = useTaskTimer(
  () => localTimer.value,
  {
    onExpired: (entry) => {
      handleStop()
      emit('timerExpired', entry)
    },
  },
)

const handleStart = () => {
  localTimer.value.state = 'RUNNING'
  localTimer.value.startedAt = new Date().toISOString()
  syncTimerOut()
  if (kanbanContext?.startTimer && isPersistedTaskId.value) {
    kanbanContext.startTimer(props.taskId, localTimer.value)
  }
}

const handlePause = () => {
  localTimer.value.state = 'PAUSED'
  localTimer.value.elapsedSeconds = elapsedSeconds.value
  localTimer.value.startedAt = null
  syncTimerOut()
  if (kanbanContext?.pauseTimer && isPersistedTaskId.value) {
    kanbanContext.pauseTimer(props.taskId)
  }
}

const handleStop = async () => {
  const duration = elapsedSeconds.value
  const startedAt = localTimer.value.startedAt || new Date(Date.now() - duration * 1000).toISOString()
  const endedAt = new Date().toISOString()
  const note = localTimer.value.mode === 'COUNT_DOWN' ? 'Completed focus session' : 'Continuous stopwatch session'

  localTimer.value.state = 'IDLE'
  localTimer.value.elapsedSeconds = 0
  localTimer.value.startedAt = null
  syncTimerOut()

  if (kanbanContext?.stopTimer && isPersistedTaskId.value) {
    kanbanContext.stopTimer(props.taskId)
  } else if (isPersistedTaskId.value) {
    try {
      await kanbanApi.updateTaskTimer(props.taskId, {
        state: 'IDLE',
        startedAt: null,
        elapsedSeconds: 0,
      })
    } catch {
      // Continue
    }
  }

  if (duration > 0) {
    if (isPersistedTaskId.value) {
      await loadPersistedEntries()
    } else {
      const newEntry: TaskTimeEntryDto = {
        id: `entry-${Date.now()}`,
        taskId: props.taskId,
        startedAt,
        endedAt,
        durationSeconds: duration,
        note,
        createdAt: new Date().toISOString(),
      }
      entries.value.unshift(newEntry)
      syncEntriesOut()
    }
  }
}

// -------------------------------------------------------------
// Manual Work Logging State & Handlers
// -------------------------------------------------------------
const isManualLogOpen = ref(false)
const manualDate = ref(toLocalDateString(new Date().toISOString()))
const manualStartTime = ref('09:00')
const manualEndTime = ref('09:25')
const manualDurationMinutes = ref<number | null>(25)
const manualNote = ref('')

const toggleManualLog = () => {
  isManualLogOpen.value = !isManualLogOpen.value
  if (isManualLogOpen.value) {
    const now = new Date()
    const twentyFiveMinsAgo = new Date(now.getTime() - 25 * 60 * 1000)
    manualDate.value = toLocalDateString(now.toISOString())
    manualStartTime.value = toLocalTimeString(twentyFiveMinsAgo.toISOString())
    manualEndTime.value = toLocalTimeString(now.toISOString())
    manualDurationMinutes.value = 25
    manualNote.value = ''
  }
}

const parseMinutesFromTime = (timeStr: string): number => {
  if (!timeStr) return 0
  const parts = timeStr.split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  if (isNaN(h) || isNaN(m)) return 0
  return h * 60 + m
}

const formatMinutesToTime = (totalMinutes: number): string => {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60)
  const eh = String(Math.floor(normalized / 60)).padStart(2, '0')
  const em = String(normalized % 60).padStart(2, '0')
  return `${eh}:${em}`
}

const onManualTimeInputChanged = () => {
  const startTotalMins = parseMinutesFromTime(manualStartTime.value)
  let endTotalMins = parseMinutesFromTime(manualEndTime.value)
  if (endTotalMins < startTotalMins) {
    endTotalMins += 24 * 60
  }
  const diff = Math.max(1, endTotalMins - startTotalMins)
  manualDurationMinutes.value = diff
}

const onManualDurationInputChanged = (val: number | null) => {
  if (val == null || isNaN(val) || val <= 0) return
  const startMins = parseMinutesFromTime(manualStartTime.value)
  manualEndTime.value = formatMinutesToTime(startMins + val)
}

const submitManualEntry = async () => {
  const durationMins = Number(manualDurationMinutes.value) || 0
  if (durationMins <= 0) return
  const started = combineDateAndTime(manualDate.value, manualStartTime.value)
  const ended = combineDateAndTime(manualDate.value, manualEndTime.value)
  const durationSec = durationMins * 60
  const note = manualNote.value.trim() || 'Manual session'

  const tempId = `manual-${Date.now()}`
  const newEntry: TaskTimeEntryDto = {
    id: tempId,
    taskId: props.taskId,
    startedAt: started,
    endedAt: ended,
    durationSeconds: durationSec,
    note,
    createdAt: new Date().toISOString(),
  }

  entries.value.unshift(newEntry)
  syncEntriesOut()
  isManualLogOpen.value = false
  manualNote.value = ''

  if (isPersistedTaskId.value) {
    try {
      const persisted = await kanbanApi.createTimeEntry(props.taskId, {
        startedAt: started,
        endedAt: ended,
        durationSeconds: durationSec,
        note,
      })
      if (persisted && persisted.id) {
        const found = entries.value.find(e => e.id === tempId)
        if (found) {
          Object.assign(found, normalizeTimeEntry(persisted))
          syncEntriesOut()
        }
      }
    } catch {
      // Continue with optimistic entry
    }
  }
}

// -------------------------------------------------------------
// Existing Session Editing State & Handlers
// -------------------------------------------------------------
const editingEntryId = ref<string | number | null>(null)
const editDate = ref('')
const editStartTime = ref('')
const editEndTime = ref('')
const editDurationMinutes = ref<number | null>(0)
const editNoteText = ref('')

const startEditingSession = (entry: TaskTimeEntryDto) => {
  const normalized = normalizeTimeEntry(entry)
  editingEntryId.value = normalized.id
  editDate.value = toLocalDateString(normalized.startedAt)
  editStartTime.value = toLocalTimeString(normalized.startedAt)
  editEndTime.value = toLocalTimeString(normalized.endedAt)
  editDurationMinutes.value = Math.max(1, Math.round(normalized.durationSeconds / 60))
  editNoteText.value = normalized.note
}

const onEditTimeChanged = () => {
  const startMins = parseMinutesFromTime(editStartTime.value)
  let endMins = parseMinutesFromTime(editEndTime.value)
  if (endMins < startMins) endMins += 24 * 60
  editDurationMinutes.value = Math.max(1, endMins - startMins)
}

const onEditDurationChanged = (val: number | null) => {
  if (val == null || isNaN(val) || val <= 0) return
  const startMins = parseMinutesFromTime(editStartTime.value)
  editEndTime.value = formatMinutesToTime(startMins + val)
}

const saveSessionEdits = async (entry: TaskTimeEntryDto) => {
  const durationMins = Number(editDurationMinutes.value) || 0
  const started = combineDateAndTime(editDate.value, editStartTime.value)
  const ended = combineDateAndTime(editDate.value, editEndTime.value)
  const durationSec = durationMins * 60
  const note = editNoteText.value

  entry.startedAt = started
  entry.endedAt = ended
  entry.durationSeconds = durationSec
  entry.note = note
  editingEntryId.value = null
  syncEntriesOut()

  if (isPersistedTaskId.value && !String(entry.id).startsWith('manual') && !String(entry.id).startsWith('entry')) {
    try {
      const updated = await kanbanApi.updateTimeEntry(entry.id, {
        startedAt: started,
        endedAt: ended,
        durationSeconds: durationSec,
        note,
      })
      if (updated) {
        Object.assign(entry, normalizeTimeEntry(updated))
        syncEntriesOut()
      }
    } catch {
      // Continue with optimistic edit
    }
  }
}

const deleteEntry = async (id: string | number) => {
  entries.value = entries.value.filter(e => e.id !== id)
  syncEntriesOut()

  if (isPersistedTaskId.value && !String(id).startsWith('manual') && !String(id).startsWith('entry')) {
    try {
      await kanbanApi.deleteTimeEntry(id)
    } catch {
      // Continue
    }
  }
}
</script>

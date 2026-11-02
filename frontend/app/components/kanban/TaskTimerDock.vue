<template>
  <div
    data-testid="task-timer-dock"
    class="-mx-2.5 -mb-2.5 mt-2.5 flex flex-col justify-between border-t border-surface-200/80 bg-surface-50/90 px-2.5 py-1.5 dark:border-surface-700/60 dark:bg-surface-800/60 rounded-b-[inherit] select-none transition-colors"
    @click.stop
    @pointerdown.stop
    @mousedown.stop
  >
    <div class="flex items-center justify-between gap-2">
      <!-- Left: Status Pip & Digital Readout / Inherited Type Preview -->
      <div class="flex items-center gap-1.5 min-w-0">
        <!-- Running Pip -->
        <span
          v-if="isRunning"
          data-testid="card-timer-pip-running"
          class="h-1.5 w-1.5 rounded-full shrink-0"
          :class="TIMER_STATE_CONFIG.RUNNING.dotClass"
        />
        <!-- Paused Pip -->
        <span
          v-else-if="isPaused"
          data-testid="card-timer-pip-paused"
          class="h-1.5 w-1.5 rounded-full shrink-0"
          :class="TIMER_STATE_CONFIG.PAUSED.dotClass"
        />
        <!-- Idle Clock Icon -->
        <i
          v-else
          class="pi pi-clock text-[10px] text-surface-400 shrink-0"
        />

        <!-- Active Readout (Running or Paused) -->
        <template v-if="isRunning || isPaused">
          <span
            data-testid="card-timer-readout"
            class="font-mono text-xs font-bold tabular-nums text-surface-800 dark:text-surface-100"
          >
            {{ displayTime }}
          </span>
          <span v-if="isCountDown" class="text-[10px] text-surface-400 font-medium">
            / {{ targetMinutes }}m
          </span>
        </template>

        <!-- Idle Inherited Mode & Target Label -->
        <template v-else>
          <span
            data-testid="card-timer-idle-label"
            class="text-[11px] font-medium text-surface-500 dark:text-surface-400 truncate"
          >
            {{ idleDisplayLabel }}
          </span>
        </template>
      </div>

      <!-- Right: Micro-Controls Cluster (Strictly Isolated Events) -->
      <div class="flex items-center gap-0.5 shrink-0" data-testid="card-timer-controls">
        <!-- Start / Resume Micro Button -->
        <Button
          v-if="!isRunning"
          type="button"
          icon="pi pi-play"
          severity="success"
          size="small"
          text
          rounded
          class="!h-5 !w-5 !p-0 text-emerald-600 hover:bg-emerald-100/60 dark:text-emerald-400 dark:hover:bg-emerald-950/50 cursor-pointer"
          :title="isPaused ? 'Resume timer' : 'Start timer'"
          :aria-label="isPaused ? 'Resume timer' : 'Start timer'"
          data-testid="card-timer-btn-start"
          @click.stop="handleStartOrResume"
          @pointerdown.stop
          @mousedown.stop
        />

        <!-- Pause Micro Button -->
        <Button
          v-if="isRunning"
          type="button"
          icon="pi pi-pause"
          severity="warn"
          size="small"
          text
          rounded
          class="!h-5 !w-5 !p-0 text-amber-600 hover:bg-amber-100/60 dark:text-amber-400 dark:hover:bg-amber-950/50 cursor-pointer"
          title="Pause timer"
          aria-label="Pause timer"
          data-testid="card-timer-btn-pause"
          @click.stop="handlePause"
          @pointerdown.stop
          @mousedown.stop
        />

        <!-- Stop Micro Button (Visible when Running or Paused) -->
        <Button
          v-if="isRunning || isPaused"
          type="button"
          icon="pi pi-stop"
          severity="danger"
          size="small"
          text
          rounded
          class="!h-5 !w-5 !p-0 text-red-500 hover:bg-red-100/60 dark:text-red-400 dark:hover:bg-red-950/50 cursor-pointer"
          title="Stop & record session"
          aria-label="Stop and record session"
          data-testid="card-timer-btn-stop"
          @click.stop="handleStop"
          @pointerdown.stop
          @mousedown.stop
        />
      </div>
    </div>

    <!-- Countdown Progress Line flush with bottom edge (Persistent for Countdown tasks to prevent layout shift) -->
    <div v-if="isCountDownTask" class="w-full mt-1.5">
      <div class="h-1 w-full bg-surface-200/80 dark:bg-surface-700/80 rounded-full overflow-hidden">
        <div
          class="h-full transition-all duration-300"
          :class="progressBarColorClass"
          :style="{ width: `${progressPercent}%` }"
          data-testid="card-timer-progress"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TaskTimerDto, TaskTimeEntryDto } from '~/api/kanban'
import { TIMER_MODE_CONFIG, TIMER_STATE_CONFIG } from '~/api/kanban'
import { useTaskTimer } from '~/composables/useTaskTimer'

const props = withDefaults(
  defineProps<{
    timer?: TaskTimerDto | null
    taskId: string | number
  }>(),
  {
    timer: null,
  },
)

const emit = defineEmits<{
  (e: 'start', taskId: string | number, defaultTimer?: Partial<TaskTimerDto>): void
  (e: 'pause', taskId: string | number): void
  (e: 'stop', taskId: string | number, entry?: TaskTimeEntryDto): void
}>()

const {
  isRunning,
  isPaused,
  isCountDown,
  targetDurationSeconds,
  progressPercent,
  displayTime,
} = useTaskTimer(
  () => props.timer,
  {
    onExpired: (entry) => {
      emit('stop', props.taskId, entry)
    },
  },
)

const targetMinutes = computed(() => {
  return Math.floor((targetDurationSeconds.value || 1500) / 60)
})

const isCountDownTask = computed(() => {
  return props.timer?.mode === 'COUNT_DOWN'
})

const progressBarColorClass = computed(() => {
  if (isPaused.value) {
    return 'bg-amber-500 dark:bg-amber-400'
  }
  return 'bg-emerald-500 dark:bg-emerald-400'
})

// Inherited idle mode and label
const idleDisplayLabel = computed(() => {
  if (props.timer?.mode === 'COUNT_UP') {
    return 'Stopwatch'
  }
  if (props.timer?.mode === 'COUNT_DOWN') {
    const mins = props.timer?.targetDurationSeconds ? Math.floor(props.timer.targetDurationSeconds / 60) : 25
    return `${TIMER_MODE_CONFIG.COUNT_DOWN.label} (${mins}m)`
  }
  return 'Ready'
})

const handleStartOrResume = () => {
  // If no timer or NONE, inherit Countdown 25m as default
  const defaultTimer: Partial<TaskTimerDto> = {
    taskId: props.taskId,
    mode: props.timer?.mode && props.timer.mode !== 'NONE' ? props.timer.mode : 'COUNT_DOWN',
    targetDurationSeconds: props.timer?.targetDurationSeconds || 1500,
    state: 'RUNNING',
    startedAt: new Date().toISOString(),
    elapsedSeconds: 0,
  }
  emit('start', props.taskId, defaultTimer)
}

const handlePause = () => {
  emit('pause', props.taskId)
}

const handleStop = () => {
  emit('stop', props.taskId)
}
</script>

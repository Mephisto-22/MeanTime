import { ref, computed, onMounted, onUnmounted, watch, getCurrentInstance } from 'vue'
import type { TaskTimerDto, TaskTimeEntryDto, TimerMode, TimerState } from '~/api/kanban'

export function formatDigital(totalSeconds: number, forceHours = false): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  if (hours > 0 || forceHours) {
    const hh = String(hours).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }
  return `${mm}:${ss}`
}

export function formatDurationBadge(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  }
  return `${seconds}s`
}

export function formatTimeRange(startedAt: string, endedAt: string): string {
  try {
    const start = new Date(startedAt)
    const end = new Date(endedAt)
    const timeFormat: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
    const startStr = start.toLocaleTimeString([], timeFormat)
    const endStr = end.toLocaleTimeString([], timeFormat)
    return `${startStr} – ${endStr}`
  } catch {
    return 'Session'
  }
}

export function formatDateLabel(isoString: string): string {
  try {
    const d = new Date(isoString)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return 'Today'
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return 'Recent'
  }
}

export function toLocalTimeString(iso: string): string {
  try {
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  } catch {
    return '12:00'
  }
}

export function toLocalDateString(iso: string): string {
  try {
    const d = new Date(iso)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function combineDateAndTime(dateStr: string, timeStr: string): string {
  try {
    const parts = dateStr.split('-').map(Number)
    const timeParts = timeStr.split(':').map(Number)
    const year = parts[0] ?? new Date().getFullYear()
    const month = parts[1] ?? (new Date().getMonth() + 1)
    const day = parts[2] ?? new Date().getDate()
    const hours = timeParts[0] ?? 0
    const minutes = timeParts[1] ?? 0
    const d = new Date(year, month - 1, day, hours, minutes, 0)
    return d.toISOString()
  } catch {
    return new Date().toISOString()
  }
}

export function useTaskTimer(
  getTimer: () => TaskTimerDto | null | undefined,
  callbacks?: {
    onTick?: (elapsed: number) => void
    onExpired?: (entry: TaskTimeEntryDto) => void
    onStop?: (entry: TaskTimeEntryDto) => void
  },
) {
  const now = ref(Date.now())
  let intervalId: any = null

  const timer = computed(() => getTimer())

  const isRunning = computed(() => timer.value?.state === 'RUNNING')
  const isPaused = computed(() => timer.value?.state === 'PAUSED')
  const isIdle = computed(() => !timer.value || timer.value.state === 'IDLE')
  const mode = computed<TimerMode>(() => timer.value?.mode ?? 'NONE')
  const isCountDown = computed(() => mode.value === 'COUNT_DOWN')
  const isCountUp = computed(() => mode.value === 'COUNT_UP')
  const isConfigured = computed(() => mode.value !== 'NONE')

  const elapsedSeconds = computed(() => {
    const t = timer.value
    if (!t) return 0
    const startedAt = t.startedAt || (t as any).started_at
    if (t.state === 'RUNNING' && startedAt) {
      const anchor = new Date(startedAt).getTime()
      const delta = Math.max(0, Math.floor((now.value - anchor) / 1000))
      return ((t.elapsedSeconds ?? (t as any).elapsed_seconds) || 0) + delta
    }
    return (t.elapsedSeconds ?? (t as any).elapsed_seconds) || 0
  })

  const targetDurationSeconds = computed(() => {
    return timer.value?.targetDurationSeconds ?? (timer.value as any)?.target_duration_seconds ?? 0
  })

  const remainingSeconds = computed(() => {
    if (!isCountDown.value) return 0
    const target = targetDurationSeconds.value
    return Math.max(0, target - elapsedSeconds.value)
  })

  const progressPercent = computed(() => {
    if (!isCountDown.value) return 0
    const target = targetDurationSeconds.value
    if (target <= 0) return 0
    return Math.min(100, Math.round((elapsedSeconds.value / target) * 100))
  })

  const displayTime = computed(() => {
    if (isCountDown.value) {
      return formatDigital(remainingSeconds.value)
    }
    return formatDigital(elapsedSeconds.value)
  })

  const checkCountdownExpiry = () => {
    if (isCountDown.value && isRunning.value && remainingSeconds.value <= 0) {
      const t = timer.value
      if (!t) return
      const entry: TaskTimeEntryDto = {
        id: `entry-${Date.now()}`,
        taskId: t.taskId,
        startedAt: t.startedAt || (t as any).started_at || new Date(Date.now() - (targetDurationSeconds.value || 0) * 1000).toISOString(),
        endedAt: new Date().toISOString(),
        durationSeconds: targetDurationSeconds.value || elapsedSeconds.value,
        note: 'Completed countdown session',
        createdAt: new Date().toISOString(),
      }
      callbacks?.onExpired?.(entry)
    }
  }

  const startTick = () => {
    if (!intervalId) {
      intervalId = setInterval(() => {
        now.value = Date.now()
        callbacks?.onTick?.(elapsedSeconds.value)
        checkCountdownExpiry()
      }, 1000)
    }
  }

  const stopTick = () => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && !document.hidden && isRunning.value) {
      now.value = Date.now()
      checkCountdownExpiry()
    }
  }

  watch(
    isRunning,
    (running) => {
      if (running) {
        now.value = Date.now()
        startTick()
      } else {
        stopTick()
      }
    },
    { immediate: true },
  )

  if (getCurrentInstance()) {
    onMounted(() => {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange)
      }
      if (isRunning.value) {
        startTick()
      }
    })

    onUnmounted(() => {
      stopTick()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    })
  }

  return {
    now,
    timer,
    isRunning,
    isPaused,
    isIdle,
    mode,
    isCountDown,
    isCountUp,
    isConfigured,
    elapsedSeconds,
    targetDurationSeconds,
    remainingSeconds,
    progressPercent,
    displayTime,
  }
}

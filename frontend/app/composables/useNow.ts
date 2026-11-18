import { onMounted, onUnmounted, readonly, ref } from 'vue'
import type { Ref } from 'vue'

const NOW_TICK_INTERVAL_MS = 30_000

const sharedNow = ref<Date>(new Date())
let intervalId: ReturnType<typeof setInterval> | null = null
let activeConsumers = 0

function syncNow() {
  sharedNow.value = new Date()
}

function handleVisibilityChange() {
  if (typeof document !== 'undefined' && !document.hidden) {
    syncNow()
  }
}

function startClock() {
  syncNow()
  if (!intervalId) {
    intervalId = setInterval(syncNow, NOW_TICK_INTERVAL_MS)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
}

function stopClock() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}

/**
 * Returns a shared, reactive `Date` ref that ticks every 30 seconds while at least
 * one component using it is mounted, and refreshes on tab visibility changes.
 */
export function useNow(): Readonly<Ref<Date>> {
  if (activeConsumers === 0) {
    syncNow()
  }

  onMounted(() => {
    if (activeConsumers === 0) {
      startClock()
    }
    activeConsumers += 1
  })

  onUnmounted(() => {
    activeConsumers = Math.max(0, activeConsumers - 1)
    if (activeConsumers === 0) {
      stopClock()
    }
  })

  return readonly(sharedNow)
}

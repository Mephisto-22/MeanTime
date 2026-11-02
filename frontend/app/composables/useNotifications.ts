import { useToast } from 'primevue/usetoast'
import { getErrorMessage } from '~/utils/errors'

export function playTimerCompletionTone(): void {
  try {
    if (typeof window === 'undefined') return
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15) // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.6)
  } catch {
    // Gracefully ignore audio issues (e.g. autoplay restrictions)
  }
}

export function useNotifications() {
  const toast = useToast()
  return {
    error(error: unknown, summary = 'Something went wrong') {
      // Errors remain available until dismissed, including after navigation.
      toast.add({ severity: 'error', summary, detail: getErrorMessage(error), closable: true })
    },
    success(detail: string) {
      toast.add({ severity: 'success', summary: 'Success', detail, life: 4000 })
    },
    timerComplete(taskTitle: string) {
      playTimerCompletionTone()
      toast.add({
        severity: 'success',
        summary: 'Time is up!',
        detail: `Focus session completed for "${taskTitle}"!`,
        life: 6000,
      })
    },
  }
}

import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { TaskTimerDto, TaskTimeEntryDto } from '~/api/kanban'
import { useTaskTimer } from '~/composables/useTaskTimer'
import TaskTimerDock from '~/components/kanban/TaskTimerDock.vue'
import TaskTimerEditor from '~/components/kanban/TaskTimerEditor.vue'

describe('Countdown Timer Mode, Inline Typing & Persistent Track (#107)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Countdown Composable & Expiration', () => {
    it('calculates remaining countdown time using Date.now() wall-clock differences', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const timer: TaskTimerDto = {
        taskId: 'cd-task-1',
        mode: 'COUNT_DOWN',
        targetDurationSeconds: 1500, // 25 min
        state: 'RUNNING',
        startedAt: new Date(now - 300 * 1000).toISOString(), // 5 min ago
        elapsedSeconds: 0,
      }

      const { remainingSeconds, displayTime, progressPercent } = useTaskTimer(() => timer)

      expect(remainingSeconds.value).toBe(1200) // 20 min remaining
      expect(displayTime.value).toBe('20:00')
      expect(progressPercent.value).toBe(20) // 300/1500 = 20%
    })

    it('automatically triggers onExpired callback when reaching 00:00:00', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      let expiredEntry: TaskTimeEntryDto | null = null
      const timer: TaskTimerDto = {
        taskId: 'cd-task-2',
        mode: 'COUNT_DOWN',
        targetDurationSeconds: 60, // 1 min target
        state: 'RUNNING',
        startedAt: new Date(now - 59 * 1000).toISOString(), // 59s ago (1s remaining)
        elapsedSeconds: 0,
      }

      useTaskTimer(
        () => timer,
        {
          onExpired: (entry) => {
            expiredEntry = entry
          },
        },
      )

      expect(expiredEntry).toBeNull()

      // Advance by 2 seconds to cross 00:00:00
      vi.advanceTimersByTime(2000)

      expect(expiredEntry).not.toBeNull()
      expect(expiredEntry!.durationSeconds).toBe(60)
      expect(expiredEntry!.taskId).toBe('cd-task-2')
    })
  })

  describe('TaskTimerDock.vue - Persistent Track & Color States', () => {
    it('renders persistent hairline progress track at 0% when IDLE', () => {
      const timer: TaskTimerDto = {
        taskId: 'dock-cd-1',
        mode: 'COUNT_DOWN',
        targetDurationSeconds: 1500,
        state: 'IDLE',
        startedAt: null,
        elapsedSeconds: 0,
      }

      const wrapper = mount(TaskTimerDock, {
        props: {
          taskId: 'dock-cd-1',
          timer,
        },
        global: {
          plugins: [PrimeVue],
        },
      })

      const progress = wrapper.find('[data-testid="card-timer-progress"]')
      expect(progress.exists()).toBe(true)
      expect(progress.attributes('style')).toContain('width: 0%')
      expect(progress.classes()).toContain('bg-emerald-500')
    })

    it('renders amber progress track when PAUSED and emerald when RUNNING', async () => {
      const timer: TaskTimerDto = {
        taskId: 'dock-cd-2',
        mode: 'COUNT_DOWN',
        targetDurationSeconds: 1500,
        state: 'PAUSED',
        startedAt: null,
        elapsedSeconds: 750, // 50%
      }

      const wrapper = mount(TaskTimerDock, {
        props: {
          taskId: 'dock-cd-2',
          timer,
        },
        global: {
          plugins: [PrimeVue],
        },
      })

      let progress = wrapper.find('[data-testid="card-timer-progress"]')
      expect(progress.classes()).toContain('bg-amber-500')
      expect(progress.attributes('style')).toContain('width: 50%')

      // Switch to RUNNING
      await wrapper.setProps({
        timer: {
          ...timer,
          state: 'RUNNING',
          startedAt: new Date().toISOString(),
        },
      })

      progress = wrapper.find('[data-testid="card-timer-progress"]')
      expect(progress.classes()).toContain('bg-emerald-500')
    })
  })

  describe('TaskTimerEditor.vue - Presets, Inline Typing & Locking Matrix', () => {
    it('sets target duration via quick-pick preset chips (15m, 25m, 45m, 60m)', async () => {
      const timer: TaskTimerDto = {
        taskId: 'editor-cd-1',
        mode: 'COUNT_DOWN',
        targetDurationSeconds: 1500,
        state: 'IDLE',
        startedAt: null,
        elapsedSeconds: 0,
      }

      const wrapper = mount(TaskTimerEditor, {
        props: {
          taskId: 'editor-cd-1',
          timer,
          timeEntries: [],
        },
        global: {
          plugins: [PrimeVue],
        },
      })

      const preset45 = wrapper.find('[data-testid="timer-preset-45"]')
      expect(preset45.exists()).toBe(true)
      await preset45.trigger('click')

      expect(wrapper.emitted('update:timer')).toBeTruthy()
      const emitted = wrapper.emitted('update:timer')![0][0] as TaskTimerDto
      expect(emitted.targetDurationSeconds).toBe(2700) // 45 * 60
    })

    it('activates inline duration input on double-click and parses natural time strings', async () => {
      const timer: TaskTimerDto = {
        taskId: 'editor-cd-2',
        mode: 'COUNT_DOWN',
        targetDurationSeconds: 1500,
        state: 'IDLE',
        startedAt: null,
        elapsedSeconds: 0,
      }

      const wrapper = mount(TaskTimerEditor, {
        props: {
          taskId: 'editor-cd-2',
          timer,
          timeEntries: [],
        },
        global: {
          plugins: [PrimeVue],
        },
      })

      // Double-click digital readout container
      const readoutContainer = wrapper.find('[data-testid="timer-digital-readout"]')
      expect(readoutContainer.exists()).toBe(true)
      await readoutContainer.trigger('dblclick')

      // Input appears
      const input = wrapper.find('[data-testid="timer-inline-target-input"]')
      expect(input.exists()).toBe(true)

      // Test "30" -> 30 minutes (1800s)
      await input.setValue('30')
      await input.trigger('keydown.enter')

      let emitted = wrapper.emitted('update:timer')!.slice(-1)[0][0] as TaskTimerDto
      expect(emitted.targetDurationSeconds).toBe(1800)

      // Test "12:30" -> 12m 30s (750s)
      await wrapper.find('[data-testid="timer-digital-readout"]').trigger('dblclick')
      const input2 = wrapper.find('[data-testid="timer-inline-target-input"]')
      await input2.setValue('12:30')
      await input2.trigger('keydown.enter')

      emitted = wrapper.emitted('update:timer')!.slice(-1)[0][0] as TaskTimerDto
      expect(emitted.targetDurationSeconds).toBe(750)

      // Test "90s" -> 90s
      await wrapper.find('[data-testid="timer-digital-readout"]').trigger('dblclick')
      const input3 = wrapper.find('[data-testid="timer-inline-target-input"]')
      await input3.setValue('90s')
      await input3.trigger('keydown.enter')

      emitted = wrapper.emitted('update:timer')!.slice(-1)[0][0] as TaskTimerDto
      expect(emitted.targetDurationSeconds).toBe(90)
    })

    it('locks timer mode dropdown and preset buttons while RUNNING or PAUSED', async () => {
      const timer: TaskTimerDto = {
        taskId: 'editor-cd-3',
        mode: 'COUNT_DOWN',
        targetDurationSeconds: 1500,
        state: 'RUNNING',
        startedAt: new Date().toISOString(),
        elapsedSeconds: 0,
      }

      const wrapper = mount(TaskTimerEditor, {
        props: {
          taskId: 'editor-cd-3',
          timer,
          timeEntries: [],
        },
        global: {
          plugins: [PrimeVue],
        },
      })

      const modeSelect = wrapper.findComponent({ name: 'Select' })
      expect(modeSelect.props('disabled')).toBe(true)

      const preset25 = wrapper.find('[data-testid="timer-preset-25"]')
      expect(preset25.attributes('disabled')).toBeDefined()

      // Double-click does not activate inline input when running
      const readoutContainer = wrapper.find('[data-testid="timer-digital-readout"]')
      await readoutContainer.trigger('dblclick')
      expect(wrapper.find('[data-testid="timer-inline-target-input"]').exists()).toBe(false)
    })
  })
})

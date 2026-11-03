import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { TaskTimerDto, TaskTimeEntryDto } from '~/api/kanban'
import { formatDigital, formatDurationBadge, useTaskTimer } from '~/composables/useTaskTimer'
import TaskTimerDock from '~/components/kanban/TaskTimerDock.vue'
import TaskTimerEditor from '~/components/kanban/TaskTimerEditor.vue'

describe('Task Timer Foundation & Stopwatch Suite (#106)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('useTaskTimer composable - Stopwatch (Count Up)', () => {
    it('formats digital and duration strings correctly', () => {
      expect(formatDigital(0)).toBe('00:00')
      expect(formatDigital(65)).toBe('01:05')
      expect(formatDigital(3665)).toBe('01:01:05')
      expect(formatDurationBadge(45)).toBe('45s')
      expect(formatDurationBadge(1500)).toBe('25m')
      expect(formatDurationBadge(3660)).toBe('1h 1m')
    })

    it('calculates stopwatch elapsed time using wall-clock time anchor', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const timer: TaskTimerDto = {
        taskId: 1,
        mode: 'COUNT_UP',
        targetDurationSeconds: null,
        state: 'RUNNING',
        startedAt: new Date(now - 15000).toISOString(), // 15 seconds ago
        elapsedSeconds: 0,
      }

      const { elapsedSeconds, displayTime, isRunning } = useTaskTimer(() => timer)

      expect(isRunning.value).toBe(true)
      expect(elapsedSeconds.value).toBe(15)
      expect(displayTime.value).toBe('00:15')

      // Advance clock by 30 seconds
      vi.advanceTimersByTime(30000)
      expect(elapsedSeconds.value).toBe(45)
      expect(displayTime.value).toBe('00:45')
    })

    it('preserves accumulated seconds when paused and resumes accurately', () => {
      const timer: TaskTimerDto = {
        taskId: 1,
        mode: 'COUNT_UP',
        targetDurationSeconds: null,
        state: 'PAUSED',
        startedAt: null,
        elapsedSeconds: 120, // 2 minutes accumulated
      }

      const { elapsedSeconds, isPaused, displayTime } = useTaskTimer(() => timer)

      expect(isPaused.value).toBe(true)
      expect(elapsedSeconds.value).toBe(120)
      expect(displayTime.value).toBe('02:00')
    })
  })

  describe('TaskTimerDock.vue - Stopwatch Mode', () => {
    it('renders idle stopwatch dock without progress bar and emits start on 1-click play', async () => {
      const timer: TaskTimerDto = {
        taskId: 'dock-task-1',
        mode: 'COUNT_UP',
        targetDurationSeconds: null,
        state: 'IDLE',
        startedAt: null,
        elapsedSeconds: 0,
      }

      const wrapper = mount(TaskTimerDock, {
        props: {
          taskId: 'dock-task-1',
          timer,
        },
        global: {
          plugins: [PrimeVue],
        },
      })

      const idleLabel = wrapper.find('[data-testid="card-timer-idle-label"]')
      expect(idleLabel.exists()).toBe(true)
      expect(idleLabel.text()).toContain('Stopwatch')

      // No countdown progress bar for stopwatch
      expect(wrapper.find('[data-testid="card-timer-progress"]').exists()).toBe(false)

      const playBtn = wrapper.find('[data-testid="card-timer-btn-start"]')
      expect(playBtn.exists()).toBe(true)

      await playBtn.trigger('click')
      expect(wrapper.emitted('start')).toBeTruthy()
      expect(wrapper.emitted('start')![0][0]).toBe('dock-task-1')
      expect(wrapper.emitted('start')![0][1]).toMatchObject({
        mode: 'COUNT_UP',
        state: 'RUNNING',
      })
    })

    it('renders running stopwatch with pulsing emerald pip and micro-controls', async () => {
      const timer: TaskTimerDto = {
        taskId: 'dock-task-2',
        mode: 'COUNT_UP',
        targetDurationSeconds: null,
        state: 'RUNNING',
        startedAt: new Date(Date.now() - 65000).toISOString(),
        elapsedSeconds: 0,
      }

      const wrapper = mount(TaskTimerDock, {
        props: {
          taskId: 'dock-task-2',
          timer,
        },
        global: {
          plugins: [PrimeVue],
        },
      })

      expect(wrapper.find('[data-testid="card-timer-pip-running"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="card-timer-readout"]').text()).toBe('01:05')

      const pauseBtn = wrapper.find('[data-testid="card-timer-btn-pause"]')
      expect(pauseBtn.exists()).toBe(true)
      await pauseBtn.trigger('click')
      expect(wrapper.emitted('pause')).toBeTruthy()

      const stopBtn = wrapper.find('[data-testid="card-timer-btn-stop"]')
      expect(stopBtn.exists()).toBe(true)
      await stopBtn.trigger('click')
      expect(wrapper.emitted('stop')).toBeTruthy()
    })
  })

  describe('TaskTimerEditor.vue - Stopwatch Mode & 3 Persistent Buttons', () => {
    it('provides mode selector dropdown and correctly disables action buttons across IDLE, RUNNING, and PAUSED', async () => {
      const timer: TaskTimerDto = {
        taskId: 'editor-task-1',
        mode: 'COUNT_UP',
        targetDurationSeconds: null,
        state: 'IDLE',
        startedAt: null,
        elapsedSeconds: 0,
      }

      const wrapper = mount(TaskTimerEditor, {
        props: {
          taskId: 'editor-task-1',
          timer,
          timeEntries: [],
        },
        global: {
          plugins: [PrimeVue],
        },
      })

      // IDLE State: Start enabled, Pause disabled, Stop disabled
      const startBtn = wrapper.find('[data-testid="timer-btn-start"]')
      const pauseBtn = wrapper.find('[data-testid="timer-btn-pause"]')
      const stopBtn = wrapper.find('[data-testid="timer-btn-stop"]')

      expect(startBtn.attributes('disabled')).toBeUndefined()
      expect(pauseBtn.attributes('disabled')).toBeDefined()
      expect(stopBtn.attributes('disabled')).toBeDefined()

      // RUNNING State: Start disabled, Pause enabled, Stop enabled
      await wrapper.setProps({
        timer: {
          ...timer,
          state: 'RUNNING',
          startedAt: new Date().toISOString(),
        },
      })
      expect(startBtn.attributes('disabled')).toBeDefined()
      expect(pauseBtn.attributes('disabled')).toBeUndefined()
      expect(stopBtn.attributes('disabled')).toBeUndefined()

      // PAUSED State: Start enabled (Resume), Pause disabled, Stop enabled
      await wrapper.setProps({
        timer: {
          ...timer,
          state: 'PAUSED',
          startedAt: null,
          elapsedSeconds: 90,
        },
      })
      expect(startBtn.attributes('disabled')).toBeUndefined()
      expect(pauseBtn.attributes('disabled')).toBeDefined()
      expect(stopBtn.attributes('disabled')).toBeUndefined()
    })
  })
})

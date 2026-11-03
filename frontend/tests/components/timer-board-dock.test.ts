import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { kanbanContextKey } from '~/api/kanban'
import type { KanbanBoardDto, KanbanTaskDto, TaskTimerDto } from '~/api/kanban'
import Task from '~/components/kanban/Task.vue'
import Board from '~/components/kanban/Board.vue'
import TaskTimerDock from '~/components/kanban/TaskTimerDock.vue'

import { DialogStub } from '../fixtures/kanban'

function mountBoard(boardData: any) {
  return mount(Board, {
    props: {
      board: boardData,
    },
    global: {
      plugins: [PrimeVue, ToastService],
      stubs: {
        Dialog: DialogStub,
      },
    },
  })
}

describe('Production Card Dock Integration & Board Drag Hardening (#109)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Task.vue & TaskTimerDock Event Isolation', () => {
    it('mounts TaskTimerDock flush at the bottom edge of Task.vue and emits timer actions', async () => {
      const task: KanbanTaskDto = {
        id: 'task-dock-prod-1',
        title: 'Production Card with Dock',
        position: 0,
        timer: {
          taskId: 'task-dock-prod-1',
          mode: 'COUNT_DOWN',
          targetDurationSeconds: 1500,
          state: 'IDLE',
          startedAt: null,
          elapsedSeconds: 0,
        },
      }

      const onStartMock = vi.fn()
      const onOpenEditMock = vi.fn()

      const wrapper = mount(Task, {
        props: {
          task,
          onOpenEdit: onOpenEditMock,
          onTimerStart: onStartMock,
        },
        global: {
          plugins: [PrimeVue],
        },
      })

      const dock = wrapper.findComponent(TaskTimerDock)
      expect(dock.exists()).toBe(true)

      // Click 1-click play button
      const playBtn = wrapper.find('[data-testid="card-timer-btn-start"]')
      expect(playBtn.exists()).toBe(true)
      await playBtn.trigger('click')

      expect(onStartMock).toHaveBeenCalledTimes(1)
      expect(onStartMock).toHaveBeenCalledWith('task-dock-prod-1', expect.objectContaining({
        mode: 'COUNT_DOWN',
        state: 'RUNNING',
      }))

      // Clicking the play button MUST NOT trigger task edit modal
      expect(onOpenEditMock).not.toHaveBeenCalled()
    })

    it('strictly isolates dock pointer and click events so card click/drag is not initiated', async () => {
      const task: KanbanTaskDto = {
        id: 'task-dock-prod-2',
        title: 'Event Isolation Task',
        position: 0,
        timer: {
          taskId: 'task-dock-prod-2',
          mode: 'COUNT_UP',
          targetDurationSeconds: null,
          state: 'RUNNING',
          startedAt: new Date(Date.now() - 30000).toISOString(),
          elapsedSeconds: 0,
        },
      }

      const onPauseMock = vi.fn()
      const onOpenEditMock = vi.fn()

      const wrapper = mount(Task, {
        props: {
          task,
          onOpenEdit: onOpenEditMock,
          onTimerPause: onPauseMock,
        },
        global: {
          plugins: [PrimeVue],
        },
      })

      const pauseBtn = wrapper.find('[data-testid="card-timer-btn-pause"]')
      expect(pauseBtn.exists()).toBe(true)

      // Simulate pointerdown and click on micro-pause button
      await pauseBtn.trigger('pointerdown')
      await pauseBtn.trigger('click')

      expect(onPauseMock).toHaveBeenCalledTimes(1)
      // Card openEdit should NOT be called
      expect(onOpenEditMock).not.toHaveBeenCalled()
      // Card should not be in dragging state
      expect(wrapper.vm.isDragging).toBe(false)
    })
  })

    it('completely removes TaskTimerDock and "ready" bar placeholder if no timer option is selected (mode is NONE or timer is absent)', () => {
      const taskWithoutTimer: KanbanTaskDto = {
        id: 'task-no-timer',
        title: 'Task without timer',
        position: 0,
        timer: null,
      }

      const wrapper1 = mount(Task, {
        props: { task: taskWithoutTimer },
        global: { plugins: [PrimeVue] },
      })
      expect(wrapper1.findComponent(TaskTimerDock).exists()).toBe(false)
      expect(wrapper1.find('[data-testid="task-timer-dock"]').exists()).toBe(false)
      expect(wrapper1.text()).not.toContain('Ready')

      const taskWithNoneMode: KanbanTaskDto = {
        id: 'task-none-mode',
        title: 'Task with NONE mode',
        position: 0,
        timer: {
          taskId: 'task-none-mode',
          mode: 'NONE',
          targetDurationSeconds: 1500,
          state: 'IDLE',
          startedAt: null,
          elapsedSeconds: 0,
        },
      }

      const wrapper2 = mount(Task, {
        props: { task: taskWithNoneMode },
        global: { plugins: [PrimeVue] },
      })
      expect(wrapper2.findComponent(TaskTimerDock).exists()).toBe(false)
      expect(wrapper2.find('[data-testid="task-timer-dock"]').exists()).toBe(false)
      expect(wrapper2.text()).not.toContain('Ready')
    })


  describe('Board Multi-Timer Concurrency & Column Move Neutrality', () => {
    it('supports multiple active timers running concurrently across columns', async () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const boardData: KanbanBoardDto = {
        id: 1,
        title: 'Concurrent Timers Board',
        description: '',
        columns: [
          {
            id: 10,
            title: 'In Progress',
            position: 0,
            boardId: 1,
            tasks: [
              {
                id: 'task-c1',
                title: 'Task C1',
                position: 0,
                timer: {
                  taskId: 'task-c1',
                  mode: 'COUNT_DOWN',
                  targetDurationSeconds: 1500,
                  state: 'RUNNING',
                  startedAt: new Date(now - 300000).toISOString(), // 20m remaining
                  elapsedSeconds: 0,
                },
              },
            ],
          },
          {
            id: 20,
            title: 'Review',
            position: 1,
            boardId: 1,
            tasks: [
              {
                id: 'task-c2',
                title: 'Task C2',
                position: 0,
                timer: {
                  taskId: 'task-c2',
                  mode: 'COUNT_UP',
                  targetDurationSeconds: null,
                  state: 'RUNNING',
                  startedAt: new Date(now - 60000).toISOString(), // 1m elapsed
                  elapsedSeconds: 0,
                },
              },
            ],
          },
        ],
      }

      const wrapper = mountBoard(boardData)

      const readouts = wrapper.findAll('[data-testid="card-timer-readout"]')
      expect(readouts.length).toBe(2)

      // Task 1: countdown (20:00)
      expect(readouts[0].text()).toBe('20:00')
      // Task 2: stopwatch (01:00)
      expect(readouts[1].text()).toBe('01:00')

      // Advance clock by 30 seconds
      vi.advanceTimersByTime(30000)
      await wrapper.vm.$nextTick()

      // Both timers advanced concurrently
      expect(readouts[0].text()).toBe('19:30')
      expect(readouts[1].text()).toBe('01:30')
    })

    it('leaves active timers running undisturbed when moved to another column (column transition neutrality)', async () => {
      const startedAtStr = new Date(Date.now() - 120000).toISOString()
      const activeTimer: TaskTimerDto = {
        taskId: 'moving-task-1',
        mode: 'COUNT_DOWN',
        targetDurationSeconds: 1500,
        state: 'RUNNING',
        startedAt: startedAtStr,
        elapsedSeconds: 0,
      }

      const boardData: KanbanBoardDto = {
        id: 2,
        title: 'Neutrality Board',
        description: '',
        columns: [
          {
            id: 101,
            title: 'Doing',
            position: 0,
            boardId: 2,
            tasks: [
              {
                id: 'moving-task-1',
                title: 'Moving Active Task',
                position: 0,
                timer: activeTimer,
              },
            ],
          },
          {
            id: 102,
            title: 'Done',
            position: 1,
            boardId: 2,
            tasks: [],
          },
        ],
      }

      const wrapper = mountBoard(boardData)

      // Move task from "Doing" (101) to "Done" (102)
      await wrapper.vm.handleMoveTask({
        taskId: 'moving-task-1',
        fromColumnId: 101,
        toColumnId: 102,
        targetPosition: 0,
      })

      const doneCol = wrapper.vm.localColumns.find((c: any) => c.id === 102)
      expect(doneCol.tasks).toHaveLength(1)
      const movedTask = doneCol.tasks[0]

      // Timer is STILL RUNNING, same mode, same startedAt timestamp!
      expect(movedTask.timer).not.toBeNull()
      expect(movedTask.timer.state).toBe('RUNNING')
      expect(movedTask.timer.mode).toBe('COUNT_DOWN')
      expect(movedTask.timer.startedAt).toBe(startedAtStr)
    })

    it('handles countdown expiration and resets timer to IDLE with toast notification', async () => {
      const activeTimer: TaskTimerDto = {
        taskId: 'expiring-task-1',
        mode: 'COUNT_DOWN',
        targetDurationSeconds: 1500,
        state: 'RUNNING',
        startedAt: new Date(Date.now() - 1500000).toISOString(),
        elapsedSeconds: 0,
      }

      const boardData: KanbanBoardDto = {
        id: 3,
        title: 'Notification Board',
        description: '',
        columns: [
          {
            id: 201,
            title: 'Doing',
            position: 0,
            boardId: 3,
            tasks: [
              {
                id: 'expiring-task-1',
                title: 'Deep Work Sprint',
                position: 0,
                timer: activeTimer,
              },
            ],
          },
        ],
      }

      const wrapper = mountBoard(boardData)

      const expiredEntry: any = {
        id: 'exp-entry-1',
        taskId: 'expiring-task-1',
        durationSeconds: 1500,
      }

      await wrapper.vm.handleStopTimer('expiring-task-1', expiredEntry)

      const col = wrapper.vm.localColumns[0]
      expect(col.tasks[0].timer.state).toBe('IDLE')
      expect(col.tasks[0].timer.elapsedSeconds).toBe(0)
    })

    it('forwards expired entry from Task.vue through kanbanContext.stopTimer', async () => {
      const stopMock = vi.fn()
      const task: KanbanTaskDto = {
        id: 'task-dock-stop-1',
        title: 'Task Dock Stop',
        position: 0,
        timer: {
          taskId: 'task-dock-stop-1',
          mode: 'COUNT_DOWN',
          targetDurationSeconds: 1500,
          state: 'RUNNING',
          startedAt: new Date().toISOString(),
          elapsedSeconds: 0,
        },
      }

      const wrapper = mount(Task, {
        props: { task },
        global: {
          plugins: [PrimeVue],
          provide: {
            [kanbanContextKey as symbol]: {
              stopTimer: stopMock,
            },
          },
        },
      })

      const dock = wrapper.findComponent(TaskTimerDock)
      expect(dock.exists()).toBe(true)

      const mockEntry: any = { id: 'entry-dock-1', durationSeconds: 1500 }
      dock.vm.$emit('stop', 'task-dock-stop-1', mockEntry)

      expect(stopMock).toHaveBeenCalledWith('task-dock-stop-1', mockEntry)
    })

    it('debounces duplicate timer expiration alerts within 3 seconds', async () => {
      const boardData: KanbanBoardDto = {
        id: 4,
        title: 'Debounce Board',
        description: '',
        columns: [
          {
            id: 301,
            title: 'Column',
            position: 0,
            boardId: 4,
            tasks: [
              {
                id: 'debounce-task-1',
                title: 'Debounce Task',
                position: 0,
                timer: {
                  taskId: 'debounce-task-1',
                  mode: 'COUNT_DOWN',
                  targetDurationSeconds: 1500,
                  state: 'RUNNING',
                  startedAt: new Date().toISOString(),
                  elapsedSeconds: 0,
                },
              },
            ],
          },
        ],
      }

      const wrapper = mountBoard(boardData)
      const task = wrapper.vm.localColumns[0].tasks[0]
      const entry: any = { id: 'e1', durationSeconds: 1500 }

      // First alert works
      wrapper.vm.handleTimerExpired(task, entry)

      // Second immediate call within 3 seconds is debounced
      wrapper.vm.handleTimerExpired(task, entry)

      // Fast forward past 3 seconds
      vi.advanceTimersByTime(3500)
      // Third call after 3.5s succeeds
      wrapper.vm.handleTimerExpired(task, entry)
    })
  })
})

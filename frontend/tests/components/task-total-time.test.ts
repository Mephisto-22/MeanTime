import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { defineComponent, h, inject } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KanbanContext, TaskTimeEntryDto } from '~/api/kanban'
import { kanbanApi, kanbanContextKey } from '~/api/kanban'
import Board from '~/components/kanban/Board.vue'
import Task from '~/components/kanban/Task.vue'
import TaskTimerEditor from '~/components/kanban/TaskTimerEditor.vue'
import { sumEntryDurations } from '~/composables/useTaskTimer'
import {
  DialogStub,
  createBoardFixture,
  createColumnFixture,
  createTagFixture,
  createTaskFixture,
} from '../fixtures/kanban'

function entry(id: number, durationSeconds: number): TaskTimeEntryDto {
  return {
    id,
    taskId: 42,
    startedAt: '2026-11-01T10:00:00.000Z',
    endedAt: '2026-11-01T12:00:00.000Z',
    durationSeconds,
    note: '',
  }
}

describe('sumEntryDurations', () => {
  it('adds up entry durations', () => {
    expect(sumEntryDurations([entry(1, 600), entry(2, 300), entry(3, 45)])).toBe(945)
  })

  it('returns 0 for no entries and ignores invalid durations', () => {
    expect(sumEntryDurations(undefined)).toBe(0)
    expect(sumEntryDurations([])).toBe(0)
    expect(sumEntryDurations([{ durationSeconds: null }, { durationSeconds: Number.NaN }, { durationSeconds: 60 }])).toBe(60)
  })
})

describe('Task card total time', () => {
  function mountTask(task = createTaskFixture()) {
    return mount(Task, {
      props: { task },
      global: {
        plugins: [PrimeVue],
        provide: { [kanbanContextKey as symbol]: { columns: { value: [] }, moveTask: vi.fn() } },
      },
    })
  }

  it('shows the formatted total when the task has tracked time', () => {
    const wrapper = mountTask(createTaskFixture({ totalSeconds: 8100 }))

    const total = wrapper.find('[data-testid="task-total-time"]')
    expect(total.exists()).toBe(true)
    expect(total.text()).toBe('2h 15m')
  })

  it('hides the total, and the empty bottom row, when there is no tracked time', () => {
    for (const totalSeconds of [0, undefined]) {
      const wrapper = mountTask(createTaskFixture({ totalSeconds, tags: [] }))

      expect(wrapper.find('[data-testid="task-total-time"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="task-tags-row"]').exists()).toBe(false)
    }
  })

  it('shows the total alongside the task tags', () => {
    const wrapper = mountTask(createTaskFixture({
      totalSeconds: 1500,
      tags: [createTagFixture({ name: 'Backend' })],
    }))

    const row = wrapper.find('[data-testid="task-tags-row"]')
    expect(row.find('[data-testid="task-total-time"]').text()).toBe('25m')
    expect(row.findAll('[data-testid="task-tag-chip"]')).toHaveLength(1)
  })

  it('updates when the task total changes', async () => {
    const wrapper = mountTask(createTaskFixture({ totalSeconds: 60 }))

    await wrapper.setProps({ task: createTaskFixture({ totalSeconds: 3600 }) })

    expect(wrapper.find('[data-testid="task-total-time"]').text()).toBe('1h')
  })
})

describe('Board keeps task totals up to date', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(kanbanApi, 'listTags').mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mountBoardWithContext(task = createTaskFixture({ id: 42, columnId: 'col-1' })) {
    let context: KanbanContext | null = null
    const ContextConsumer = defineComponent({
      setup() {
        context = inject(kanbanContextKey)!
        return () => h('div')
      },
    })
    const wrapper = mount(Board, {
      props: {
        board: createBoardFixture({ columns: [createColumnFixture({ id: 'col-1', tasks: [task] })] }),
      },
      slots: { column: () => h(ContextConsumer) },
      global: { plugins: [PrimeVue, ToastService], stubs: { Dialog: DialogStub } },
    })
    const boardTask = () => (wrapper.vm as any).localColumns[0].tasks[0]
    return { context: context!, boardTask }
  }

  it('sets a task total through the kanban context', () => {
    const { context, boardTask } = mountBoardWithContext()

    context.setTaskTotal?.(42, 900)

    expect(boardTask().totalSeconds).toBe(900)
  })

  it('reloads the total from the time entries after a timer is stopped', async () => {
    const running = createTaskFixture({
      id: 42,
      columnId: 'col-1',
      totalSeconds: 300,
      timer: {
        taskId: 42,
        mode: 'COUNT_UP',
        targetDurationSeconds: null,
        state: 'PAUSED',
        startedAt: '2026-11-01T10:00:00.000Z',
        elapsedSeconds: 600,
      },
    })
    vi.spyOn(kanbanApi, 'updateTaskTimer').mockResolvedValue({ ...running.timer!, state: 'IDLE', elapsedSeconds: 0 })
    const listSpy = vi.spyOn(kanbanApi, 'listTimeEntries').mockResolvedValue([entry(1, 300), entry(2, 600)])
    const { context, boardTask } = mountBoardWithContext(running)

    await context.stopTimer?.(42)
    await flushPromises()

    expect(listSpy).toHaveBeenCalledWith(42)
    expect(boardTask().totalSeconds).toBe(900)
  })

  it('keeps the old total when stopping the timer fails', async () => {
    const running = createTaskFixture({
      id: 42,
      columnId: 'col-1',
      totalSeconds: 300,
      timer: {
        taskId: 42,
        mode: 'COUNT_UP',
        targetDurationSeconds: null,
        state: 'PAUSED',
        startedAt: '2026-11-01T10:00:00.000Z',
        elapsedSeconds: 600,
      },
    })
    vi.spyOn(kanbanApi, 'updateTaskTimer').mockRejectedValue(new Error('offline'))
    const listSpy = vi.spyOn(kanbanApi, 'listTimeEntries')
    const { context, boardTask } = mountBoardWithContext(running)

    await context.stopTimer?.(42)
    await flushPromises()

    expect(listSpy).not.toHaveBeenCalled()
    expect(boardTask().totalSeconds).toBe(300)
  })
})

describe('Task dialog timer editor reports the total to the board', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mountEditor(taskId: string | number) {
    const setTaskTotal = vi.fn()
    const wrapper = mount(TaskTimerEditor, {
      props: { taskId, timer: null },
      global: {
        plugins: [PrimeVue, ToastService],
        provide: { [kanbanContextKey as symbol]: { columns: { value: [] }, moveTask: vi.fn(), setTaskTotal } },
      },
    })
    return { wrapper, setTaskTotal }
  }

  it('reports the total of the loaded entries', async () => {
    vi.spyOn(kanbanApi, 'listTimeEntries').mockResolvedValue([entry(11, 600), entry(12, 300)])

    const { setTaskTotal } = mountEditor(42)
    await flushPromises()

    expect(setTaskTotal).toHaveBeenLastCalledWith(42, 900)
  })

  it('reports the reduced total after an entry is deleted', async () => {
    vi.spyOn(kanbanApi, 'listTimeEntries').mockResolvedValue([entry(11, 600), entry(12, 300)])
    vi.spyOn(kanbanApi, 'deleteTimeEntry').mockResolvedValue({ success: true })
    const { wrapper, setTaskTotal } = mountEditor(42)
    await flushPromises()

    await wrapper.find('[data-testid="btn-delete-session-11"]').trigger('click')
    await flushPromises()

    expect(setTaskTotal).toHaveBeenLastCalledWith(42, 300)
  })

  it('does not report totals for a task that has not been saved yet', async () => {
    const listSpy = vi.spyOn(kanbanApi, 'listTimeEntries')

    const { setTaskTotal } = mountEditor('draft-1')
    await flushPromises()

    expect(listSpy).not.toHaveBeenCalled()
    expect(setTaskTotal).not.toHaveBeenCalled()
  })
})

import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastEventBus from 'primevue/toasteventbus'
import ToastService from 'primevue/toastservice'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { kanbanApi, type KanbanTaskDto, type TagDto, type TaskTimeEntryDto } from '~/api/kanban'
import {
  applyTaskUpdates,
  getBoardMembers,
  isBoardShared,
  sameId,
  useKanbanTaskActions,
  type KanbanTaskActionsOptions,
} from '~/composables/useKanbanTaskActions'
import {
  createBoardFixture,
  createTagFixture,
  createTaskFixture,
} from '../fixtures'

function createActionsHarness(overrides: Partial<KanbanTaskActionsOptions> = {}) {
  const availableTags = overrides.availableTags ?? ref<TagDto[]>([])
  let actions!: ReturnType<typeof useKanbanTaskActions>

  const Harness = defineComponent({
    setup() {
      actions = useKanbanTaskActions({
        findTask: () => undefined,
        availableTags,
        ...overrides,
      })
      return () => h('div')
    },
  })

  const wrapper = mount(Harness, {
    global: {
      plugins: [PrimeVue, ToastService],
    },
  })

  return { wrapper, actions, availableTags }
}

describe('useKanbanTaskActions pure helpers', () => {
  it('sameId matches string and numeric IDs and rejects nullish values', () => {
    expect(sameId(42, '42')).toBe(true)
    expect(sameId('col-1', 'col-1')).toBe(true)
    expect(sameId(1, 2)).toBe(false)
    expect(sameId(null, '1')).toBe(false)
    expect(sameId(undefined, undefined)).toBe(false)
  })

  it('applyTaskUpdates mutates provided task fields and clears NONE timer to null', () => {
    const tag = createTagFixture({ id: 5, name: 'API' })
    const task = createTaskFixture({
      id: 10,
      title: 'Old Title',
      description: 'Old Desc',
      priority: 'LOW',
      tags: [],
      timer: {
        taskId: 10,
        mode: 'COUNT_UP',
        targetDurationSeconds: null,
        state: 'PAUSED',
        startedAt: '2026-11-18T10:00:00Z',
        elapsedSeconds: 45,
      },
    })

    applyTaskUpdates(task, {
      title: 'New Title',
      priority: 'HIGH',
      tags: [tag],
      dueAt: '2026-11-20T12:00:00Z',
      reminderOffsetSeconds: 3600,
      timer: {
        taskId: 10,
        mode: 'COUNT_DOWN',
        targetDurationSeconds: 1500,
        state: 'IDLE',
        startedAt: null,
        elapsedSeconds: 0,
      },
    })

    expect(task.title).toBe('New Title')
    expect(task.description).toBe('Old Desc')
    expect(task.priority).toBe('HIGH')
    expect(task.tags).toEqual([tag])
    expect(task.dueAt).toBe('2026-11-20T12:00:00Z')
    expect(task.reminderOffsetSeconds).toBe(3600)
    expect(task.timer).toMatchObject({
      taskId: 10,
      mode: 'COUNT_DOWN',
      targetDurationSeconds: 1500,
      state: 'IDLE',
    })

    applyTaskUpdates(task, {
      timer: {
        taskId: 10,
        mode: 'NONE',
        targetDurationSeconds: null,
        state: 'IDLE',
        startedAt: null,
        elapsedSeconds: 0,
      },
    })
    expect(task.timer).toBeNull()
  })

  it('isBoardShared and getBoardMembers inspect ownership and deduplicate collaborators', () => {
    const owner = {
      id: 1,
      email: 'owner@example.com',
      display_name: 'Owner',
      timezone: 'UTC',
      created_at: '2026-11-01T00:00:00Z',
    }
    const collab = {
      id: 2,
      email: 'collab@example.com',
      display_name: 'Collab',
      timezone: 'UTC',
      created_at: '2026-11-01T00:00:00Z',
    }

    const soloBoard = { ...createBoardFixture({ isOwner: true }), owner, collaborators: [] }
    expect(isBoardShared(soloBoard)).toBe(false)
    expect(getBoardMembers(soloBoard)).toEqual([owner])

    const sharedByCollab = {
      ...createBoardFixture({ isOwner: true }),
      owner,
      collaborators: [owner, collab],
    }
    expect(isBoardShared(sharedByCollab)).toBe(true)
    expect(getBoardMembers(sharedByCollab)).toEqual([owner, collab])

    const sharedAsGuest = { ...createBoardFixture({ isOwner: false }), collaborators: [] }
    expect(isBoardShared(sharedAsGuest)).toBe(true)
  })
})

describe('useKanbanTaskActions tag management', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ToastEventBus, 'emit')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates tags via API, appends to availableTags, deduplicates case-insensitively, and notifies on failure', async () => {
    const createdTag = createTagFixture({ id: 99, name: 'Urgent' })
    const createTagSpy = vi.spyOn(kanbanApi, 'createTag').mockResolvedValue(createdTag)
    const { actions, availableTags } = createActionsHarness()

    const first = await actions.createTag('Urgent')
    expect(createTagSpy).toHaveBeenCalledWith({ name: 'Urgent' })
    expect(first).toEqual(createdTag)
    expect(availableTags.value).toEqual([createdTag])

    await actions.createTag({ name: 'urgent' })
    expect(availableTags.value).toHaveLength(1)

    createTagSpy.mockRejectedValueOnce(new Error('Tag failure'))
    await expect(actions.createTag('Broken')).rejects.toThrow('Tag failure')
    expect(ToastEventBus.emit).toHaveBeenCalledWith(
      'add',
      expect.objectContaining({
        severity: 'error',
        summary: 'Unable to create tag',
        detail: 'Tag failure',
      }),
    )
  })
})

describe('useKanbanTaskActions task update and save', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ToastEventBus, 'emit')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('updateTask reconciles concurrent PATCH and moveTask without stale PATCH overwriting moved columnId', async () => {
    const task = createTaskFixture({
      id: 't-1',
      title: 'Before',
      columnId: 'col-1',
      position: 0,
    })
    const tasks = ref<KanbanTaskDto[]>([task])
    const onAfterTaskUpdate = vi.fn()
    const moveTaskLocally = vi.fn((target: KanbanTaskDto, destColId: string | number) => {
      target.columnId = destColId
      target.position = 2
      return 2
    })

    // Simulate PATCH resolving faster than moveTask and returning stale columnId: 'col-1'
    vi.spyOn(kanbanApi, 'updateTask').mockResolvedValue({
      ...task,
      title: 'After',
      columnId: 'col-1',
      position: 0,
    })
    const moveSpy = vi.spyOn(kanbanApi, 'moveTask').mockImplementation(async (id, req) => {
      await new Promise(resolve => setTimeout(resolve, 15))
      return {
        ...task,
        id,
        title: 'After',
        columnId: req.toColumnId,
        position: req.targetPosition,
      }
    })

    const { actions } = createActionsHarness({
      findTask: id => tasks.value.find(t => sameId(t.id, id)),
      moveTaskLocally,
      onAfterTaskUpdate,
    })

    await actions.updateTask('t-1', {
      title: 'After',
      columnId: 'col-2',
    })

    expect(moveTaskLocally).toHaveBeenCalledWith(task, 'col-2')
    expect(moveSpy).toHaveBeenCalledWith('t-1', { toColumnId: 'col-2', targetPosition: 2 })
    expect(task.title).toBe('After')
    expect(task.columnId).toBe('col-2')
    expect(task.position).toBe(2)
    expect(onAfterTaskUpdate).toHaveBeenCalledTimes(1)
    expect(ToastEventBus.emit).toHaveBeenCalledWith(
      'add',
      expect.objectContaining({ severity: 'success', detail: 'Task updated.' }),
    )
  })

  it('updateTask rolls back snapshot on API error', async () => {
    const task = createTaskFixture({
      id: 't-rollback',
      title: 'Original',
      columnId: 'col-1',
      position: 0,
    })
    const tasks = ref<KanbanTaskDto[]>([task])

    vi.spyOn(kanbanApi, 'updateTask').mockRejectedValue(new Error('Update failed'))

    const { actions } = createActionsHarness({
      findTask: id => tasks.value.find(t => sameId(t.id, id)),
      createSnapshot: () => {
        const snap = JSON.parse(JSON.stringify(tasks.value))
        return () => {
          tasks.value = snap
        }
      },
    })

    await actions.updateTask('t-rollback', { title: 'Mutated' })
    expect(tasks.value[0]?.title).toBe('Original')
    expect(ToastEventBus.emit).toHaveBeenCalledWith(
      'add',
      expect.objectContaining({ severity: 'error', summary: 'Unable to update task', detail: 'Update failed' }),
    )
  })

  it('updateTask aborts cleanly without API call when moveTaskLocally returns null', async () => {
    const task = createTaskFixture({
      id: 't-missing-dest',
      title: 'Original',
      columnId: 'col-1',
      position: 0,
    })
    const tasks = ref<KanbanTaskDto[]>([task])
    const updateSpy = vi.spyOn(kanbanApi, 'updateTask')
    const { actions } = createActionsHarness({
      findTask: id => tasks.value.find(t => sameId(t.id, id)),
      moveTaskLocally: () => null,
    })

    await actions.updateTask('t-missing-dest', { title: 'Ignored', columnId: 'col-missing' })
    expect(updateSpy).not.toHaveBeenCalled()
    expect(tasks.value[0]?.title).toBe('Original')
    expect(ToastEventBus.emit).toHaveBeenCalledWith(
      'add',
      expect.objectContaining({ severity: 'error', summary: 'Unable to update task' }),
    )
  })

  it('saveTask delegates create to onCreateTask and deactivates recurrence when turned off on edit', async () => {
    const onCreateTask = vi.fn().mockResolvedValue(undefined)
    const recurringTask = createTaskFixture({
      id: 't-rec',
      title: 'Routine',
      columnId: 'col-1',
      recurringTaskId: 'rec-55',
      recurringTask: {
        id: 'rec-55',
        boardId: 1,
        creatorId: 1,
        title: 'Routine',
        cadence: 'DAILY',
        daysOfWeek: [],
        dayOfMonth: null,
        timeOfDay: '09:00:00',
        timezone: 'UTC',
        defaultTimerMode: 'NONE',
        isActive: true,
        nextRunAt: '2026-11-19T09:00:00Z',
      },
    })
    const tasks = ref<KanbanTaskDto[]>([recurringTask])

    vi.spyOn(kanbanApi, 'updateTask').mockResolvedValue({ ...recurringTask })
    const recSpy = vi.spyOn(kanbanApi, 'updateRecurringTask').mockResolvedValue({
      ...recurringTask.recurringTask!,
      isActive: false,
    })

    const { actions } = createActionsHarness({
      findTask: id => tasks.value.find(t => sameId(t.id, id)),
      onCreateTask,
    })

    await actions.saveTask({
      mode: 'create',
      columnId: 'col-1',
      title: 'Created Task',
      description: 'Notes',
      priority: 'MEDIUM',
    })
    expect(onCreateTask).toHaveBeenCalledWith('col-1', expect.objectContaining({
      title: 'Created Task',
      description: 'Notes',
      priority: 'MEDIUM',
    }))

    await actions.saveTask({
      mode: 'edit',
      taskId: 't-rec',
      columnId: 'col-1',
      title: 'Routine',
      description: '',
      recurringTaskId: 'rec-55',
      recurrence: null,
    })
    expect(recSpy).toHaveBeenCalledWith('rec-55', { isActive: false })
    expect(recurringTask.recurringTask?.isActive).toBe(false)
  })
})

describe('useKanbanTaskActions task deletion', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ToastEventBus, 'emit')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deleteTask optimistically removes task, calls API with options, and runs onAfterTaskDelete', async () => {
    const task = createTaskFixture({ id: 't-del', title: 'Delete Me' })
    const tasks = ref<KanbanTaskDto[]>([task])
    const onAfterTaskDelete = vi.fn()
    const deleteSpy = vi.spyOn(kanbanApi, 'deleteTask').mockResolvedValue({ success: true })

    const { actions } = createActionsHarness({
      findTask: id => tasks.value.find(t => sameId(t.id, id)),
      removeTaskLocally: (id) => {
        const idx = tasks.value.findIndex(t => sameId(t.id, id))
        if (idx === -1) return false
        tasks.value.splice(idx, 1)
        return true
      },
      onAfterTaskDelete,
    })

    await actions.deleteTask('t-del', { cancelRecurrence: true })

    expect(tasks.value).toHaveLength(0)
    expect(deleteSpy).toHaveBeenCalledWith('t-del', { cancelRecurrence: true })
    expect(onAfterTaskDelete).toHaveBeenCalledWith('t-del')
    expect(ToastEventBus.emit).toHaveBeenCalledWith(
      'add',
      expect.objectContaining({ severity: 'success', detail: 'Task deleted.' }),
    )
  })

  it('deleteTask restores snapshot and emits error toast when API fails', async () => {
    const task = createTaskFixture({ id: 't-keep', title: 'Keep Me' })
    const tasks = ref<KanbanTaskDto[]>([task])
    const onAfterTaskDelete = vi.fn()
    vi.spyOn(kanbanApi, 'deleteTask').mockRejectedValue(new Error('Delete denied'))

    const { actions } = createActionsHarness({
      findTask: id => tasks.value.find(t => sameId(t.id, id)),
      createSnapshot: () => {
        const snap = JSON.parse(JSON.stringify(tasks.value))
        return () => {
          tasks.value = snap
        }
      },
      removeTaskLocally: (id) => {
        const idx = tasks.value.findIndex(t => sameId(t.id, id))
        if (idx === -1) return false
        tasks.value.splice(idx, 1)
        return true
      },
      onAfterTaskDelete,
    })

    await actions.deleteTask('t-keep')

    expect(tasks.value).toHaveLength(1)
    expect(tasks.value[0]?.id).toBe('t-keep')
    expect(onAfterTaskDelete).not.toHaveBeenCalled()
    expect(ToastEventBus.emit).toHaveBeenCalledWith(
      'add',
      expect.objectContaining({ severity: 'error', summary: 'Unable to delete task', detail: 'Delete denied' }),
    )
  })
})

describe('useKanbanTaskActions timer lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'))
    vi.restoreAllMocks()
    vi.spyOn(ToastEventBus, 'emit')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('startTimer and pauseTimer update timer state, persist via API, and fire onAfterTimerChange', async () => {
    const task = createTaskFixture({
      id: 't-timer',
      title: 'Focus Task',
      timer: {
        taskId: 't-timer',
        mode: 'COUNT_UP',
        targetDurationSeconds: null,
        state: 'IDLE',
        startedAt: null,
        elapsedSeconds: 0,
      },
    })
    const tasks = ref<KanbanTaskDto[]>([task])
    const onAfterTimerChange = vi.fn()
    const timerSpy = vi.spyOn(kanbanApi, 'updateTaskTimer').mockImplementation(async (_id, payload) => ({
      taskId: 't-timer',
      mode: payload.mode ?? 'COUNT_UP',
      targetDurationSeconds: payload.targetDurationSeconds ?? null,
      state: payload.state ?? 'RUNNING',
      startedAt: payload.startedAt ?? null,
      lastResumedAt: payload.lastResumedAt ?? null,
      lastPausedAt: payload.lastPausedAt ?? null,
      elapsedSeconds: payload.elapsedSeconds ?? 0,
    }))

    const { actions } = createActionsHarness({
      findTask: id => tasks.value.find(t => sameId(t.id, id)),
      onAfterTimerChange,
    })

    await actions.startTimer('t-timer')
    expect(task.timer?.state).toBe('RUNNING')
    expect(timerSpy).toHaveBeenCalledTimes(1)
    expect(onAfterTimerChange).toHaveBeenCalled()

    vi.advanceTimersByTime(45_000)
    await actions.pauseTimer('t-timer')

    expect(task.timer?.state).toBe('PAUSED')
    expect(task.timer?.elapsedSeconds).toBe(45)
    expect(timerSpy).toHaveBeenCalledTimes(2)
  })

  it('stopTimer debounces within 2000ms, resets timer, and refreshes total from time entries', async () => {
    const task = createTaskFixture({
      id: 't-stop',
      title: 'Stop Task',
      totalSeconds: 60,
      timer: {
        taskId: 't-stop',
        mode: 'COUNT_UP',
        targetDurationSeconds: null,
        state: 'RUNNING',
        startedAt: '2026-11-18T11:59:00.000Z',
        lastResumedAt: '2026-11-18T11:59:00.000Z',
        elapsedSeconds: 10,
      },
    })
    const tasks = ref<KanbanTaskDto[]>([task])
    const onAfterTaskTotalChange = vi.fn()

    const timerSpy = vi.spyOn(kanbanApi, 'updateTaskTimer').mockResolvedValue({
      taskId: 't-stop',
      mode: 'COUNT_UP',
      targetDurationSeconds: null,
      state: 'IDLE',
      startedAt: null,
      elapsedSeconds: 0,
    })
    const entry: TaskTimeEntryDto = {
      id: 1,
      taskId: 't-stop',
      startedAt: '2026-11-18T11:59:00.000Z',
      endedAt: '2026-11-18T12:00:00.000Z',
      durationSeconds: 70,
      note: '',
    }
    vi.spyOn(kanbanApi, 'listTimeEntries').mockResolvedValue([entry])

    const { actions } = createActionsHarness({
      findTask: id => tasks.value.find(t => sameId(t.id, id)),
      onAfterTaskTotalChange,
    })

    await actions.stopTimer('t-stop')
    expect(timerSpy).toHaveBeenCalledTimes(1)
    expect(timerSpy).toHaveBeenCalledWith('t-stop', expect.objectContaining({ state: 'IDLE', elapsedSeconds: 70 }))
    expect(task.timer?.state).toBe('IDLE')
    expect(task.timer?.elapsedSeconds).toBe(0)
    expect(task.timeEntries).toEqual([entry])
    expect(task.totalSeconds).toBe(70)
    expect(onAfterTaskTotalChange).toHaveBeenCalledWith('t-stop', 70)

    // Duplicate call within 2000ms is debounced
    task.timer!.state = 'RUNNING'
    await actions.stopTimer('t-stop')
    expect(timerSpy).toHaveBeenCalledTimes(1)

    // Call after 2000ms proceeds
    vi.advanceTimersByTime(2100)
    await actions.stopTimer('t-stop')
    expect(timerSpy).toHaveBeenCalledTimes(2)
  })

  it('handleTimerExpired debounces completion alerts within 3000ms and exposes total/entry setters', () => {
    const task = createTaskFixture({ id: 't-exp', title: 'Alert Task', totalSeconds: 0 })
    const tasks = ref<KanbanTaskDto[]>([task])
    const onAfterTaskTotalChange = vi.fn()
    const { actions } = createActionsHarness({
      findTask: id => tasks.value.find(t => sameId(t.id, id)),
      onAfterTaskTotalChange,
    })

    const entries: TaskTimeEntryDto[] = [{
      id: 5,
      taskId: 't-exp',
      startedAt: '2026-11-18T11:00:00.000Z',
      durationSeconds: 300,
      note: '',
    }]
    actions.setTaskTimeEntries('t-exp', entries)
    actions.setTaskTotal('t-exp', 300)
    expect(task.timeEntries).toEqual(entries)
    expect(task.totalSeconds).toBe(300)
    expect(onAfterTaskTotalChange).toHaveBeenCalledWith('t-exp', 300)

    const emitSpy = vi.spyOn(ToastEventBus, 'emit')
    emitSpy.mockClear()

    actions.handleTimerExpired(task)
    actions.handleTimerExpired(task)
    expect(emitSpy).toHaveBeenCalledTimes(1)
    expect(emitSpy).toHaveBeenCalledWith(
      'add',
      expect.objectContaining({ severity: 'success', summary: 'Time is up!' }),
    )

    vi.advanceTimersByTime(3100)
    actions.handleTimerExpired(task)
    expect(emitSpy).toHaveBeenCalledTimes(2)
  })
})

import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNuxtData } from '#app'
import { kanbanApi, type KanbanBoardDto, type TaskFeedItemDto, type TaskTimerDto } from '~/api/kanban'
import HomePage from '~/pages/boards/index.vue'
import { useAuthStore } from '~/stores/auth'
import {
  AppDialogStub,
  createBoardFixture,
  createColumnFixture,
  createTagFixture,
  createTaskFeedItemFixture,
  createTaskFixture,
  DatePickerStub,
  InputMaskStub,
  InputNumberStub,
  PopoverStub,
  SelectStub,
  ToggleSwitchStub,
} from '../fixtures'

let mountedWrappers: VueWrapper[] = []

async function mountHomePage() {
  const wrapper = await mountSuspended(HomePage, {
    route: '/boards',
    global: {
      stubs: {
        Dialog: AppDialogStub,
        Popover: PopoverStub,
        Select: SelectStub,
        ToggleSwitch: ToggleSwitchStub,
        InputNumber: InputNumberStub,
        InputMask: InputMaskStub,
        DatePicker: DatePickerStub,
      },
    },
  })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

function buildSampleData(): { boards: KanbanBoardDto[]; feedTasks: TaskFeedItemDto[] } {
  const task1 = createTaskFixture({
    id: 101,
    title: 'Prepare release notes',
    columnId: 10,
    position: 0,
  })
  const task2 = createTaskFixture({
    id: 102,
    title: 'Verify migration script',
    columnId: 20,
    position: 0,
    timer: {
      taskId: 102,
      mode: 'COUNT_UP',
      targetDurationSeconds: null,
      state: 'IDLE',
      startedAt: null,
      elapsedSeconds: 0,
    },
  })

  const board1: KanbanBoardDto = {
    ...createBoardFixture({
      id: 1,
      title: 'Core Platform',
      description: 'Platform engineering tasks',
      isOwner: true,
      columns: [
        createColumnFixture({ id: 10, title: 'To Do', position: 0, boardId: 1, tasks: [task1] }),
        createColumnFixture({ id: 11, title: 'In Progress', position: 1, boardId: 1, tasks: [] }),
      ],
    }),
    owner: {
      id: 1,
      email: 'owner@example.com',
      display_name: 'Owner',
      timezone: 'UTC',
      created_at: '2026-01-01T00:00:00Z',
    },
    collaborators: [],
  }

  const board2: KanbanBoardDto = {
    ...createBoardFixture({
      id: 2,
      title: 'Design System',
      description: 'Shared component library',
      isOwner: false,
      columns: [
        createColumnFixture({ id: 20, title: 'Review', position: 0, boardId: 2, tasks: [task2] }),
      ],
    }),
    owner: {
      id: 2,
      email: 'lead@example.com',
      display_name: 'Lead Designer',
      timezone: 'UTC',
      created_at: '2026-01-01T00:00:00Z',
    },
    collaborators: [
      {
        id: 1,
        email: 'owner@example.com',
        display_name: 'Owner',
        timezone: 'UTC',
        created_at: '2026-01-01T00:00:00Z',
        role: 'EDITOR',
      },
    ],
  }

  const feedTasks: TaskFeedItemDto[] = [
    createTaskFeedItemFixture({
      ...task1,
      boardId: 1,
      boardTitle: 'Core Platform',
      columnId: 10,
      columnTitle: 'To Do',
    }),
    createTaskFeedItemFixture({
      ...task2,
      boardId: 2,
      boardTitle: 'Design System',
      columnId: 20,
      columnTitle: 'Review',
    }),
  ]

  return { boards: [board1, board2], feedTasks }
}

describe('Home Page (/) with Task Feed', () => {
  beforeEach(() => {
    clearNuxtData()
    useAuthStore().$patch({
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      sessionInitialized: true,
      user: {
        id: 1,
        email: 'owner@example.com',
        display_name: 'Owner',
        timezone: 'UTC',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
    })

    vi.spyOn(kanbanApi, 'listTags').mockResolvedValue([])
    vi.spyOn(kanbanApi, 'listUserTags').mockResolvedValue([])
    vi.spyOn(kanbanApi, 'listTimeEntries').mockResolvedValue([])
    vi.spyOn(kanbanApi, 'updateTask').mockResolvedValue(createTaskFixture({ id: 101 }))
    vi.spyOn(kanbanApi, 'moveTask').mockResolvedValue(createTaskFixture({ id: 101 }))
    vi.spyOn(kanbanApi, 'deleteTask').mockResolvedValue({ success: true })
    vi.spyOn(kanbanApi, 'updateTaskTimer').mockResolvedValue({
      taskId: 102,
      mode: 'COUNT_UP',
      targetDurationSeconds: null,
      state: 'IDLE',
      startedAt: null,
      elapsedSeconds: 0,
    })
  })

  afterEach(() => {
    for (const wrapper of mountedWrappers) {
      wrapper.unmount()
    }
    mountedWrappers = []
    clearNuxtData()
    vi.restoreAllMocks()
  })

  it('renders 8/4 desktop split layout with non-draggable Task Feed and board/column context', async () => {
    const { boards, feedTasks } = buildSampleData()
    vi.spyOn(kanbanApi, 'listBoards').mockResolvedValue(boards)
    vi.spyOn(kanbanApi, 'listTaskFeed').mockResolvedValue(feedTasks)

    const wrapper = await mountHomePage()

    const rootGrid = wrapper.find('.lg\\:grid-cols-12')
    expect(rootGrid.exists()).toBe(true)

    const boardsSection = wrapper.find('section.lg\\:col-span-8')
    expect(boardsSection.exists()).toBe(true)
    expect(boardsSection.findAll('[data-testid="board-card"]')).toHaveLength(2)

    const feedRail = wrapper.find('[data-testid="task-feed-rail"]')
    expect(feedRail.exists()).toBe(true)
    expect(feedRail.classes()).toContain('lg:col-span-4')
    expect(feedRail.classes()).toContain('lg:sticky')

    const feedColumn = feedRail.find('[data-testid="kanban-column"]')
    expect(feedColumn.exists()).toBe(true)
    expect(feedColumn.text()).toContain('Task Feed')
    expect(feedColumn.find('[data-testid="column-task-count"]').text()).toContain('2')
    expect(feedColumn.find('[data-testid="edit-column-button"]').exists()).toBe(false)
    expect(feedColumn.find('[data-testid="add-task-button"]').exists()).toBe(false)

    const feedTaskElements = feedRail.findAll('[data-testid="kanban-task"]')
    expect(feedTaskElements).toHaveLength(2)
    expect(feedTaskElements[0]!.classes()).toContain('cursor-pointer')
    expect(feedTaskElements[0]!.classes()).not.toContain('cursor-grab')

    const contexts = feedRail.findAll('[data-testid="feed-task-context"]')
    expect(contexts).toHaveLength(2)
    expect(contexts[0]!.text()).toContain('Core Platform')
    expect(contexts[0]!.text()).toContain('To Do')
    expect(contexts[1]!.text()).toContain('Design System')
    expect(contexts[1]!.text()).toContain('Review')
  })

  it('shows empty state when Task Feed has no active tasks, and handles error, loading, and retry states', async () => {
    const { boards, feedTasks } = buildSampleData()
    vi.spyOn(kanbanApi, 'listBoards').mockResolvedValue(boards)
    const feedSpy = vi.spyOn(kanbanApi, 'listTaskFeed').mockResolvedValueOnce([])

    const emptyWrapper = await mountHomePage()
    const rail = emptyWrapper.find('[data-testid="task-feed-rail"]')
    expect(rail.find('[data-testid="column-empty-placeholder"]').text()).toBe(
      'No active tasks across your boards yet',
    )

    emptyWrapper.unmount()
    clearNuxtData()

    feedSpy.mockRejectedValueOnce(new Error('Feed service unavailable'))
    const retryWrapper = await mountHomePage()
    const errorEl = retryWrapper.find('[data-testid="task-feed-error"]')
    expect(errorEl.exists()).toBe(true)

    let resolveRetry!: (tasks: TaskFeedItemDto[]) => void
    feedSpy.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRetry = resolve
      }),
    )

    await errorEl.find('button').trigger('click')
    await flushPromises()

    expect(retryWrapper.find('[data-testid="task-feed-loading"]').exists()).toBe(true)

    resolveRetry(feedTasks)
    await flushPromises()

    expect(retryWrapper.find('[data-testid="task-feed-loading"]').exists()).toBe(false)
    expect(retryWrapper.find('[data-testid="task-feed-error"]').exists()).toBe(false)
    expect(retryWrapper.find('[data-testid="task-feed-rail"]').findAll('[data-testid="kanban-task"]')).toHaveLength(2)
  })

  it('refreshes both boards and Task Feed when BoardFormDialog saves or deletes a board', async () => {
    const { boards, feedTasks } = buildSampleData()
    const listBoardsSpy = vi.spyOn(kanbanApi, 'listBoards').mockResolvedValue(boards)
    const listFeedSpy = vi.spyOn(kanbanApi, 'listTaskFeed').mockResolvedValue(feedTasks)
    vi.spyOn(kanbanApi, 'createBoard').mockResolvedValue(
      createBoardFixture({ id: 99, title: 'Fresh Board', columns: [] }),
    )
    vi.spyOn(kanbanApi, 'deleteBoard').mockResolvedValue({ success: true })

    const wrapper = await mountHomePage()
    expect(listBoardsSpy).toHaveBeenCalledTimes(1)
    expect(listFeedSpy).toHaveBeenCalledTimes(1)

    await wrapper.find('[data-testid="new-board-button"]').trigger('click')
    await wrapper.find('[data-testid="board-title-input"]').setValue('Fresh Board')
    await wrapper.find('form#board-form').trigger('submit')
    await flushPromises()

    expect(listBoardsSpy).toHaveBeenCalledTimes(2)
    expect(listFeedSpy).toHaveBeenCalledTimes(2)

    await wrapper.find('button[aria-label="Edit Core Platform"]').trigger('click')
    await wrapper.find('[data-testid="board-delete-button"]').trigger('click')
    await wrapper.find('[data-testid="board-confirm-delete-button"]').trigger('click')
    await flushPromises()

    expect(listBoardsSpy).toHaveBeenCalledTimes(3)
    expect(listFeedSpy).toHaveBeenCalledTimes(3)
  })

  it('operates inline TaskTimerDock Start/Pause/Stop and syncs totalSeconds and parent Board timer indicator', async () => {
    const { boards, feedTasks } = buildSampleData()
    vi.spyOn(kanbanApi, 'listBoards').mockResolvedValue(boards)
    vi.spyOn(kanbanApi, 'listTaskFeed').mockResolvedValue(feedTasks)
    const updateTimerSpy = vi.spyOn(kanbanApi, 'updateTaskTimer').mockImplementation(async (taskId, payload) => ({
      taskId,
      mode: payload.mode ?? 'COUNT_UP',
      targetDurationSeconds: payload.targetDurationSeconds ?? null,
      state: payload.state ?? 'IDLE',
      startedAt: payload.startedAt ?? null,
      lastResumedAt: payload.lastResumedAt ?? null,
      lastPausedAt: payload.lastPausedAt ?? null,
      elapsedSeconds: payload.elapsedSeconds ?? 0,
    }) as TaskTimerDto)
    const listEntriesSpy = vi.spyOn(kanbanApi, 'listTimeEntries').mockResolvedValue([
      {
        id: 901,
        taskId: 102,
        startedAt: '2026-11-18T10:00:00Z',
        endedAt: '2026-11-18T10:02:00Z',
        durationSeconds: 120,
        note: 'Continuous focus timer session',
      },
    ])

    const wrapper = await mountHomePage()
    const boardPanels = wrapper.findAll('[data-testid="board-card"]')
    const designBoardPanel = boardPanels.find(b => b.text().includes('Design System'))!
    const feedTaskEl = wrapper.find('[data-testid="task-feed-rail"] [data-task-id="102"]')

    expect(designBoardPanel.text()).not.toContain('timer running')
    expect(feedTaskEl.find('[data-testid="task-total-time"]').exists()).toBe(false)

    // Start timer from Task Feed inline dock
    await feedTaskEl.find('[data-testid="card-timer-btn-start"]').trigger('click')
    await flushPromises()

    expect(updateTimerSpy).toHaveBeenCalledWith(102, expect.objectContaining({ state: 'RUNNING' }))
    expect(designBoardPanel.text()).toContain('1 timer running')
    expect(feedTaskEl.find('[data-testid="card-timer-btn-pause"]').exists()).toBe(true)

    // Pause timer
    await feedTaskEl.find('[data-testid="card-timer-btn-pause"]').trigger('click')
    await flushPromises()

    expect(updateTimerSpy).toHaveBeenCalledWith(102, expect.objectContaining({ state: 'PAUSED' }))
    expect(designBoardPanel.text()).not.toContain('timer running')

    // Resume and Stop timer
    await feedTaskEl.find('[data-testid="card-timer-btn-start"]').trigger('click')
    await flushPromises()
    expect(designBoardPanel.text()).toContain('1 timer running')

    await feedTaskEl.find('[data-testid="card-timer-btn-stop"]').trigger('click')
    await flushPromises()

    expect(updateTimerSpy).toHaveBeenCalledWith(102, expect.objectContaining({ state: 'IDLE' }))
    expect(listEntriesSpy).toHaveBeenCalledWith(102)
    expect(designBoardPanel.text()).not.toContain('timer running')
    expect(feedTaskEl.find('[data-testid="task-total-time"]').text()).toContain('2m')
  })

  it('opens TaskDialog in edit mode, hydrates board banner/columns/collaborators, and ignores stale listTags responses', async () => {
    const { boards, feedTasks } = buildSampleData()
    vi.spyOn(kanbanApi, 'listBoards').mockResolvedValue(boards)
    vi.spyOn(kanbanApi, 'listTaskFeed').mockResolvedValue(feedTasks)

    let resolveFirstTags!: (tags: ReturnType<typeof createTagFixture>[]) => void
    const listTagsSpy = vi.spyOn(kanbanApi, 'listTags')
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveFirstTags = resolve
        }),
      )
      .mockResolvedValueOnce([createTagFixture({ id: 88, name: 'DesignTag' })])

    const wrapper = await mountHomePage()

    // Click first task (Core Platform -> To Do)
    await wrapper.find('[data-testid="task-feed-rail"] [data-task-id="101"]').trigger('click')
    await flushPromises()

    expect(listTagsSpy).toHaveBeenCalledWith(1)
    const dialog = wrapper.find('[data-testid="task-dialog"]')
    expect(dialog.exists()).toBe(true)

    const banner = dialog.find('[data-testid="task-dialog-board-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Core Platform')
    expect(banner.text()).toContain('To Do')

    const boardLink = dialog.find('[data-testid="task-dialog-board-link"]')
    expect(boardLink.exists()).toBe(true)
    expect(boardLink.attributes('href')).toBe('/boards/1')

    const columnOptions = dialog.findAll('[data-testid="task-column-select"] option').map(o => o.text())
    expect(columnOptions).toEqual(['To Do', 'In Progress'])

    // Close and open second task (shared Design System board) before first listTags settles
    await dialog.find('[data-testid="task-cancel-button"]').trigger('click')
    await wrapper.find('[data-testid="task-feed-rail"] [data-task-id="102"]').trigger('click')
    await flushPromises()

    // Resolve stale first request after second request already completed
    resolveFirstTags([createTagFixture({ id: 77, name: 'StaleTag' })])
    await flushPromises()

    expect(listTagsSpy).toHaveBeenCalledWith(2)
    const updatedDialog = wrapper.find('[data-testid="task-dialog"]')
    expect(updatedDialog.find('[data-testid="task-dialog-board-banner"]').text()).toContain('Design System')
    expect(updatedDialog.find('[data-testid="task-dialog-board-link"]').attributes('href')).toBe('/boards/2')

    const tagSuggestionsText = updatedDialog.findAll('[data-testid="task-tag-suggestion"]').map(el => el.text()).join(' ')
    expect(tagSuggestionsText).toContain('DesignTag')
    expect(tagSuggestionsText).not.toContain('StaleTag')

    // Shared board collaborators hydrate the Recorded by selector
    await updatedDialog.find('[data-testid="btn-toggle-log-past-work"]').trigger('click')
    const recordedBySelect = updatedDialog.find('[data-testid="manual-select-recorded-by"]')
    expect(recordedBySelect.exists()).toBe(true)
    const memberOptions = recordedBySelect.findAll('option').map(o => o.text())
    expect(memberOptions).toContain('Lead Designer')
    expect(memberOptions).toContain('Owner')
  })

  it('saves task edits including Column move and syncs both Task Feed and parent BoardCard column counts', async () => {
    const { boards, feedTasks } = buildSampleData()
    vi.spyOn(kanbanApi, 'listBoards').mockResolvedValue(boards)
    vi.spyOn(kanbanApi, 'listTaskFeed').mockResolvedValue(feedTasks)
    const updateTaskSpy = vi.spyOn(kanbanApi, 'updateTask').mockResolvedValue(
      createTaskFixture({
        id: 101,
        title: 'Publish release notes',
        columnId: 11,
        position: 0,
        updatedAt: '2026-11-18T12:00:00Z',
      }),
    )
    const moveTaskSpy = vi.spyOn(kanbanApi, 'moveTask').mockResolvedValue(
      createTaskFixture({
        id: 101,
        title: 'Publish release notes',
        columnId: 11,
        position: 0,
      }),
    )

    const wrapper = await mountHomePage()
    const coreBoardPanel = wrapper.findAll('[data-testid="board-card"]').find(b => b.text().includes('Core Platform'))!
    expect(coreBoardPanel.text()).toContain('To Do(1)')
    expect(coreBoardPanel.text()).toContain('In Progress(0)')

    await wrapper.find('[data-testid="task-feed-rail"] [data-task-id="101"]').trigger('click')
    await flushPromises()

    const dialog = wrapper.find('[data-testid="task-dialog"]')
    await dialog.find('[data-testid="task-title-input"]').setValue('Publish release notes')
    await dialog.find('[data-testid="task-column-select"]').setValue('11')
    await dialog.find('form').trigger('submit')
    await flushPromises()

    expect(updateTaskSpy).toHaveBeenCalledWith(101, expect.objectContaining({ title: 'Publish release notes' }))
    expect(moveTaskSpy).toHaveBeenCalledWith(101, { toColumnId: 11, targetPosition: 0 })

    const updatedFeedTask = wrapper.find('[data-testid="task-feed-rail"] [data-task-id="101"]')
    expect(updatedFeedTask.text()).toContain('Publish release notes')
    expect(updatedFeedTask.find('[data-testid="feed-task-context"]').text()).toContain('Core Platform')
    expect(updatedFeedTask.find('[data-testid="feed-task-context"]').text()).toContain('In Progress')

    expect(coreBoardPanel.text()).toContain('To Do(0)')
    expect(coreBoardPanel.text()).toContain('In Progress(1)')
  })

  it('deletes a task from TaskDialog and syncs Task Feed and parent BoardCard, rolling back on failure', async () => {
    const { boards, feedTasks } = buildSampleData()
    vi.spyOn(kanbanApi, 'listBoards').mockResolvedValue(boards)
    vi.spyOn(kanbanApi, 'listTaskFeed').mockResolvedValue(feedTasks)
    const deleteSpy = vi.spyOn(kanbanApi, 'deleteTask')
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('Delete failed'))

    const wrapper = await mountHomePage()
    const coreBoardPanel = wrapper.findAll('[data-testid="board-card"]').find(b => b.text().includes('Core Platform'))!
    const designBoardPanel = wrapper.findAll('[data-testid="board-card"]').find(b => b.text().includes('Design System'))!

    // Delete task 101 successfully
    await wrapper.find('[data-testid="task-feed-rail"] [data-task-id="101"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="task-dialog"] [data-testid="task-delete-button"]').trigger('click')
    await wrapper.find('[data-testid="task-dialog"] [data-testid="task-confirm-delete-button"]').trigger('click')
    await flushPromises()

    expect(deleteSpy).toHaveBeenCalledWith(101, { cancelRecurrence: false })
    expect(wrapper.find('[data-testid="task-feed-rail"] [data-task-id="101"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="task-feed-rail"] [data-testid="column-task-count"]').text()).toContain('1')
    expect(coreBoardPanel.text()).toContain('To Do(0)')

    // Fail deleting task 102 -> rollback both Task Feed and BoardCard
    await wrapper.find('[data-testid="task-feed-rail"] [data-task-id="102"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="task-dialog"] [data-testid="task-delete-button"]').trigger('click')
    await wrapper.find('[data-testid="task-dialog"] [data-testid="task-confirm-delete-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="task-feed-rail"] [data-task-id="102"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="task-feed-rail"] [data-testid="column-task-count"]').text()).toContain('1')
    expect(designBoardPanel.text()).toContain('Review(1)')
  })

  it('rolls back Task Feed and parent BoardCard changes when saving a moved task fails', async () => {
    const { boards, feedTasks } = buildSampleData()
    vi.spyOn(kanbanApi, 'listBoards').mockResolvedValue(boards)
    vi.spyOn(kanbanApi, 'listTaskFeed').mockResolvedValue(feedTasks)
    vi.spyOn(kanbanApi, 'updateTask').mockResolvedValue(createTaskFixture({ id: 101 }))
    vi.spyOn(kanbanApi, 'moveTask').mockRejectedValue(new Error('Move failed'))

    const wrapper = await mountHomePage()
    const coreBoardPanel = wrapper.findAll('[data-testid="board-card"]').find(b => b.text().includes('Core Platform'))!

    await wrapper.find('[data-testid="task-feed-rail"] [data-task-id="101"]').trigger('click')
    await flushPromises()

    const dialog = wrapper.find('[data-testid="task-dialog"]')
    await dialog.find('[data-testid="task-title-input"]').setValue('Attempted Title')
    await dialog.find('[data-testid="task-column-select"]').setValue('11')
    await dialog.find('form').trigger('submit')
    await flushPromises()

    const feedTask = wrapper.find('[data-testid="task-feed-rail"] [data-task-id="101"]')
    expect(feedTask.text()).toContain('Prepare release notes')
    expect(feedTask.text()).not.toContain('Attempted Title')
    expect(feedTask.find('[data-testid="feed-task-context"]').text()).toContain('To Do')
    expect(coreBoardPanel.text()).toContain('To Do(1)')
    expect(coreBoardPanel.text()).toContain('In Progress(0)')
  })

  it('loads userTags into Filter Popover, refreshes on board changes, and surfaces newly created tags immediately', async () => {
    const { boards, feedTasks } = buildSampleData()
    const listUserTagsSpy = vi.spyOn(kanbanApi, 'listUserTags').mockResolvedValue([
      createTagFixture({ id: 50, name: 'Ops' }),
    ])
    vi.spyOn(kanbanApi, 'listBoards').mockResolvedValue(boards)
    vi.spyOn(kanbanApi, 'listTaskFeed').mockResolvedValue(feedTasks)
    vi.spyOn(kanbanApi, 'createBoard').mockResolvedValue(
      createBoardFixture({ id: 99, title: 'Fresh Board', columns: [] }),
    )
    vi.spyOn(kanbanApi, 'createTag').mockResolvedValue(
      createTagFixture({ id: 51, name: 'Urgent' }),
    )

    const wrapper = await mountHomePage()
    expect(listUserTagsSpy).toHaveBeenCalledTimes(1)

    await wrapper.find('[data-testid="feed-filter-trigger"]').trigger('click')
    const optionTexts = () => wrapper.find('[data-testid="feed-tag-listbox"]')
      .findAll('[role="option"]')
      .map(el => el.text())

    expect(optionTexts()).toEqual([
      expect.stringContaining('Ops'),
      expect.stringContaining('Untagged'),
    ])

    // Open TaskDialog and create a new tag -> immediately appears in Filter Popover
    await wrapper.find('[data-testid="task-feed-rail"] [data-task-id="101"]').trigger('click')
    await flushPromises()
    const tagInput = wrapper.find('[data-testid="task-tag-input"]')
    await tagInput.setValue('Urgent')
    await tagInput.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(optionTexts()).toEqual([
      expect.stringContaining('Ops'),
      expect.stringContaining('Urgent'),
      expect.stringContaining('Untagged'),
    ])

    await wrapper.find('[data-testid="task-cancel-button"]').trigger('click')

    // Saving a board via refreshAll also refreshes userTags
    await wrapper.find('[data-testid="new-board-button"]').trigger('click')
    await wrapper.find('[data-testid="board-title-input"]').setValue('Fresh Board')
    await wrapper.find('form#board-form').trigger('submit')
    await flushPromises()

    expect(listUserTagsSpy).toHaveBeenCalledTimes(2)
  })

  it('preserves active Task Feed filter and sort state during in-place TaskDialog editing', async () => {
    const { boards, feedTasks } = buildSampleData()
    feedTasks[0]!.priority = 'HIGH'
    feedTasks[0]!.title = 'Prepare release notes'
    feedTasks[1]!.priority = 'LOW'
    boards[0]!.columns[0]!.tasks[0]!.priority = 'HIGH'
    boards[1]!.columns[0]!.tasks[0]!.priority = 'LOW'

    vi.spyOn(kanbanApi, 'listBoards').mockResolvedValue(boards)
    vi.spyOn(kanbanApi, 'listTaskFeed').mockResolvedValue(feedTasks)
    vi.spyOn(kanbanApi, 'updateTask').mockResolvedValue(
      createTaskFixture({
        id: 101,
        title: 'Prepare release checklist',
        priority: 'HIGH',
        columnId: 10,
        position: 0,
        updatedAt: '2026-11-18T15:00:00Z',
      }),
    )

    const wrapper = await mountHomePage()
    const rail = wrapper.find('[data-testid="task-feed-rail"]')

    // Activate search + priority filter + TITLE sort
    await rail.find('[data-testid="feed-search-input"]').setValue('prepare')
    await rail.find('[data-testid="feed-filter-trigger"]').trigger('click')
    await rail.find('[data-testid="feed-priority-filter-HIGH"]').trigger('click')
    await rail.find('[data-testid="feed-sort-select"]').setValue('TITLE')
    await flushPromises()

    expect(rail.findAll('[data-testid="kanban-task"]')).toHaveLength(1)
    expect(rail.find('[data-testid="feed-filter-count-badge"]').text()).toContain('2')

    // Edit the visible task in-place and save
    await rail.find('[data-task-id="101"]').trigger('click')
    await flushPromises()
    const dialog = wrapper.find('[data-testid="task-dialog"]')
    await dialog.find('[data-testid="task-title-input"]').setValue('Prepare release checklist')
    await dialog.find('form').trigger('submit')
    await flushPromises()

    // Filter and sort state remain intact and updated title stays visible
    expect((rail.find('[data-testid="feed-search-input"]').element as HTMLInputElement).value).toBe('prepare')
    expect((rail.find('[data-testid="feed-sort-select"]').element as HTMLSelectElement).value).toBe('TITLE')
    expect(rail.find('[data-testid="feed-filter-count-badge"]').text()).toContain('2')
    expect(rail.find('[data-testid="feed-priority-filter-HIGH"]').attributes('aria-pressed')).toBe('true')
    const visibleTasks = rail.findAll('[data-testid="kanban-task"]')
    expect(visibleTasks).toHaveLength(1)
    expect(visibleTasks[0]!.text()).toContain('Prepare release checklist')
  })

  it('does not change Most Recent order when inspecting an older task with unchanged time entry total', async () => {
    const { boards, feedTasks } = buildSampleData()
    feedTasks[0]!.updatedAt = '2026-11-18T10:00:00Z'
    feedTasks[0]!.totalSeconds = 300
    boards[0]!.columns[0]!.tasks[0]!.updatedAt = '2026-11-18T10:00:00Z'
    boards[0]!.columns[0]!.tasks[0]!.totalSeconds = 300

    feedTasks[1]!.updatedAt = '2026-11-18T12:00:00Z'
    boards[1]!.columns[0]!.tasks[0]!.updatedAt = '2026-11-18T12:00:00Z'

    vi.spyOn(kanbanApi, 'listBoards').mockResolvedValue(boards)
    vi.spyOn(kanbanApi, 'listTaskFeed').mockResolvedValue(feedTasks)
    const listEntriesSpy = vi.spyOn(kanbanApi, 'listTimeEntries').mockResolvedValue([
      {
        id: 701,
        taskId: 101,
        startedAt: '2026-11-18T09:00:00Z',
        endedAt: '2026-11-18T09:05:00Z',
        durationSeconds: 300,
        note: 'Existing focus session',
      },
    ])

    const wrapper = await mountHomePage()
    const rail = wrapper.find('[data-testid="task-feed-rail"]')
    const visibleIds = () =>
      rail.findAll('[data-testid="kanban-task"]').map(el => el.attributes('data-task-id'))

    expect(visibleIds()).toEqual(['102', '101'])

    await rail.find('[data-task-id="101"]').trigger('click')
    await flushPromises()

    expect(listEntriesSpy).toHaveBeenCalledWith(101)
    expect(wrapper.find('[data-testid="task-dialog"]').exists()).toBe(true)
    expect(visibleIds()).toEqual(['102', '101'])

    await wrapper.find('[data-testid="task-cancel-button"]').trigger('click')
    await flushPromises()
    expect(visibleIds()).toEqual(['102', '101'])
  })
})

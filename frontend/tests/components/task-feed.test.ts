import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { kanbanContextKey, type TagDto, type TaskFeedItemDto } from '~/api/kanban'
import TaskFeed from '~/components/kanban/TaskFeed.vue'
import {
  createKanbanContextMock,
  createTagFixture,
  createTaskFeedItemFixture,
  PopoverStub,
  SelectStub,
} from '../fixtures'

function mountTaskFeed(
  props: {
    tasks?: TaskFeedItemDto[]
    userTags?: TagDto[]
    loading?: boolean
    error?: unknown
    emptyText?: string
  } = {},
  slots: Record<string, any> = {},
) {
  const kanbanContext = createKanbanContextMock()

  const wrapper = mount(TaskFeed, {
    props: {
      tasks: props.tasks ?? [],
      userTags: props.userTags,
      loading: props.loading,
      error: props.error,
      emptyText: props.emptyText,
    },
    slots,
    global: {
      plugins: [PrimeVue],
      provide: {
        [kanbanContextKey as symbol]: kanbanContext,
      },
      stubs: {
        Popover: PopoverStub,
        Select: SelectStub,
      },
    },
  })

  return { wrapper, kanbanContext }
}

describe('TaskFeed Component DOM Suite', () => {
  it('renders loading skeletons when loading is true and tasks array is empty', () => {
    const { wrapper } = mountTaskFeed({
      tasks: [],
      loading: true,
    })

    expect(wrapper.find('[data-testid="task-feed-loading"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="kanban-column"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="task-feed-error"]').exists()).toBe(false)
  })

  it('renders error panel and emits retry when Try again is clicked', async () => {
    const { wrapper } = mountTaskFeed({
      tasks: [],
      loading: false,
      error: new Error('Network error'),
    })

    const errorRegion = wrapper.find('[data-testid="task-feed-error"]')
    expect(errorRegion.exists()).toBe(true)
    expect(wrapper.find('[data-testid="kanban-column"]').exists()).toBe(false)

    const retryButton = errorRegion.find('button')
    expect(retryButton.exists()).toBe(true)
    expect(retryButton.text()).toContain('Try again')

    await retryButton.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('renders default empty text inside non-draggable Task Feed column when tasks are empty', () => {
    const { wrapper } = mountTaskFeed({
      tasks: [],
    })

    const column = wrapper.find('[data-testid="kanban-column"]')
    expect(column.exists()).toBe(true)
    expect(column.text()).toContain('Task Feed')
    expect(wrapper.find('[data-testid="column-task-count"]').text()).toContain('0')
    expect(wrapper.find('[data-testid="edit-column-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="add-task-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="column-empty-placeholder"]').text()).toBe(
      'No active tasks across your boards yet',
    )
  })

  it('renders non-draggable tasks with board and column context breadcrumb and delegates clicks to kanbanContext', async () => {
    const feedTask = createTaskFeedItemFixture({
      id: 42,
      title: 'Audit database indexes',
      boardId: 7,
      boardTitle: 'Platform Core',
      columnId: 12,
      columnTitle: 'In Progress',
    })
    const { wrapper, kanbanContext } = mountTaskFeed({
      tasks: [feedTask],
    })

    expect(wrapper.find('[data-testid="column-task-count"]').text()).toContain('1')

    const taskEl = wrapper.find('[data-testid="kanban-task"]')
    expect(taskEl.exists()).toBe(true)
    expect(taskEl.classes()).toContain('cursor-pointer')
    expect(taskEl.classes()).not.toContain('cursor-grab')

    const contextBreadcrumb = wrapper.find('[data-testid="feed-task-context"]')
    expect(contextBreadcrumb.exists()).toBe(true)
    expect(contextBreadcrumb.text()).toContain('Platform Core')
    expect(contextBreadcrumb.text()).toContain('In Progress')

    await taskEl.trigger('click')
    expect(kanbanContext.openEditTaskDialog).toHaveBeenCalledTimes(1)
    expect(kanbanContext.openEditTaskDialog).toHaveBeenCalledWith(feedTask)
  })

  it('forwards optional #header-actions, #subheader slots, and custom emptyText prop', () => {
    const { wrapper } = mountTaskFeed(
      {
        tasks: [],
        emptyText: 'No tasks match your filters',
      },
      {
        'header-actions': '<button data-testid="feed-filter-trigger">Filter</button>',
        subheader: '<div data-testid="feed-search-bar">Search tasks</div>',
      },
    )

    expect(wrapper.find('[data-testid="feed-filter-trigger"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="feed-search-bar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="column-empty-placeholder"]').text()).toBe(
      'No tasks match your filters',
    )
  })

  it('filters tasks by title search, shows clear button and filtered empty message, and clears via click or keyboard', async () => {
    const tasks = [
      createTaskFeedItemFixture({
        id: 's1',
        title: 'Audit Redis connection pool',
        updatedAt: '2026-11-18T12:00:00Z',
      }),
      createTaskFeedItemFixture({
        id: 's2',
        title: 'Polish Kanban header',
        updatedAt: '2026-11-18T11:00:00Z',
      }),
    ]
    const { wrapper } = mountTaskFeed({ tasks })

    const filterTrigger = wrapper.find('[data-testid="feed-filter-trigger"]')
    expect(filterTrigger.exists()).toBe(true)
    expect(filterTrigger.find('span.hidden.xl\\:inline').text()).toBe('Filter')
    expect(wrapper.find('[data-testid="feed-filter-count-badge"]').exists()).toBe(false)

    const searchInput = wrapper.find('[data-testid="feed-search-input"]')
    expect(searchInput.exists()).toBe(true)
    expect(wrapper.find('[data-testid="feed-search-clear-btn"]').exists()).toBe(false)

    await searchInput.setValue('  REDIS ')
    expect(wrapper.findAll('[data-testid="kanban-task"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="kanban-task"]').text()).toContain('Audit Redis connection pool')
    expect(wrapper.find('[data-testid="column-task-count"]').text()).toContain('1')
    expect(wrapper.find('[data-testid="feed-filter-count-badge"]').text()).toContain('1')
    expect(wrapper.find('[data-testid="feed-active-filters"]').exists()).toBe(true)

    const clearBtn = wrapper.find('[data-testid="feed-search-clear-btn"]')
    expect(clearBtn.exists()).toBe(true)
    await clearBtn.trigger('click')

    expect((searchInput.element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('[data-testid="kanban-task"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="feed-filter-count-badge"]').exists()).toBe(false)

    await searchInput.setValue('nonexistent query')
    expect(wrapper.findAll('[data-testid="kanban-task"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="column-empty-placeholder"]').text()).toBe(
      'No tasks match your current filters',
    )

    await wrapper.find('[data-testid="feed-search-clear-btn"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.findAll('[data-testid="kanban-task"]')).toHaveLength(2)
  })

  it('opens filter popover, filters priorities with OR, filters tags via Listbox with OR and case-insensitive cross-board matching, and combines categories with AND', async () => {
    const tasks = [
      createTaskFeedItemFixture({
        id: 'p1',
        title: 'Audit Redis pool',
        boardId: 1,
        priority: 'HIGH',
        updatedAt: '2026-11-18T12:00:00Z',
        tags: [createTagFixture({ id: 1, name: 'Backend' })],
      }),
      createTaskFeedItemFixture({
        id: 'p2',
        title: 'Audit API tokens',
        boardId: 2,
        priority: 'MEDIUM',
        updatedAt: '2026-11-18T11:00:00Z',
        tags: [createTagFixture({ id: 2, name: 'backend' })],
      }),
      createTaskFeedItemFixture({
        id: 'p3',
        title: 'Draft onboarding notes',
        boardId: 3,
        priority: null,
        updatedAt: '2026-11-18T10:00:00Z',
        tags: [],
      }),
      createTaskFeedItemFixture({
        id: 'p4',
        title: 'Clean legacy CSS',
        boardId: 1,
        priority: 'LOW',
        updatedAt: '2026-11-18T09:00:00Z',
        tags: [createTagFixture({ id: 3, name: 'Alpha' })],
      }),
    ]
    const userTags = [
      createTagFixture({ id: 10, name: 'Backend' }),
      createTagFixture({ id: 11, name: 'ZeroUsed' }),
    ]

    const { wrapper } = mountTaskFeed({ tasks, userTags })

    expect(wrapper.find('[data-testid="feed-filter-popover"]').exists()).toBe(false)
    await wrapper.find('[data-testid="feed-filter-trigger"]').trigger('click')

    const popover = wrapper.find('[data-testid="feed-filter-popover"]')
    expect(popover.exists()).toBe(true)

    const highBtn = popover.find('[data-testid="feed-priority-filter-HIGH"]')
    const noneBtn = popover.find('[data-testid="feed-priority-filter-NONE"]')
    expect(highBtn.attributes('aria-pressed')).toBe('false')
    expect(noneBtn.attributes('aria-pressed')).toBe('false')

    await highBtn.trigger('click')
    expect(highBtn.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('[data-testid="kanban-task"]').map(el => el.attributes('data-task-id'))).toEqual(['p1'])
    expect(wrapper.find('[data-testid="feed-filter-count-badge"]').text()).toContain('1')

    await noneBtn.trigger('click')
    expect(noneBtn.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('[data-testid="kanban-task"]').map(el => el.attributes('data-task-id'))).toEqual(['p1', 'p3'])
    expect(wrapper.find('[data-testid="feed-filter-count-badge"]').text()).toContain('2')

    const tagListbox = popover.find('[data-testid="feed-tag-listbox"]')
    expect(tagListbox.exists()).toBe(true)
    const optionEls = tagListbox.findAll('[role="option"]')
    expect(optionEls.map(o => o.text())).toEqual([
      expect.stringContaining('Alpha'),
      expect.stringContaining('Backend'),
      expect.stringContaining('ZeroUsed'),
      expect.stringContaining('Untagged'),
    ])
    expect(optionEls[0]!.text()).toContain('1')
    expect(optionEls[1]!.text()).toContain('2')
    expect(optionEls[2]!.text()).toContain('0')
    expect(optionEls[3]!.text()).toContain('1')

    // Clear priority selections and test Tag OR across Backend (cross-board case-insensitive) + Untagged
    await highBtn.trigger('click')
    await noneBtn.trigger('click')

    await optionEls[1]!.trigger('click')
    expect(wrapper.findAll('[data-testid="kanban-task"]').map(el => el.attributes('data-task-id'))).toEqual(['p1', 'p2'])

    await optionEls[3]!.trigger('click')
    expect(wrapper.findAll('[data-testid="kanban-task"]').map(el => el.attributes('data-task-id'))).toEqual(['p1', 'p2', 'p3'])
    expect(wrapper.find('[data-testid="feed-filter-count-badge"]').text()).toContain('2')

    // Combine Search + Priority + Tag with AND
    await highBtn.trigger('click')
    await wrapper.find('[data-testid="feed-search-input"]').setValue('audit')
    expect(wrapper.find('[data-testid="feed-filter-count-badge"]').text()).toContain('4')
    expect(wrapper.findAll('[data-testid="kanban-task"]').map(el => el.attributes('data-task-id'))).toEqual(['p1'])
  })

  it('renders removable active filter Chips, supports Clear all and Popover Reset, and disables Reset when no filters are active', async () => {
    const tasks = [
      createTaskFeedItemFixture({
        id: 'c1',
        title: 'Build feature',
        priority: 'HIGH',
        tags: [createTagFixture({ id: 1, name: 'Frontend' })],
      }),
      createTaskFeedItemFixture({
        id: 'c2',
        title: 'Write docs',
        priority: null,
        tags: [],
      }),
    ]
    const { wrapper } = mountTaskFeed({ tasks })

    await wrapper.find('[data-testid="feed-filter-trigger"]').trigger('click')
    const resetBtn = wrapper.find('[data-testid="feed-popover-reset-btn"]')
    expect(resetBtn.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="feed-active-filters"]').exists()).toBe(false)

    // Select Priority HIGH, Priority NONE, Tag Frontend, and Untagged
    await wrapper.find('[data-testid="feed-priority-filter-HIGH"]').trigger('click')
    await wrapper.find('[data-testid="feed-priority-filter-NONE"]').trigger('click')
    const tagOptions = wrapper.find('[data-testid="feed-tag-listbox"]').findAll('[role="option"]')
    await tagOptions[0]!.trigger('click')
    await tagOptions[1]!.trigger('click')

    expect(resetBtn.attributes('disabled')).toBeUndefined()

    const activeFiltersBar = wrapper.find('[data-testid="feed-active-filters"]')
    expect(activeFiltersBar.exists()).toBe(true)
    const chips = activeFiltersBar.findAll('.p-chip')
    expect(chips.map(c => c.text())).toEqual([
      'Priority: High',
      'Priority: No priority',
      'Tag: Frontend',
      'Tag: Untagged',
    ])

    // Remove Priority: High chip individually
    await chips[0]!.find('.p-chip-remove-icon').trigger('click')
    expect(wrapper.find('[data-testid="feed-active-filters"]').findAll('.p-chip').map(c => c.text())).toEqual([
      'Priority: No priority',
      'Tag: Frontend',
      'Tag: Untagged',
    ])
    expect(wrapper.find('[data-testid="feed-priority-filter-HIGH"]').attributes('aria-pressed')).toBe('false')

    // Remove Tag: Untagged chip individually
    const updatedChips = wrapper.find('[data-testid="feed-active-filters"]').findAll('.p-chip')
    await updatedChips[2]!.find('.p-chip-remove-icon').trigger('click')
    expect(wrapper.find('[data-testid="feed-active-filters"]').findAll('.p-chip').map(c => c.text())).toEqual([
      'Priority: No priority',
      'Tag: Frontend',
    ])

    // Clear all via inline Clear all button
    await wrapper.find('[data-testid="feed-reset-filters-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="feed-active-filters"]').exists()).toBe(false)
    expect(resetBtn.attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('[data-testid="kanban-task"]')).toHaveLength(2)

    // Re-apply search + priority and reset via Popover Reset button
    await wrapper.find('[data-testid="feed-search-input"]').setValue('docs')
    await wrapper.find('[data-testid="feed-priority-filter-NONE"]').trigger('click')
    expect(wrapper.findAll('[data-testid="kanban-task"]')).toHaveLength(1)
    expect(resetBtn.attributes('disabled')).toBeUndefined()

    await resetBtn.trigger('click')
    expect(wrapper.find('[data-testid="feed-active-filters"]').exists()).toBe(false)
    expect((wrapper.find('[data-testid="feed-search-input"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('[data-testid="kanban-task"]')).toHaveLength(2)
  })

  it('renders compact Sort Select options, auto-resets natural direction on sort switch, toggles direction, and keeps nulls last', async () => {
    const tasks = [
      createTaskFeedItemFixture({
        id: 's-none',
        title: 'Zeta unscheduled',
        priority: null,
        dueAt: null,
        updatedAt: '2026-11-18T14:00:00Z',
      }),
      createTaskFeedItemFixture({
        id: 's-low-late',
        title: 'Alpha late',
        priority: 'LOW',
        dueAt: '2026-11-25T10:00:00Z',
        updatedAt: '2026-11-18T13:00:00Z',
      }),
      createTaskFeedItemFixture({
        id: 's-high-soon',
        title: 'beta soon',
        priority: 'HIGH',
        dueAt: '2026-11-19T10:00:00Z',
        updatedAt: '2026-11-18T12:00:00Z',
      }),
    ]
    const { wrapper } = mountTaskFeed({ tasks })

    const sortSelect = wrapper.find('[data-testid="feed-sort-select"]')
    const dirBtn = wrapper.find('[data-testid="feed-sort-direction-btn"]')
    expect(sortSelect.exists()).toBe(true)
    expect(dirBtn.exists()).toBe(true)

    expect(sortSelect.findAll('option').map(o => o.text())).toEqual([
      'Recent',
      'Due',
      'Priority',
      'Title',
    ])
    expect((sortSelect.element as HTMLSelectElement).value).toBe('RECENT')
    expect(dirBtn.attributes('aria-label')).toContain('Descending')
    expect(wrapper.findAll('[data-testid="kanban-task"]').map(el => el.attributes('data-task-id'))).toEqual([
      's-none',
      's-low-late',
      's-high-soon',
    ])

    // Switch to DUE_DATE -> natural default asc, NULLS LAST
    await sortSelect.setValue('DUE_DATE')
    await nextTick()
    expect(dirBtn.attributes('aria-label')).toContain('Ascending')
    expect(wrapper.findAll('[data-testid="kanban-task"]').map(el => el.attributes('data-task-id'))).toEqual([
      's-high-soon',
      's-low-late',
      's-none',
    ])

    // Toggle direction to desc -> NULLS STILL LAST
    await dirBtn.trigger('click')
    expect(dirBtn.attributes('aria-label')).toContain('Descending')
    expect(wrapper.findAll('[data-testid="kanban-task"]').map(el => el.attributes('data-task-id'))).toEqual([
      's-low-late',
      's-high-soon',
      's-none',
    ])

    // Switch to PRIORITY while currently in desc (Wait: flip asc first or test TITLE->PRIORITY)
    await sortSelect.setValue('TITLE')
    await nextTick()
    expect(dirBtn.attributes('aria-label')).toContain('Ascending')
    expect(wrapper.findAll('[data-testid="kanban-task"]').map(el => el.attributes('data-task-id'))).toEqual([
      's-low-late',
      's-high-soon',
      's-none',
    ])

    await sortSelect.setValue('PRIORITY')
    await nextTick()
    expect(dirBtn.attributes('aria-label')).toContain('Descending')
    expect(wrapper.findAll('[data-testid="kanban-task"]').map(el => el.attributes('data-task-id'))).toEqual([
      's-high-soon',
      's-low-late',
      's-none',
    ])

    await dirBtn.trigger('click')
    expect(dirBtn.attributes('aria-label')).toContain('Ascending')
    expect(wrapper.findAll('[data-testid="kanban-task"]').map(el => el.attributes('data-task-id'))).toEqual([
      's-low-late',
      's-high-soon',
      's-none',
    ])
  })
})

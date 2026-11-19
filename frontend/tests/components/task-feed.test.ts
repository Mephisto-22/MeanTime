import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { kanbanContextKey, type TaskFeedItemDto } from '~/api/kanban'
import TaskFeed from '~/components/kanban/TaskFeed.vue'
import { createTaskFeedItemFixture } from '../fixtures/kanban'

function mountTaskFeed(
  props: {
    tasks?: TaskFeedItemDto[]
    loading?: boolean
    error?: unknown
    emptyText?: string
  } = {},
  slots: Record<string, any> = {},
) {
  const kanbanContext = {
    columns: computed(() => []),
    availableTags: computed(() => []),
    openCreateTaskDialog: vi.fn(),
    openEditTaskDialog: vi.fn(),
    moveTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    startTimer: vi.fn(),
    pauseTimer: vi.fn(),
    stopTimer: vi.fn(),
  }

  const wrapper = mount(TaskFeed, {
    props: {
      tasks: props.tasks ?? [],
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
})

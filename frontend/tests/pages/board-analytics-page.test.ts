import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { analyticsApi, type BoardAnalyticsDto } from '~/api/analytics'
import { kanbanApi, type KanbanBoardDto } from '~/api/kanban'
import BoardAnalyticsFilters from '~/components/analytics/BoardAnalyticsFilters.vue'
import BoardPage from '~/pages/boards/[id]/index.vue'
import BoardAnalyticsPage from '~/pages/boards/[id]/analytics.vue'
import { useAuthStore } from '~/stores/auth'

// Signed in, so the auth middleware lets the test navigate to the board routes
// instead of redirecting to /login (which would leave route.params empty).
beforeEach(() => {
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
})

// Chart.js needs a canvas, which happy-dom doesn't support.
const ChartStub = defineComponent({
  name: 'Chart',
  props: ['type', 'data', 'options', 'canvasProps'],
  setup: () => () => h('div'),
})

// Each test uses its own board id so useAsyncData never serves a cached result.
let nextBoardId = 500

function analyticsFixture(overrides: Partial<BoardAnalyticsDto> = {}): BoardAnalyticsDto {
  return {
    boardId: 1,
    title: 'Sprint Board',
    isShared: true,
    totalSeconds: 5400,
    columns: [
      { columnId: 10, title: 'To Do', totalSeconds: 1800 },
      { columnId: 11, title: 'Done', totalSeconds: 3600 },
    ],
    topTasks: [
      { taskId: 100, title: 'Ship it', columnId: 11, columnTitle: 'Done', totalSeconds: 3600 },
      { taskId: 101, title: 'Write tests', columnId: 10, columnTitle: 'To Do', totalSeconds: 1800 },
    ],
    averages: {
      taskCount: 2,
      sessionCount: 3,
      averageTaskSeconds: 2700,
      averageSessionSeconds: 1800,
      averageSessionsPerTask: 1.5,
    },
    collaborators: [
      { userId: 2, displayName: 'Alice', totalSeconds: 3600 },
      { userId: 1, displayName: 'Owner', totalSeconds: 1800 },
    ],
    breakdown: {
      tags: [
        { name: 'bug', totalSeconds: 3600 },
        { name: 'docs', totalSeconds: 3600 },
        { name: null, totalSeconds: 1800 },
      ],
      priorities: [{ name: 'MEDIUM', totalSeconds: 3600 }, { name: null, totalSeconds: 1800 }],
    },
    tags: ['bug', 'docs'],
    ...overrides,
  }
}

// Pages from earlier tests are unmounted, so they don't fetch again when the
// next test changes the route.
const mountedPages: Array<{ unmount: () => void }> = []

async function mountAnalyticsPage() {
  const boardId = nextBoardId++
  const wrapper = await mountSuspended(BoardAnalyticsPage, {
    route: `/boards/${boardId}/analytics`,
    global: { stubs: { Chart: ChartStub } },
  })
  mountedPages.push(wrapper)
  await flushPromises()
  return { wrapper, boardId }
}

describe('Board analytics page (/boards/[id]/analytics)', () => {
  afterEach(() => {
    mountedPages.splice(0).forEach(page => page.unmount())
    vi.restoreAllMocks()
  })

  it('shows the total, time per column and the top tasks', async () => {
    const spy = vi.spyOn(analyticsApi, 'getBoardAnalytics').mockResolvedValue(analyticsFixture())

    const { wrapper, boardId } = await mountAnalyticsPage()

    expect(spy).toHaveBeenCalledWith(String(boardId), { timerMode: 'ALL', tags: [] })
    expect(wrapper.find('[data-testid="analytics-title"]').text()).toBe('Board Stats')
    expect(wrapper.find('[data-testid="analytics-total-value"]').text()).toBe('1h 30m')

    const columns = wrapper.findAll('[data-testid="analytics-column-row"]')
    expect(columns).toHaveLength(2)
    expect(columns[0]!.text()).toContain('To Do')
    expect(columns[0]!.text()).toContain('30m')
    expect(columns[0]!.text()).not.toContain('%')

    const shares = wrapper.findAll('[data-testid="column-share-legend-item"]')
    expect(shares.map(share => share.text())).toEqual([
      expect.stringContaining('33%'),
      expect.stringContaining('67%'),
    ])

    const tasks = wrapper.findAll('[data-testid="analytics-top-task"]')
    expect(tasks.map(task => task.text())).toEqual([
      expect.stringContaining('Ship it'),
      expect.stringContaining('Write tests'),
    ])
    expect(tasks[0]!.text()).toContain('Done')
    expect(tasks[0]!.text()).toContain('1h')

    const averages = wrapper.findAll('[data-testid="analytics-average"]')
    expect(averages.map(average => average.text())).toEqual([
      'Time per task45m',
      'Session length30m',
      'Sessions per task1.5',
    ])

    const people = wrapper.findAll('[data-testid="collaborator-time-row"]')
    expect(people.map(person => person.text())).toEqual([
      expect.stringContaining('Alice'),
      expect.stringContaining('Owner'),
    ])
  })

  it('shows time per tag and per priority (#191)', async () => {
    vi.spyOn(analyticsApi, 'getBoardAnalytics').mockResolvedValue(analyticsFixture())

    const { wrapper } = await mountAnalyticsPage()

    const tagChart = wrapper.find('[data-testid="breakdown-tags"]').findComponent(ChartStub)
    expect(tagChart.props('data').labels).toEqual(['bug', 'docs', 'None'])
    const priorityChart = wrapper.find('[data-testid="breakdown-priorities"]').findComponent(ChartStub)
    expect(priorityChart.props('data').labels).toEqual(['Medium', 'None'])
  })

  it('fetches again for countdown or stopwatch tasks when the toggle changes', async () => {
    const spy = vi.spyOn(analyticsApi, 'getBoardAnalytics').mockResolvedValue(analyticsFixture())
    const { wrapper, boardId } = await mountAnalyticsPage()

    const buttons = wrapper.findAll('[data-testid="analytics-timer-mode"] button')
    expect(buttons.map(button => button.text())).toEqual(['All', 'Countdown', 'Stopwatch'])
    await buttons[1]!.trigger('click')
    await flushPromises()
    expect(spy).toHaveBeenLastCalledWith(String(boardId), { timerMode: 'COUNT_DOWN', tags: [] })

    await buttons[2]!.trigger('click')
    await flushPromises()
    expect(spy).toHaveBeenLastCalledWith(String(boardId), { timerMode: 'COUNT_UP', tags: [] })
  })

  it('offers the board\'s tags and fetches again when some are chosen', async () => {
    const spy = vi.spyOn(analyticsApi, 'getBoardAnalytics').mockResolvedValue(analyticsFixture())
    const { wrapper, boardId } = await mountAnalyticsPage()

    const filters = wrapper.findComponent(BoardAnalyticsFilters)
    expect(filters.props('availableTags')).toEqual(['bug', 'docs'])
    expect(wrapper.find('[data-testid="analytics-tag-filter"]').exists()).toBe(true)

    filters.vm.$emit('update:tags', ['bug', 'docs'])
    await flushPromises()

    expect(spy).toHaveBeenLastCalledWith(String(boardId), { timerMode: 'ALL', tags: ['bug', 'docs'] })
  })

  it('has no tag filter on a board without tags', async () => {
    vi.spyOn(analyticsApi, 'getBoardAnalytics').mockResolvedValue(analyticsFixture({ tags: [] }))

    const { wrapper } = await mountAnalyticsPage()

    expect(wrapper.find('[data-testid="analytics-timer-mode"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="analytics-tag-filter"]').exists()).toBe(false)
  })

  it('keeps the filters on screen when nothing matches them', async () => {
    const spy = vi.spyOn(analyticsApi, 'getBoardAnalytics').mockResolvedValue(analyticsFixture())
    const { wrapper } = await mountAnalyticsPage()

    spy.mockResolvedValue(analyticsFixture({
      totalSeconds: 0,
      columns: [{ columnId: 10, title: 'To Do', totalSeconds: 0 }],
      topTasks: [],
    }))
    await wrapper.findAll('[data-testid="analytics-timer-mode"] button')[1]!.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="analytics-filtered-empty"]').text()).toContain('No tracked time matches these filters')
    expect(wrapper.find('[data-testid="analytics-filters"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="analytics-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="analytics-total-tile"]').exists()).toBe(false)
  })

  it('shows the top five tasks at first, with buttons to show more', async () => {
    const topTasks = Array.from({ length: 8 }, (_, i) => ({
      taskId: 200 + i,
      title: `Task ${i}`,
      columnId: 10,
      columnTitle: 'To Do',
      totalSeconds: 3600 - i * 60,
    }))
    vi.spyOn(analyticsApi, 'getBoardAnalytics').mockResolvedValue(analyticsFixture({ topTasks }))

    const { wrapper } = await mountAnalyticsPage()
    const card = wrapper.find('[data-testid="analytics-top-tasks"]')

    expect(card.findAll('[data-testid="analytics-top-task"]')).toHaveLength(5)
    expect(card.find('[data-testid="row-limit-count"]').text()).toBe('Showing 5 of 8 tasks')

    await card.findAll('[data-testid="row-limit-select"] button')[1]!.trigger('click')

    expect(card.findAll('[data-testid="analytics-top-task"]')).toHaveLength(8)
    expect(card.find('[data-testid="row-limit-count"]').text()).toBe('Showing 8 of 8 tasks')
  })

  it('has no show-more buttons with five top tasks or fewer', async () => {
    vi.spyOn(analyticsApi, 'getBoardAnalytics').mockResolvedValue(analyticsFixture())

    const { wrapper } = await mountAnalyticsPage()

    expect(wrapper.find('[data-testid="analytics-top-tasks"] [data-testid="row-limit-select"]').exists()).toBe(false)
  })

  it('links back to the board', async () => {
    vi.spyOn(analyticsApi, 'getBoardAnalytics').mockResolvedValue(analyticsFixture())

    const { wrapper, boardId } = await mountAnalyticsPage()

    expect(wrapper.find('[data-testid="analytics-back-link"]').attributes('href')).toBe(`/boards/${boardId}`)
  })

  it('shows an empty state when the board has no tracked time', async () => {
    vi.spyOn(analyticsApi, 'getBoardAnalytics').mockResolvedValue(analyticsFixture({
      totalSeconds: 0,
      columns: [{ columnId: 10, title: 'To Do', totalSeconds: 0 }],
      topTasks: [],
    }))

    const { wrapper } = await mountAnalyticsPage()

    expect(wrapper.find('[data-testid="analytics-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="analytics-total-tile"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="analytics-filters"]').exists()).toBe(false)
  })

  it('shows not found for a board the user cannot open', async () => {
    vi.spyOn(analyticsApi, 'getBoardAnalytics').mockRejectedValue(
      Object.assign(new Error('Not Found'), { statusCode: 404 }),
    )

    const { wrapper } = await mountAnalyticsPage()

    expect(wrapper.find('[data-testid="analytics-not-found"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="analytics-error"]').exists()).toBe(false)
  })

  it('shows an error with a retry button when loading fails', async () => {
    const spy = vi.spyOn(analyticsApi, 'getBoardAnalytics')
      .mockRejectedValue(Object.assign(new Error('Server error'), { statusCode: 500 }))

    const { wrapper } = await mountAnalyticsPage()
    const errorCard = wrapper.find('[data-testid="analytics-error"]')
    expect(errorCard.exists()).toBe(true)
    expect(wrapper.find('[data-testid="analytics-not-found"]').exists()).toBe(false)

    spy.mockResolvedValue(analyticsFixture())
    await errorCard.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="analytics-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="analytics-total-value"]').text()).toBe('1h 30m')
  })
})

describe('Board page analytics link', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('links from the board header to its analytics page with a Stats button', async () => {
    const board: KanbanBoardDto = { id: 77, title: 'Linked', description: '', columns: [] }
    vi.spyOn(kanbanApi, 'getBoard').mockResolvedValue(board)

    const wrapper = await mountSuspended(BoardPage, { route: '/boards/77' })
    await flushPromises()

    const link = wrapper.find('[data-testid="board-analytics-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/boards/77/analytics')
    // "Analytics" is the personal page in the navigation bar.
    expect(link.text()).toBe('Stats')
  })
})

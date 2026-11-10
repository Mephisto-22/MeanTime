import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyticsApi, type BoardAnalyticsDto } from '~/api/analytics'
import { kanbanApi, type KanbanBoardDto } from '~/api/kanban'
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

// Each test uses its own board id so useAsyncData never serves a cached result.
let nextBoardId = 500

function analyticsFixture(overrides: Partial<BoardAnalyticsDto> = {}): BoardAnalyticsDto {
  return {
    boardId: 1,
    title: 'Sprint Board',
    totalSeconds: 5400,
    columns: [
      { columnId: 10, title: 'To Do', totalSeconds: 1800 },
      { columnId: 11, title: 'Done', totalSeconds: 3600 },
    ],
    topTasks: [
      { taskId: 100, title: 'Ship it', columnId: 11, columnTitle: 'Done', totalSeconds: 3600 },
      { taskId: 101, title: 'Write tests', columnId: 10, columnTitle: 'To Do', totalSeconds: 1800 },
    ],
    ...overrides,
  }
}

async function mountAnalyticsPage() {
  const boardId = nextBoardId++
  const wrapper = await mountSuspended(BoardAnalyticsPage, { route: `/boards/${boardId}/analytics` })
  await flushPromises()
  return { wrapper, boardId }
}

describe('Board analytics page (/boards/[id]/analytics)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the total, time per column and the top tasks', async () => {
    const spy = vi.spyOn(analyticsApi, 'getBoardAnalytics').mockResolvedValue(analyticsFixture())

    const { wrapper, boardId } = await mountAnalyticsPage()

    expect(spy).toHaveBeenCalledWith(String(boardId))
    expect(wrapper.find('[data-testid="analytics-title"]').text()).toBe('Sprint Board analytics')
    expect(wrapper.find('[data-testid="analytics-total-value"]').text()).toBe('1h 30m')

    const columns = wrapper.findAll('[data-testid="analytics-column-row"]')
    expect(columns).toHaveLength(2)
    expect(columns[0]!.text()).toContain('To Do')
    expect(columns[0]!.text()).toContain('30m')
    expect(columns[0]!.text()).toContain('33%')
    expect(columns[1]!.text()).toContain('67%')

    const tasks = wrapper.findAll('[data-testid="analytics-top-task"]')
    expect(tasks.map(task => task.text())).toEqual([
      expect.stringContaining('Ship it'),
      expect.stringContaining('Write tests'),
    ])
    expect(tasks[0]!.text()).toContain('Done')
    expect(tasks[0]!.text()).toContain('1h')
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

  it('links from the board header to its analytics page', async () => {
    const board: KanbanBoardDto = { id: 77, title: 'Linked', description: '', columns: [] }
    vi.spyOn(kanbanApi, 'getBoard').mockResolvedValue(board)

    const wrapper = await mountSuspended(BoardPage, { route: '/boards/77' })
    await flushPromises()

    const link = wrapper.find('[data-testid="board-analytics-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/boards/77/analytics')
  })
})

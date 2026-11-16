import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyticsApi } from '~/api/analytics'

const mockFetch = vi.fn()

// Mocking $fetch (not apiService) runs the real case conversion.
vi.mock('#build/fetch.mjs', () => ({
  $fetch: (...args: any[]) => mockFetch(...args),
}))

describe('AnalyticsApi.getDailyTime (#173)', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('requests the range and converts the response to camelCase', async () => {
    mockFetch.mockResolvedValue({
      start: '2026-11-09',
      end: '2026-11-09',
      timezone: 'UTC',
      total_seconds: 600,
      days: [{
        day: '2026-11-09',
        total_seconds: 600,
        entries: [{
          id: 1,
          task_id: 10,
          task_title: 'Write tests',
          board_id: 7,
          board_title: 'Sprint Board',
          started_at: '2026-11-09T09:00:00Z',
          ended_at: '2026-11-09T09:10:00Z',
          duration_seconds: 600,
          note: '',
        }],
      }],
    })

    const result = await analyticsApi.getDailyTime({ start: '2026-11-09', end: '2026-11-09' })

    expect(mockFetch).toHaveBeenCalledWith('/api/analytics/me/daily', expect.objectContaining({
      method: 'GET',
      query: { start: '2026-11-09', end: '2026-11-09' },
    }))
    expect(result.totalSeconds).toBe(600)
    expect(result.days[0]!.totalSeconds).toBe(600)
    expect(result.days[0]!.entries[0]).toMatchObject({
      taskTitle: 'Write tests',
      boardTitle: 'Sprint Board',
      startedAt: '2026-11-09T09:00:00Z',
      durationSeconds: 600,
    })
  })
})

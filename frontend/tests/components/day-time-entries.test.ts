import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { DayEntryDto, DayTimeDto } from '~/api/analytics'
import DayTimeEntries from '~/components/analytics/DayTimeEntries.vue'

function entry(overrides: Partial<DayEntryDto> = {}): DayEntryDto {
  return {
    id: 1,
    taskId: 100,
    taskTitle: 'Write tests',
    boardId: 7,
    boardTitle: 'Sprint Board',
    startedAt: '2026-11-10T03:00:00Z',
    endedAt: '2026-11-10T04:30:00Z',
    durationSeconds: 5400,
    note: '',
    ...overrides,
  }
}

function dayWith(entries: DayEntryDto[]): DayTimeDto {
  return {
    day: '2026-11-09',
    totalSeconds: entries.reduce((sum, item) => sum + item.durationSeconds, 0),
    entries,
  }
}

describe('Day time entries (#173)', () => {
  it('lists each entry with its time, task, board and duration', async () => {
    const wrapper = await mountSuspended(DayTimeEntries, {
      props: { day: dayWith([entry()]), timezone: 'America/Chicago' },
    })

    const rows = wrapper.findAll('[data-testid="day-entry"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Write tests')
    expect(rows[0]!.find('[data-testid="day-entry-duration"]').text()).toBe('1h 30m')
    // 03:00–04:30 UTC is 9:00–10:30 PM the evening before in Chicago.
    expect(rows[0]!.find('[data-testid="day-entry-time"]').text()).toBe('9:00 PM – 10:30 PM')

    const board = rows[0]!.find('[data-testid="day-entry-board"]')
    expect(board.text()).toBe('Sprint Board')
    expect(board.attributes('href')).toBe('/boards/7')
  })

  it('shows only the start time of an entry with no end', async () => {
    const wrapper = await mountSuspended(DayTimeEntries, {
      props: { day: dayWith([entry({ endedAt: null })]), timezone: 'UTC' },
    })

    expect(wrapper.find('[data-testid="day-entry-time"]').text()).toBe('3:00 AM')
  })

  it('says when a day has no tracked time', async () => {
    const wrapper = await mountSuspended(DayTimeEntries, {
      props: { day: dayWith([]), timezone: 'UTC' },
    })

    expect(wrapper.find('[data-testid="day-entries"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="day-entries-empty"]').text())
      .toBe('No time tracked on Mon, Nov 9.')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, countDays, formatDay, fromDay, toDay, todayIn } from '~/utils/days'

describe('day helpers (#173)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats a day without shifting it into the previous day', () => {
    expect(formatDay('2026-11-09')).toBe('Mon, Nov 9')
    expect(formatDay('2026-11-09', { month: 'short', day: 'numeric' })).toBe('Nov 9')
  })

  it('adds and subtracts days across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-11-09', -6)).toBe('2026-11-03')
  })

  it('counts the days in an inclusive range', () => {
    expect(countDays('2026-11-09', '2026-11-09')).toBe(1)
    expect(countDays('2026-11-03', '2026-11-09')).toBe(7)
    expect(countDays('2026-08-01', '2026-10-29')).toBe(90)
  })

  it('gives today in the requested timezone', () => {
    vi.useFakeTimers()
    // 03:00 UTC on Nov 10 is still Nov 9 in Chicago.
    vi.setSystemTime(new Date('2026-11-10T03:00:00Z'))

    expect(todayIn('UTC')).toBe('2026-11-10')
    expect(todayIn('America/Chicago')).toBe('2026-11-09')
  })

  it('converts between a date picker Date and a day', () => {
    expect(toDay(new Date(2026, 10, 9, 23, 30))).toBe('2026-11-09')
    expect(toDay(fromDay('2026-02-28'))).toBe('2026-02-28')
  })
})

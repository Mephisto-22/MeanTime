/**
 * Helpers for calendar days written as YYYY-MM-DD, as the analytics API uses them.
 *
 * A day is handled as UTC midnight internally, so formatting it never moves it
 * to the previous or next day in the browser's timezone.
 */

const DAY_LABEL: Intl.DateTimeFormatOptions = {weekday: 'short', month: 'short', day: 'numeric'}

function toUtcDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`)
}

/** Formats a day for display, e.g. "Mon, Nov 9". */
export function formatDay(day: string, options: Intl.DateTimeFormatOptions = DAY_LABEL): string {
  return new Intl.DateTimeFormat('en-US', {...options, timeZone: 'UTC'}).format(toUtcDate(day))
}

/** Returns the day that is `count` days after `day` (or before, if negative). */
export function addDays(day: string, count: number): string {
  const date = toUtcDate(day)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

/** Returns how many days an inclusive range covers. */
export function countDays(start: string, end: string): number {
  return Math.round((toUtcDate(end).getTime() - toUtcDate(start).getTime()) / 86_400_000) + 1
}

/** Returns today's day in an IANA timezone. */
export function todayIn(timeZone: string): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {timeZone}).format(new Date())
}

/** Converts a date picker's local Date to its day. */
export function toDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const dayOfMonth = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${dayOfMonth}`
}

/** Converts a day to a local Date at midnight, for a date picker. */
export function fromDay(day: string): Date {
  const [year, month, dayOfMonth] = day.split('-').map(Number)
  return new Date(year!, month! - 1, dayOfMonth!)
}

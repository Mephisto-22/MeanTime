import { apiService } from '~/services/ApiService'

/** Tracked time across the tasks in one column. */
export interface ColumnTimeDto {
  columnId: number
  title: string
  totalSeconds: number
}

/** Tracked time on one task. */
export interface TaskTimeDto {
  taskId: number
  title: string
  columnId: number
  columnTitle: string
  totalSeconds: number
}

/**
 * Averages across the tasks with tracked time. A session is one time entry.
 * The averages are null when no task has tracked time.
 */
export interface TaskAveragesDto {
  taskCount: number
  sessionCount: number
  averageTaskSeconds: number | null
  averageSessionSeconds: number | null
  averageSessionsPerTask: number | null
}

/**
 * Tracked time by one person on a board, by display name only. `userId` is
 * null for the "Unknown" group: entries recorded before they had a user.
 */
export interface CollaboratorTimeDto {
  userId: number | null
  displayName: string
  totalSeconds: number
}

/** Tracked time on a board: in total, per column, for its top tasks, on average and per person. */
export interface BoardAnalyticsDto {
  boardId: number
  title: string
  isShared: boolean
  totalSeconds: number
  columns: ColumnTimeDto[]
  topTasks: TaskTimeDto[]
  averages: TaskAveragesDto
  collaborators: CollaboratorTimeDto[]
  /** The names of the tags used on the board, for the tag filter. */
  tags: string[]
}

/** Which tasks count, by their timer now: every task, countdowns or stopwatches. */
export type TimerModeFilter = 'ALL' | 'COUNT_DOWN' | 'COUNT_UP'

/** Narrows the board's analytics to some of its tasks. */
export interface BoardAnalyticsFilters {
  timerMode: TimerModeFilter
  /** Tag names; a task counts if it has any of them. Empty means every task. */
  tags: string[]
}

/** One of the user's time entries, with the task and board it was tracked on. */
export interface DayEntryDto {
  id: number
  taskId: number
  taskTitle: string
  boardId: number
  boardTitle: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  note: string
}

/** The user's tracked time on one day (YYYY-MM-DD) in their profile timezone. */
export interface DayTimeDto {
  day: string
  totalSeconds: number
  entries: DayEntryDto[]
}

/** The user's tracked time per day, for every day from start to end. */
export interface DailyTimeDto {
  start: string
  end: string
  timezone: string
  totalSeconds: number
  days: DayTimeDto[]
}

/** An inclusive range of days, written as YYYY-MM-DD. */
export interface DayRange {
  start: string
  end: string
}

export class AnalyticsApi {
  private readonly endpoint = '/api/kanban'

  getBoardAnalytics(boardId: string | number, filters?: BoardAnalyticsFilters): Promise<BoardAnalyticsDto> {
    const query: Record<string, string | string[]> = {}
    if (filters && filters.timerMode !== 'ALL') query.timerMode = filters.timerMode
    if (filters && filters.tags.length > 0) query.tags = filters.tags
    return apiService.get<BoardAnalyticsDto>(`${this.endpoint}/boards/${boardId}/analytics`, query)
  }

  /** Returns the user's time per day; without a range, the backend uses the last 7 days. */
  getDailyTime(range?: DayRange): Promise<DailyTimeDto> {
    // Only /api/kanban responses are converted to camelCase by default.
    return apiService.get<DailyTimeDto>('/api/analytics/me/daily', range, {transformCase: true})
  }
}

export const analyticsApi = new AnalyticsApi()

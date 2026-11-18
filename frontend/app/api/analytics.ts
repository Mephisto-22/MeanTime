import { apiService } from '~/services/ApiService'

/** Tracked time across the tasks in one column. */
export interface ColumnTimeDto {
  columnId: number
  title: string
  totalSeconds: number
}

/** Task identity and column placement shared across board analytics rows. */
export interface AnalyticsTaskDto {
  taskId: number
  title: string
  columnId: number
  columnTitle: string
}

/** Tracked time on one task. */
export interface TaskTimeDto extends AnalyticsTaskDto {
  totalSeconds: number
}

/**
 * Planned vs actual time on a task with a countdown target. Planned is the
 * target; actual is the sum of the task's time entries. A positive
 * difference means over the target.
 */
export interface TaskEstimateDto extends AnalyticsTaskDto {
  plannedSeconds: number
  actualSeconds: number
  differenceSeconds: number
}

/**
 * Planned vs actual time for a board's countdown tasks. The average is each
 * tracked task's difference as a percentage of its target, averaged; it's
 * null when no task has tracked time yet.
 */
export interface EstimatesDto {
  tasks: TaskEstimateDto[]
  averageDifferencePercent: number | null
  trackedTaskCount: number
}

/** Tracked time on a board: in total, per column, for its top tasks and against estimates. */
export interface BoardAnalyticsDto {
  boardId: number
  title: string
  totalSeconds: number
  columns: ColumnTimeDto[]
  topTasks: TaskTimeDto[]
  estimates: EstimatesDto
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

  getBoardAnalytics(boardId: string | number): Promise<BoardAnalyticsDto> {
    return apiService.get<BoardAnalyticsDto>(`${this.endpoint}/boards/${boardId}/analytics`)
  }

  /** Returns the user's time per day; without a range, the backend uses the last 7 days. */
  getDailyTime(range?: DayRange): Promise<DailyTimeDto> {
    // Only /api/kanban responses are converted to camelCase by default.
    return apiService.get<DailyTimeDto>('/api/analytics/me/daily', range, {transformCase: true})
  }
}

export const analyticsApi = new AnalyticsApi()

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

/** Tracked time on a board, in total, per column and for its top tasks. */
export interface BoardAnalyticsDto {
  boardId: number
  title: string
  totalSeconds: number
  columns: ColumnTimeDto[]
  topTasks: TaskTimeDto[]
}

export class AnalyticsApi {
  private readonly endpoint = '/api/kanban'

  getBoardAnalytics(boardId: string | number): Promise<BoardAnalyticsDto> {
    return apiService.get<BoardAnalyticsDto>(`${this.endpoint}/boards/${boardId}/analytics`)
  }
}

export const analyticsApi = new AnalyticsApi()

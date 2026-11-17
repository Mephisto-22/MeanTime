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
 * Tracked time by one person on a board, by display name only. `userId` is
 * null for the "Unknown" group: entries recorded before they had a user.
 */
export interface CollaboratorTimeDto {
  userId: number | null
  displayName: string
  totalSeconds: number
}

/** Tracked time on a board: in total, per column, for its top tasks and per person. */
export interface BoardAnalyticsDto {
  boardId: number
  title: string
  isShared: boolean
  totalSeconds: number
  columns: ColumnTimeDto[]
  topTasks: TaskTimeDto[]
  collaborators: CollaboratorTimeDto[]
}

export class AnalyticsApi {
  private readonly endpoint = '/api/kanban'

  getBoardAnalytics(boardId: string | number): Promise<BoardAnalyticsDto> {
    return apiService.get<BoardAnalyticsDto>(`${this.endpoint}/boards/${boardId}/analytics`)
  }
}

export const analyticsApi = new AnalyticsApi()

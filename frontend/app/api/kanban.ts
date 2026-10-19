import type { ComputedRef, InjectionKey } from 'vue'
import { apiService } from '~/services/ApiService'

export interface KanbanTaskDto {
  id: string | number
  title: string
  description?: string
  position: number
  columnId: string | number
  created_at?: string
  updated_at?: string
}

export interface KanbanColumnDto {
  id: string | number
  title: string
  position: number
  boardId: string | number
  tasks: KanbanTaskDto[]
  created_at?: string
  updated_at?: string
}

export interface KanbanBoardDto {
  id: string | number
  title: string
  description?: string
  columns: KanbanColumnDto[]
  created_at?: string
  updated_at?: string
}

export interface BoardCreateRequest {
  title: string
  description?: string
}

export interface BoardUpdateRequest {
  title?: string
  description?: string
}

export interface ColumnCreateRequest {
  title: string
  position?: number
}

export interface ColumnUpdateRequest {
  title?: string
  position?: number
}

export interface TaskCreateRequest {
  title: string
  description?: string
}

export interface TaskUpdateRequest {
  title?: string
  description?: string
}

export interface TaskMoveRequest {
  to_column_id: string | number
  target_position: number
}

export interface SuccessResponse {
  success: boolean
}

export interface KanbanColumnSummary {
  id: string | number
  title: string
  position: number
}

export interface TaskRelocationContextRequest {
  taskId: string | number
  fromColumnId: string | number
  toColumnId: string | number
  targetOrder?: number
  targetPosition?: number
}

export interface KanbanContext {
  columns: ComputedRef<KanbanColumnSummary[]>
  moveTask: (req: TaskRelocationContextRequest) => Promise<void> | void
}

export const kanbanContextKey: InjectionKey<KanbanContext> = Symbol('kanbanContext')

export class KanbanApi {
  readonly endpoint = '/api/kanban'

  // -----------------
  // Board Endpoints
  // -----------------

  listBoards(): Promise<KanbanBoardDto[]> {
    return apiService.get<KanbanBoardDto[]>(`${this.endpoint}/boards`)
  }

  getBoard(boardId: string | number): Promise<KanbanBoardDto> {
    return apiService.get<KanbanBoardDto>(`${this.endpoint}/boards/${boardId}`)
  }

  createBoard(payload: BoardCreateRequest): Promise<KanbanBoardDto> {
    return apiService.post<KanbanBoardDto>(`${this.endpoint}/boards`, payload)
  }

  updateBoard(boardId: string | number, payload: BoardUpdateRequest): Promise<KanbanBoardDto> {
    return apiService.patch<KanbanBoardDto>(`${this.endpoint}/boards/${boardId}`, payload)
  }

  deleteBoard(boardId: string | number): Promise<SuccessResponse> {
    return apiService.delete<SuccessResponse>(`${this.endpoint}/boards/${boardId}`)
  }

  // -----------------
  // Column Endpoints
  // -----------------

  createColumn(boardId: string | number, payload: ColumnCreateRequest): Promise<KanbanColumnDto> {
    return apiService.post<KanbanColumnDto>(`${this.endpoint}/boards/${boardId}/columns`, payload)
  }

  updateColumn(columnId: string | number, payload: ColumnUpdateRequest): Promise<KanbanColumnDto> {
    return apiService.patch<KanbanColumnDto>(`${this.endpoint}/columns/${columnId}`, payload)
  }

  deleteColumn(columnId: string | number): Promise<SuccessResponse> {
    return apiService.delete<SuccessResponse>(`${this.endpoint}/columns/${columnId}`)
  }

  // -----------------
  // Task Endpoints
  // -----------------

  createTask(columnId: string | number, payload: TaskCreateRequest): Promise<KanbanTaskDto> {
    return apiService.post<KanbanTaskDto>(`${this.endpoint}/columns/${columnId}/tasks`, payload)
  }

  updateTask(taskId: string | number, payload: TaskUpdateRequest): Promise<KanbanTaskDto> {
    return apiService.patch<KanbanTaskDto>(`${this.endpoint}/tasks/${taskId}`, payload)
  }

  deleteTask(taskId: string | number): Promise<SuccessResponse> {
    return apiService.delete<SuccessResponse>(`${this.endpoint}/tasks/${taskId}`)
  }

  moveTask(taskId: string | number, payload: TaskMoveRequest): Promise<KanbanTaskDto> {
    return apiService.post<KanbanTaskDto>(`${this.endpoint}/tasks/${taskId}/move`, payload)
  }
}

export const kanbanApi = new KanbanApi()

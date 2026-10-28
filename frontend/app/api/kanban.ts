import type { ComputedRef, InjectionKey } from 'vue'
import { apiService } from '~/services/ApiService'

export type TaskPriorityType = 'LOW' | 'MEDIUM' | 'HIGH' | null

export const TASK_PRIORITY_CONFIG = {
  HIGH: { label: 'High', dotClass: 'bg-red-500', badgeClass: 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950/40' },
  MEDIUM: { label: 'Medium', dotClass: 'bg-amber-500', badgeClass: 'border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
  LOW: { label: 'Low', dotClass: 'bg-sky-500', badgeClass: 'border-sky-500 text-sky-600 bg-sky-50 dark:bg-sky-950/40' },
} as const

export interface TagDto {
  id: string | number
  name: string
  created_at?: string
}

export interface KanbanTaskDto {
  id: string | number
  title: string
  description?: string
  position: number
  columnId?: string | number
  column_id?: string | number
  priority?: TaskPriorityType
  tags?: TagDto[]
  tag_ids?: Array<string | number>
}

export interface KanbanColumnDto {
  id: string | number
  title: string
  position: number
  boardId: string | number
  tasks: KanbanTaskDto[]
}

export interface KanbanBoardDto {
  id: string | number
  title: string
  description?: string
  columns: KanbanColumnDto[]
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

export interface TaskMoveContext {
  taskId: string | number
  fromColumnId: string | number
  toColumnId: string | number
  targetPosition: number
}

export interface TaskDialogSavePayload {
  title: string
  description: string
  mode: 'create' | 'edit'
  columnId?: string | number | null
  taskId?: string | number | null
  priority?: TaskPriorityType
  tags?: TagDto[]
  tag_ids?: Array<string | number>
}

export interface KanbanContext {
  columns: ComputedRef<KanbanColumnSummary[]>
  availableTags?: ComputedRef<TagDto[]>
  createTag?: (payload: { name: string } | string) => Promise<TagDto>
  moveTask: (req: TaskMoveContext) => Promise<void> | void
  openCreateTaskDialog: (columnId: string | number) => void
  openEditTaskDialog: (task: KanbanTaskDto) => void
  createTask: (columnId: string | number, payload: Partial<KanbanTaskDto>) => Promise<void> | void
  updateTask: (taskId: string | number, payload: Partial<KanbanTaskDto>) => Promise<void> | void
  deleteTask: (taskId: string | number) => Promise<void> | void
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

  createBoard(payload: Partial<KanbanBoardDto>): Promise<KanbanBoardDto> {
    return apiService.post<KanbanBoardDto>(`${this.endpoint}/boards`, payload)
  }

  updateBoard(boardId: string | number, payload: Partial<KanbanBoardDto>): Promise<KanbanBoardDto> {
    return apiService.patch<KanbanBoardDto>(`${this.endpoint}/boards/${boardId}`, payload)
  }

  deleteBoard(boardId: string | number): Promise<SuccessResponse> {
    return apiService.delete<SuccessResponse>(`${this.endpoint}/boards/${boardId}`)
  }

  // -----------------
  // Column Endpoints
  // -----------------

  createColumn(boardId: string | number, payload: Partial<KanbanColumnDto>): Promise<KanbanColumnDto> {
    return apiService.post<KanbanColumnDto>(`${this.endpoint}/boards/${boardId}/columns`, payload)
  }

  updateColumn(columnId: string | number, payload: Partial<KanbanColumnDto>): Promise<KanbanColumnDto> {
    return apiService.patch<KanbanColumnDto>(`${this.endpoint}/columns/${columnId}`, payload)
  }

  deleteColumn(columnId: string | number): Promise<SuccessResponse> {
    return apiService.delete<SuccessResponse>(`${this.endpoint}/columns/${columnId}`)
  }

  // -----------------
  // Task Endpoints
  // -----------------

  createTask(columnId: string | number, payload: Partial<KanbanTaskDto>): Promise<KanbanTaskDto> {
    return apiService.post<KanbanTaskDto>(`${this.endpoint}/columns/${columnId}/tasks`, payload)
  }

  updateTask(taskId: string | number, payload: Partial<KanbanTaskDto>): Promise<KanbanTaskDto> {
    return apiService.patch<KanbanTaskDto>(`${this.endpoint}/tasks/${taskId}`, payload)
  }

  deleteTask(taskId: string | number): Promise<SuccessResponse> {
    return apiService.delete<SuccessResponse>(`${this.endpoint}/tasks/${taskId}`)
  }

  moveTask(taskId: string | number, payload: TaskMoveRequest): Promise<KanbanTaskDto> {
    return apiService.post<KanbanTaskDto>(`${this.endpoint}/tasks/${taskId}/move`, payload)
  }

  // -----------------
  // Tag Endpoints
  // -----------------

  listTags(): Promise<TagDto[]> {
    return apiService.get<TagDto[]>(`${this.endpoint}/tags`)
  }

  createTag(payload: { name: string }): Promise<TagDto> {
    return apiService.post<TagDto>(`${this.endpoint}/tags`, payload)
  }
}

export const kanbanApi = new KanbanApi()

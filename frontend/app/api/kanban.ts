import type { ComputedRef, InjectionKey } from 'vue'
import type { UserOut } from '~/api/friends'
import { apiService } from '~/services/ApiService'

export type TaskPriorityType = 'LOW' | 'MEDIUM' | 'HIGH' | null
export type TimerMode = 'NONE' | 'COUNT_UP' | 'COUNT_DOWN'
export type TimerState = 'IDLE' | 'RUNNING' | 'PAUSED'

export interface TaskTimerDto {
  id?: number
  taskId: number | string
  mode: TimerMode
  targetDurationSeconds: number | null
  state: TimerState
  startedAt: string | null
  lastResumedAt?: string | null
  lastPausedAt?: string | null
  elapsedSeconds: number
}

export interface TaskTimeEntryDto {
  id: number | string
  taskId: number | string
  userId?: number | string
  startedAt: string
  endedAt?: string | null
  durationSeconds: number
  note: string
  createdAt?: string
}

export const TASK_PRIORITY_CONFIG = {
  HIGH: {
    label: 'High',
    shortLabel: 'HIGH',
    dotClass: 'bg-red-500',
    badgeClass: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    borderClass: 'border-l-4 border-l-red-500',
  },
  MEDIUM: {
    label: 'Medium',
    shortLabel: 'MED',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    borderClass: 'border-l-4 border-l-amber-500',
  },
  LOW: {
    label: 'Low',
    shortLabel: 'LOW',
    dotClass: 'bg-sky-500',
    badgeClass: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
    borderClass: 'border-l-4 border-l-sky-500',
  },
} as const

export const DEFAULT_TASK_PRIORITY_BORDER_CLASS = 'border-l-4 border-l-transparent'

export const TIMER_MODE_CONFIG = {
  NONE: { label: 'None' },
  COUNT_DOWN: { label: 'Count down' },
  COUNT_UP: { label: 'Count up' },
} as const

export const TIMER_STATE_CONFIG = {
  IDLE: {
    label: 'Idle',
    dotClass: 'bg-surface-400',
    badgeClass: 'text-surface-500',
    progressClass: 'bg-emerald-500 dark:bg-emerald-400',
  },
  RUNNING: {
    label: 'Live session',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    progressClass: 'bg-emerald-500 dark:bg-emerald-400',
  },
  PAUSED: {
    label: 'Paused',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    progressClass: 'bg-amber-500 dark:bg-amber-400',
  },
} as const

export interface TagDto {
  id: string | number
  name: string
  createdAt?: string
}

export interface KanbanTaskDto {
  id: string | number
  title: string
  description?: string
  position: number
  columnId: string | number
  timer?: TaskTimerDto | null
  timeEntries?: TaskTimeEntryDto[]
  priority?: TaskPriorityType
  tags?: TagDto[]
  tagIds?: Array<string | number>
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
  description: string
  isOwner?: boolean
  owner?: UserOut
  collaborators?: UserOut[]
  columns: KanbanColumnDto[]
}

export interface SuccessResponse {
  success: boolean
}

export interface TaskMoveRequest {
  toColumnId: number | string
  targetPosition: number
}

export interface KanbanColumnSummary {
  id: string | number
  title: string
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
  timer?: TaskTimerDto | null
  timeEntries?: TaskTimeEntryDto[]
  priority?: TaskPriorityType
  tags?: TagDto[]
  tagIds?: Array<string | number>
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
  startTimer?: (taskId: string | number, defaultTimer?: Partial<TaskTimerDto>) => void
  pauseTimer?: (taskId: string | number) => void
  stopTimer?: (taskId: string | number, entry?: TaskTimeEntryDto) => void
  onTimerExpired?: (task: KanbanTaskDto, entry: TaskTimeEntryDto) => void
}

export const kanbanContextKey: InjectionKey<KanbanContext> = Symbol('kanbanContext')

export class KanbanApi {
  private readonly endpoint = '/api/kanban'

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

  shareBoard(boardId: string | number, friendId: number): Promise<{ success: boolean; message: string }> {
    return apiService.post<{ success: boolean; message: string }>(`${this.endpoint}/boards/${boardId}/collaborators`, { friend_id: friendId })
  }

  removeCollaborator(boardId: string | number, collaboratorId: number): Promise<{ success: boolean; message: string }> {
    return apiService.delete<{ success: boolean; message: string }>(`${this.endpoint}/boards/${boardId}/collaborators/${collaboratorId}`)
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
  // Timer Endpoints
  // -----------------

  updateTaskTimer(taskId: string | number, payload: Partial<TaskTimerDto>): Promise<TaskTimerDto> {
    return apiService.patch<TaskTimerDto>(`${this.endpoint}/tasks/${taskId}/timer`, payload)
  }

  // -----------------
  // Time Entry Endpoints
  // -----------------

  listTimeEntries(taskId: string | number): Promise<TaskTimeEntryDto[]> {
    return apiService.get<TaskTimeEntryDto[]>(`${this.endpoint}/tasks/${taskId}/time-entries`)
  }

  createTimeEntry(taskId: string | number, payload: Partial<TaskTimeEntryDto>): Promise<TaskTimeEntryDto> {
    return apiService.post<TaskTimeEntryDto>(`${this.endpoint}/tasks/${taskId}/time-entries`, payload)
  }

  updateTimeEntry(entryId: string | number, payload: Partial<TaskTimeEntryDto>): Promise<TaskTimeEntryDto> {
    return apiService.patch<TaskTimeEntryDto>(`${this.endpoint}/time-entries/${entryId}`, payload)
  }

  deleteTimeEntry(entryId: string | number): Promise<SuccessResponse> {
    return apiService.delete<SuccessResponse>(`${this.endpoint}/time-entries/${entryId}`)
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

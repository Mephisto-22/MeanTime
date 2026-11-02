import type { ComputedRef, InjectionKey } from 'vue'
import { apiService } from '~/services/ApiService'

export type TaskPriorityType = 'LOW' | 'MEDIUM' | 'HIGH' | null
export type TimerMode = 'NONE' | 'COUNT_UP' | 'COUNT_DOWN'
export type TimerState = 'IDLE' | 'RUNNING' | 'PAUSED'

export interface TaskTimerDto {
  id?: number
  taskId: number | string
  task_id?: number | string
  mode: TimerMode
  targetDurationSeconds: number | null
  target_duration_seconds?: number | null
  state: TimerState
  startedAt: string | null
  started_at?: string | null
  elapsedSeconds: number
  elapsed_seconds?: number
}

export interface TaskTimeEntryDto {
  id: number | string
  taskId: number | string
  task_id?: number | string
  userId?: number | string
  user_id?: number | string
  startedAt: string
  started_at?: string
  endedAt?: string | null
  ended_at?: string | null
  durationSeconds: number
  duration_seconds?: number
  note: string
  createdAt?: string
  created_at?: string
}

export function normalizeTimeEntry(raw: any): TaskTimeEntryDto {
  if (!raw) return raw
  const duration = Number(raw.durationSeconds ?? raw.duration_seconds ?? 0)
  return {
    id: raw.id,
    taskId: raw.taskId ?? raw.task_id,
    userId: raw.userId ?? raw.user_id,
    startedAt: raw.startedAt ?? raw.started_at ?? new Date().toISOString(),
    endedAt: raw.endedAt ?? raw.ended_at ?? null,
    durationSeconds: isNaN(duration) ? 0 : Math.max(0, duration),
    note: raw.note ?? '',
    createdAt: raw.createdAt ?? raw.created_at,
  }
}

export function normalizeTaskTimer(raw: any): TaskTimerDto {
  if (!raw) return raw
  const elapsed = Number(raw.elapsedSeconds ?? raw.elapsed_seconds ?? 0)
  const target = raw.targetDurationSeconds ?? raw.target_duration_seconds
  return {
    id: raw.id,
    taskId: raw.taskId ?? raw.task_id,
    mode: raw.mode ?? 'NONE',
    targetDurationSeconds: target != null && !isNaN(Number(target)) ? Number(target) : null,
    state: raw.state ?? 'IDLE',
    startedAt: raw.startedAt ?? raw.started_at ?? null,
    elapsedSeconds: isNaN(elapsed) ? 0 : Math.max(0, elapsed),
  }
}

export const TASK_PRIORITY_CONFIG = {
  HIGH: { label: 'High', dotClass: 'bg-red-500', badgeClass: 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950/40' },
  MEDIUM: { label: 'Medium', dotClass: 'bg-amber-500', badgeClass: 'border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
  LOW: { label: 'Low', dotClass: 'bg-sky-500', badgeClass: 'border-sky-500 text-sky-600 bg-sky-50 dark:bg-sky-950/40' },
} as const

export const TIMER_MODE_CONFIG = {
  NONE: { label: 'None' },
  COUNT_DOWN: { label: 'Count down' },
  COUNT_UP: { label: 'Count up' },
} as const

export const TIMER_STATE_CONFIG = {
  IDLE: { label: 'Idle', dotClass: 'bg-surface-400', badgeClass: 'text-surface-500' },
  RUNNING: { label: 'Live session', dotClass: 'bg-emerald-500 animate-pulse', badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  PAUSED: { label: 'Paused', dotClass: 'bg-amber-500', badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
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
  timer?: TaskTimerDto | null
  time_entries?: TaskTimeEntryDto[]
  timeEntries?: TaskTimeEntryDto[]
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
  description: string
  columns: KanbanColumnDto[]
}

export interface SuccessResponse {
  success: boolean
}

export interface TaskMoveRequest {
  to_column_id: number | string
  target_position: number
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

  createBoard(payload: { title: string; description?: string }): Promise<KanbanBoardDto> {
    return apiService.post<KanbanBoardDto>(`${this.endpoint}/boards`, payload)
  }

  updateBoard(boardId: string | number, payload: { title?: string; description?: string }): Promise<KanbanBoardDto> {
    return apiService.patch<KanbanBoardDto>(`${this.endpoint}/boards/${boardId}`, payload)
  }

  deleteBoard(boardId: string | number): Promise<SuccessResponse> {
    return apiService.delete<SuccessResponse>(`${this.endpoint}/boards/${boardId}`)
  }

  // -----------------
  // Column Endpoints
  // -----------------

  createColumn(boardId: string | number, payload: { title: string; position?: number }): Promise<KanbanColumnDto> {
    return apiService.post<KanbanColumnDto>(`${this.endpoint}/boards/${boardId}/columns`, payload)
  }

  updateColumn(columnId: string | number, payload: { title?: string; position?: number }): Promise<KanbanColumnDto> {
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

  async updateTaskTimer(taskId: string | number, payload: Partial<TaskTimerDto>): Promise<TaskTimerDto> {
    const raw = await apiService.patch<any>(`${this.endpoint}/tasks/${taskId}/timer`, {
      mode: payload.mode,
      target_duration_seconds: payload.targetDurationSeconds ?? payload.target_duration_seconds,
      state: payload.state,
      started_at: payload.startedAt ?? payload.started_at,
      elapsed_seconds: payload.elapsedSeconds ?? payload.elapsed_seconds,
    })
    return normalizeTaskTimer(raw)
  }

  // -----------------
  // Time Entry Endpoints
  // -----------------

  async listTimeEntries(taskId: string | number): Promise<TaskTimeEntryDto[]> {
    const raw = await apiService.get<any[]>(`${this.endpoint}/tasks/${taskId}/time-entries`)
    return (raw || []).map(normalizeTimeEntry)
  }

  async createTimeEntry(taskId: string | number, payload: Partial<TaskTimeEntryDto>): Promise<TaskTimeEntryDto> {
    const raw = await apiService.post<any>(`${this.endpoint}/tasks/${taskId}/time-entries`, {
      started_at: payload.startedAt ?? payload.started_at,
      ended_at: payload.endedAt ?? payload.ended_at,
      duration_seconds: payload.durationSeconds ?? payload.duration_seconds,
      note: payload.note ?? '',
    })
    return normalizeTimeEntry(raw)
  }

  async updateTimeEntry(entryId: string | number, payload: Partial<TaskTimeEntryDto>): Promise<TaskTimeEntryDto> {
    const raw = await apiService.patch<any>(`${this.endpoint}/time-entries/${entryId}`, {
      started_at: payload.startedAt ?? payload.started_at,
      ended_at: payload.endedAt ?? payload.ended_at,
      duration_seconds: payload.durationSeconds ?? payload.duration_seconds,
      note: payload.note,
    })
    return normalizeTimeEntry(raw)
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

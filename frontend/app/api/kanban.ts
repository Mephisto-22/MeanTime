import type { ComputedRef, InjectionKey } from 'vue'
import type { UserOut } from '~/api/friends'
import type { BoardChatComposable } from '~/composables/useBoardChat'
import { apiService } from '~/services/ApiService'

export type TaskPriorityType = 'LOW' | 'MEDIUM' | 'HIGH' | null
export type TimerMode = 'NONE' | 'COUNT_UP' | 'COUNT_DOWN'
export type TimerState = 'IDLE' | 'RUNNING' | 'PAUSED'
export type RecurrenceCadence = 'DAILY' | 'WEEKLY' | 'MONTHLY'

export interface RecurrenceIn {
  cadence: RecurrenceCadence
  daysOfWeek?: number[]
  dayOfMonth?: number | null
  timeOfDay?: string
  timezone?: string
}

export interface RecurringTaskDto {
  id: number | string
  boardId: number | string
  creatorId: number | string | null
  title: string
  description?: string
  priority?: TaskPriorityType
  cadence: RecurrenceCadence
  daysOfWeek: number[]
  dayOfMonth?: number | null
  timeOfDay: string
  timezone: string
  defaultTimerMode: TimerMode
  targetDurationSeconds?: number | null
  isActive: boolean
  nextRunAt: string
  createdAt?: string
  updatedAt?: string
}

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
  user?: UserOut | null
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

export type DueDateStatus = 'overdue' | 'due_soon' | 'upcoming'

export const TASK_DUE_DATE_STATUS_CONFIG = {
  overdue: {
    label: 'Overdue',
    badgeClass: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    dotClass: 'bg-red-500',
    icon: 'pi pi-exclamation-circle',
  },
  due_soon: {
    label: 'Due soon',
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    dotClass: 'bg-amber-500',
    icon: 'pi pi-clock',
  },
  upcoming: {
    label: 'Upcoming',
    badgeClass: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300',
    dotClass: 'bg-surface-400',
    icon: 'pi pi-calendar',
  },
} as const

export function getDueDateStatus(dueAt: string | Date | null | undefined, now: Date = new Date()): DueDateStatus | null {
  if (!dueAt) return null
  const dueDate = typeof dueAt === 'string' ? new Date(dueAt) : dueAt
  if (isNaN(dueDate.getTime())) return null

  const diffMs = dueDate.getTime() - now.getTime()
  if (diffMs < 0) {
    return 'overdue'
  }
  if (diffMs <= 24 * 60 * 60 * 1000) {
    return 'due_soon'
  }
  return 'upcoming'
}

export function formatDueDateBadge(dueAt: string | Date | null | undefined): string {
  if (!dueAt) return ''
  const date = typeof dueAt === 'string' ? new Date(dueAt) : dueAt
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const TASK_CADENCE_OPTIONS: Array<{ label: string; value: RecurrenceCadence }> = [
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
]

export const TASK_WEEKDAY_OPTIONS: Array<{ label: string; value: number }> = [
  { label: 'Mon', value: 0 },
  { label: 'Tue', value: 1 },
  { label: 'Wed', value: 2 },
  { label: 'Thu', value: 3 },
  { label: 'Fri', value: 4 },
  { label: 'Sat', value: 5 },
  { label: 'Sun', value: 6 },
]

export const REMINDER_PRESET_OPTIONS: Array<{ label: string; value: number | null; shortLabel: string }> = [
  { label: 'None (No reminder)', value: null, shortLabel: 'Off' },
  { label: 'At due date (0m)', value: 0, shortLabel: 'At due' },
  { label: '15 minutes before', value: 900, shortLabel: '15m' },
  { label: '1 hour before', value: 3600, shortLabel: '1h' },
  { label: '2 hours before', value: 7200, shortLabel: '2h' },
  { label: '1 day before', value: 86400, shortLabel: '1d' },
  { label: '2 days before', value: 172800, shortLabel: '2d' },
]

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
  position: number | null
  columnId: string | number
  columnActivityAt?: string
  archivedAt?: string | null
  recurringTaskId?: number | string | null
  recurringTask?: RecurringTaskDto | null
  recurrence?: RecurrenceIn | null
  timer?: TaskTimerDto | null
  timeEntries?: TaskTimeEntryDto[]
  /** Sum of the task's time entry durations, in seconds. */
  totalSeconds?: number
  priority?: TaskPriorityType
  tags?: TagDto[]
  tagIds?: Array<string | number>
  dueAt?: string | null
  reminderOffsetSeconds?: number | null
  reminderAt?: string | null
  reminderSentAt?: string | null
}

export interface KanbanColumnDto {
  id: string | number
  title: string
  position: number
  boardId: string | number
  autoClearDurationSeconds?: number | null
  tasks: KanbanTaskDto[]
}

export type BoardRole = 'EDITOR' | 'VIEWER'

export interface BoardCollaboratorDto extends UserOut {
  role: BoardRole
}

export const BOARD_ROLE_CONFIG = {
  EDITOR: {
    label: 'Editor',
    indefiniteLabel: 'an editor',
    description: 'Can change board content',
  },
  VIEWER: {
    label: 'Viewer',
    indefiniteLabel: 'a viewer',
    description: 'Can view the board and analytics',
  },
} as const satisfies Record<BoardRole, {
  label: string
  indefiniteLabel: string
  description: string
}>

export const BOARD_ROLE_OPTIONS: Array<{
  label: string
  value: BoardRole
}> = [
  { label: BOARD_ROLE_CONFIG.EDITOR.label, value: 'EDITOR' },
  { label: BOARD_ROLE_CONFIG.VIEWER.label, value: 'VIEWER' },
]

export interface KanbanBoardDto {
  id: string | number
  title: string
  description: string
  isOwner?: boolean
  owner?: UserOut
  collaborators?: BoardCollaboratorDto[]
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
  recurrence?: RecurrenceIn | null
  recurringTaskId?: number | string | null
  applyToFuture?: boolean
  dueAt?: string | null
  reminderOffsetSeconds?: number | null
}

export interface KanbanContext {
  canEdit: ComputedRef<boolean>
  columns: ComputedRef<KanbanColumnSummary[]>
  availableTags?: ComputedRef<TagDto[]>
  isShared?: ComputedRef<boolean>
  boardMembers?: ComputedRef<UserOut[]>
  createTag?: (payload: { name: string } | string) => Promise<TagDto>
  moveTask: (req: TaskMoveContext) => Promise<void> | void
  openCreateTaskDialog: (columnId: string | number) => void
  openEditTaskDialog: (task: KanbanTaskDto) => void
  createTask: (columnId: string | number, payload: Partial<KanbanTaskDto>) => Promise<void> | void
  updateTask: (taskId: string | number, payload: Partial<KanbanTaskDto> & { applyToFuture?: boolean }) => Promise<void> | void
  deleteTask: (taskId: string | number, options?: { cancelRecurrence?: boolean }) => Promise<void> | void
  startTimer?: (taskId: string | number, defaultTimer?: Partial<TaskTimerDto>) => void
  pauseTimer?: (taskId: string | number) => void
  stopTimer?: (taskId: string | number, entry?: TaskTimeEntryDto) => void
  setTaskTotal?: (taskId: string | number, totalSeconds: number) => void
  onTimerExpired?: (task: KanbanTaskDto, entry: TaskTimeEntryDto) => void
  boardChat?: BoardChatComposable
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

  shareBoard(boardId: string | number, friendId: number, role: BoardRole = 'EDITOR'): Promise<{ success: boolean; message: string }> {
    return apiService.post<{ success: boolean; message: string }>(`${this.endpoint}/boards/${boardId}/collaborators`, { friend_id: friendId, role })
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

  deleteTask(taskId: string | number, options?: { cancelRecurrence?: boolean }): Promise<SuccessResponse> {
    if (options?.cancelRecurrence !== undefined) {
      return apiService.delete<SuccessResponse>(`${this.endpoint}/tasks/${taskId}`, undefined, {
        query: { cancel_recurrence: options.cancelRecurrence },
      })
    }
    return apiService.delete<SuccessResponse>(`${this.endpoint}/tasks/${taskId}`)
  }

  moveTask(taskId: string | number, payload: TaskMoveRequest): Promise<KanbanTaskDto> {
    return apiService.post<KanbanTaskDto>(`${this.endpoint}/tasks/${taskId}/move`, payload)
  }

  // -------------------------
  // Recurring Task Endpoints
  // -------------------------

  updateRecurringTask(recurringTaskId: string | number, payload: Partial<RecurringTaskDto>): Promise<RecurringTaskDto> {
    return apiService.patch<RecurringTaskDto>(`${this.endpoint}/recurring-tasks/${recurringTaskId}`, payload)
  }

  deleteRecurringTask(recurringTaskId: string | number): Promise<SuccessResponse> {
    return apiService.delete<SuccessResponse>(`${this.endpoint}/recurring-tasks/${recurringTaskId}`)
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

  listTags(boardId: string | number): Promise<TagDto[]> {
    return apiService.get<TagDto[]>(`${this.endpoint}/tags?board_id=${boardId}`)
  }

  createTag(payload: { name: string }): Promise<TagDto> {
    return apiService.post<TagDto>(`${this.endpoint}/tags`, payload)
  }
}

export const kanbanApi = new KanbanApi()

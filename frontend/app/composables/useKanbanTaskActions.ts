import type { Ref } from 'vue'
import type {
  KanbanBoardDto,
  KanbanTaskDto,
  TagDto,
  TaskDialogSavePayload,
  TaskPriorityType,
  TaskTimeEntryDto,
  TaskTimerDto,
} from '~/api/kanban'
import { kanbanApi } from '~/api/kanban'
import type { UserOut } from '~/api/friends'
import { useNotifications } from '~/composables/useNotifications'
import { sumEntryDurations } from '~/composables/useTaskTimer'

export interface KanbanTaskActionsOptions {
  findTask: (taskId: string | number) => KanbanTaskDto | undefined
  availableTags: Ref<TagDto[]>
  onCreateTask?: (columnId: string | number, payload: Partial<KanbanTaskDto>) => Promise<void>
  createSnapshot?: () => () => void
  moveTaskLocally?: (task: KanbanTaskDto, destinationColumnId: string | number) => number | null
  removeTaskLocally?: (taskId: string | number) => boolean
  onAfterTaskUpdate?: (task: KanbanTaskDto, updatedFromServer?: KanbanTaskDto) => void
  onAfterTaskDelete?: (taskId: string | number) => void
  onAfterTagCreate?: (tag: TagDto) => void
  onAfterTimerChange?: (task: KanbanTaskDto) => void
  onAfterTaskTotalChange?: (taskId: string | number, totalSeconds: number, changed: boolean) => void
}

export interface TaskUpdateFields {
  title?: string
  description?: string
  priority?: TaskPriorityType
  tags?: TagDto[]
  timer?: TaskTimerDto | null
  dueAt?: string | null
  reminderOffsetSeconds?: number | null
}

/** Compare two entity identifiers regardless of string vs number representation. */
export function sameId(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): boolean {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

/** Reassign zero-based sequential position indices to tasks in a column. */
export function reindexTasks(tasks: KanbanTaskDto[]): void {
  tasks.forEach((task, index) => {
    task.position = index
  })
}

/** Mutate a task DTO in place with the supplied partial task field updates. */
export function applyTaskUpdates(target: KanbanTaskDto, source: TaskUpdateFields): void {
  if (source.title !== undefined) target.title = source.title
  if (source.description !== undefined) target.description = source.description
  if (source.priority !== undefined) target.priority = source.priority
  if (source.tags !== undefined) target.tags = source.tags
  if (source.dueAt !== undefined) {
    target.dueAt = source.dueAt ?? null
  }
  if (source.reminderOffsetSeconds !== undefined) {
    target.reminderOffsetSeconds = source.reminderOffsetSeconds ?? null
  }
  if (source.timer !== undefined) {
    if (source.timer === null || source.timer.mode === 'NONE') {
      target.timer = null
    } else {
      target.timer = {
        taskId: target.id,
        mode: source.timer.mode,
        targetDurationSeconds: source.timer.targetDurationSeconds ?? null,
        state: source.timer.state ?? 'IDLE',
        startedAt: source.timer.startedAt ?? null,
        elapsedSeconds: source.timer.elapsedSeconds ?? target.timer?.elapsedSeconds ?? 0,
      }
    }
  }
}

/** Copy shared non-positional task metadata fields from source to target when defined. */
export function syncTaskFields(target: KanbanTaskDto, source: Partial<KanbanTaskDto>): void {
  applyTaskUpdates(target, source)
  if (source.recurringTaskId !== undefined) {
    target.recurringTaskId = source.recurringTaskId
  }
  if (source.recurringTask !== undefined) {
    target.recurringTask = source.recurringTask
  }
  if (source.reminderAt !== undefined) {
    target.reminderAt = source.reminderAt
  }
  if (source.reminderSentAt !== undefined) {
    target.reminderSentAt = source.reminderSentAt
  }
  if (source.totalSeconds !== undefined) {
    target.totalSeconds = source.totalSeconds
  }
  if (source.updatedAt !== undefined) {
    target.updatedAt = source.updatedAt
  }
}

/** Determine whether a board is shared with other collaborators or owned by another user. */
export function isBoardShared(
  board?: Pick<KanbanBoardDto, 'collaborators' | 'isOwner'> | null,
): boolean {
  if (!board) return false
  const hasCollaborators = (board.collaborators?.length ?? 0) > 0
  const isNotOwner = board.isOwner === false
  return hasCollaborators || isNotOwner
}

/** Return the deduplicated board owner and collaborators. */
export function getBoardMembers(
  board?: Pick<KanbanBoardDto, 'owner' | 'collaborators'> | null,
): UserOut[] {
  if (!board) return []
  const users: UserOut[] = []
  if (board.owner) {
    users.push(board.owner)
  }
  if (board.collaborators) {
    for (const collaborator of board.collaborators) {
      if (!users.some(existing => sameId(existing.id, collaborator.id))) {
        users.push(collaborator)
      }
    }
  }
  return users
}

/** Shared task CRUD, tag creation, and timer actions backed by optimistic UI updates. */
export type TaskUpdatePayload = Omit<Partial<KanbanTaskDto>, 'columnId'> & {
  columnId?: string | number | null
  applyToFuture?: boolean
  timerMode?: TaskTimerDto['mode']
  targetDurationSeconds?: number | null
}

function buildTaskUpdatePayload(payload: TaskUpdatePayload): Partial<KanbanTaskDto> & Record<string, unknown> {
  const updatePayload: Record<string, unknown> = {
    title: payload.title,
    description: payload.description,
  }
  const optionalKeys = [
    'priority',
    'tagIds',
    'dueAt',
    'reminderOffsetSeconds',
    'applyToFuture',
    'recurrence',
    'timerMode',
    'targetDurationSeconds',
  ] as const
  for (const key of optionalKeys) {
    if (payload[key] !== undefined) {
      updatePayload[key] = payload[key]
    }
  }
  return updatePayload
}

function createTaskSnapshot(task: KanbanTaskDto): () => void {
  const snapshot = JSON.parse(JSON.stringify(task)) as KanbanTaskDto
  return () => {
    Object.assign(task, snapshot)
  }
}

function computeAccumulatedSeconds(timer: TaskTimerDto): number {
  let accumulated = timer.elapsedSeconds || 0
  const anchorTime = timer.lastResumedAt || timer.startedAt
  if (timer.state === 'RUNNING' && anchorTime) {
    const delta = Math.max(0, Math.floor((Date.now() - new Date(anchorTime).getTime()) / 1000))
    accumulated += delta
  }
  return accumulated
}

export function useKanbanTaskActions(options: KanbanTaskActionsOptions) {
  const notify = useNotifications()

  const createTag = async (payload: { name: string } | string): Promise<TagDto> => {
    const name = typeof payload === 'string' ? payload : payload.name
    try {
      const created = await kanbanApi.createTag({ name })
      const exists = options.availableTags.value.some(
        t => sameId(t.id, created.id) || t.name.toLowerCase() === created.name.toLowerCase(),
      )
      if (!exists) {
        options.availableTags.value.push(created)
      }
      options.onAfterTagCreate?.(created)
      return created
    } catch (err) {
      notify.error(err, 'Unable to create tag')
      throw err
    }
  }

  const performTaskUpdate = async (
    taskId: string | number,
    payload: TaskUpdatePayload,
  ): Promise<boolean> => {
    const targetTask = options.findTask(taskId)
    if (!targetTask) return false

    const restoreSnapshot = options.createSnapshot
      ? options.createSnapshot()
      : createTaskSnapshot(targetTask)

    const currentColumnId = targetTask.columnId ?? (targetTask as { column_id?: string | number }).column_id
    const destinationColumnId =
      payload.columnId != null
        ? payload.columnId
        : currentColumnId
    const isColumnChanged =
      destinationColumnId != null &&
      (currentColumnId == null || !sameId(currentColumnId, destinationColumnId))

    let targetPosition = 0
    if (isColumnChanged) {
      if (options.moveTaskLocally) {
        const movedPosition = options.moveTaskLocally(targetTask, destinationColumnId!)
        if (movedPosition === null) {
          notify.error(new Error('Destination column not found'), 'Unable to update task')
          return false
        }
        targetPosition = movedPosition
      } else {
        targetTask.columnId = destinationColumnId!
      }
    }

    // Optimistic update of task fields
    applyTaskUpdates(targetTask, payload)

    try {
      const updatePromise = kanbanApi.updateTask(taskId, buildTaskUpdatePayload(payload))
      let updateResult: KanbanTaskDto | undefined
      let moveResult: KanbanTaskDto | undefined

      if (isColumnChanged) {
        const movePromise = kanbanApi.moveTask(taskId, {
          toColumnId: destinationColumnId!,
          targetPosition,
        })
        const [patchRes, moveRes] = await Promise.all([updatePromise, movePromise])
        updateResult = patchRes
        moveResult = moveRes
      } else {
        updateResult = await updatePromise
      }

      notify.success('Task updated.')
      if (updateResult) {
        syncTaskFields(targetTask, updateResult)
        if (updateResult.timer !== undefined) {
          targetTask.timer =
            updateResult.timer && updateResult.timer.mode !== 'NONE' ? updateResult.timer : null
        }
      }

      if (isColumnChanged) {
        targetTask.columnId = moveResult?.columnId ?? destinationColumnId!
        const finalPosition = moveResult?.position ?? updateResult?.position
        if (finalPosition !== undefined) {
          targetTask.position = finalPosition
        }
      } else {
        if (updateResult?.position !== undefined) {
          targetTask.position = updateResult.position
        }
        if (updateResult?.columnId != null) {
          targetTask.columnId = updateResult.columnId
        }
      }

      const reconciledServerTask =
        isColumnChanged && moveResult
          ? ({
              ...updateResult,
              ...moveResult,
              columnId: targetTask.columnId,
              position: targetTask.position,
            } as KanbanTaskDto)
          : updateResult

      options.onAfterTaskUpdate?.(targetTask, reconciledServerTask)
      return true
    } catch (err) {
      restoreSnapshot()
      notify.error(err, 'Unable to update task')
      return false
    }
  }

  const updateTask = async (
    taskId: string | number,
    payload: TaskUpdatePayload,
  ): Promise<void> => {
    await performTaskUpdate(taskId, payload)
  }

  const saveTask = async (savePayload: TaskDialogSavePayload): Promise<void> => {
    if (savePayload.mode === 'create' && savePayload.columnId != null) {
      if (options.onCreateTask) {
        await options.onCreateTask(savePayload.columnId, {
          title: savePayload.title,
          description: savePayload.description,
          priority: savePayload.priority,
          tags: savePayload.tags,
          tagIds: savePayload.tagIds,
          dueAt: savePayload.dueAt,
          reminderOffsetSeconds: savePayload.reminderOffsetSeconds,
          recurrence: savePayload.recurrence,
          timer: savePayload.timer,
        })
      }
      return
    }

    if (savePayload.mode === 'edit' && savePayload.taskId != null) {
      const updateTaskPayload: TaskUpdatePayload = {
        title: savePayload.title,
        description: savePayload.description,
        priority: savePayload.priority,
        tags: savePayload.tags,
        tagIds: savePayload.tagIds,
        columnId: savePayload.columnId,
        applyToFuture: savePayload.applyToFuture,
        timer: savePayload.timer,
      }
      if (savePayload.dueAt !== undefined) {
        updateTaskPayload.dueAt = savePayload.dueAt
      }
      if (savePayload.reminderOffsetSeconds !== undefined) {
        updateTaskPayload.reminderOffsetSeconds = savePayload.reminderOffsetSeconds
      }
      if (savePayload.recurrence) {
        updateTaskPayload.recurrence = savePayload.recurrence
      }
      if (savePayload.timer?.mode !== undefined) {
        updateTaskPayload.timerMode = savePayload.timer.mode
        updateTaskPayload.targetDurationSeconds = savePayload.timer.targetDurationSeconds ?? null
      }

      const updated = await performTaskUpdate(savePayload.taskId, updateTaskPayload)

      // If recurrence was turned off on an existing recurring task, deactivate it
      if (updated && savePayload.recurrence === null && savePayload.recurringTaskId != null) {
        try {
          await kanbanApi.updateRecurringTask(savePayload.recurringTaskId, { isActive: false })
          const target = options.findTask(savePayload.taskId)
          if (target && target.recurringTask) {
            target.recurringTask.isActive = false
          }
        } catch (err) {
          notify.error(err, 'Unable to deactivate recurring schedule')
        }
      }
    }
  }

  const deleteTask = async (
    taskId: string | number,
    deleteOptions?: { cancelRecurrence?: boolean },
  ): Promise<void> => {
    const targetTask = options.findTask(taskId)
    if (!targetTask) return

    const restoreSnapshot = options.createSnapshot?.()

    if (options.removeTaskLocally) {
      const removed = options.removeTaskLocally(taskId)
      if (!removed) return
    }

    try {
      await kanbanApi.deleteTask(taskId, deleteOptions)
      notify.success('Task deleted.')
      options.onAfterTaskDelete?.(taskId)
    } catch (err) {
      restoreSnapshot?.()
      notify.error(err, 'Unable to delete task')
    }
  }

  const recentAlerts = new Map<string, number>()
  const recentlyStoppedTasks = new Map<string, number>()

  const persistTaskTimer = async (
    task: KanbanTaskDto,
    taskId: string | number,
    timerPayload: TaskTimerDto,
    errorSummary: string,
  ): Promise<boolean> => {
    try {
      const persisted = await kanbanApi.updateTaskTimer(taskId, timerPayload)
      if (persisted) {
        task.timer = {
          ...task.timer,
          ...persisted,
          taskId,
        }
        options.onAfterTimerChange?.(task)
      }
      return true
    } catch (err) {
      notify.error(err, errorSummary)
      return false
    }
  }

  const setTaskTotal = (taskId: string | number, totalSeconds: number): void => {
    const task = options.findTask(taskId)
    const previousTotal = task ? (task.totalSeconds ?? 0) : undefined
    if (task) {
      task.totalSeconds = totalSeconds
    }
    const changed = previousTotal !== undefined ? previousTotal !== totalSeconds : true
    options.onAfterTaskTotalChange?.(taskId, totalSeconds, changed)
  }

  const setTaskTimeEntries = (taskId: string | number, entries: TaskTimeEntryDto[]): void => {
    const task = options.findTask(taskId)
    if (!task) return
    task.timeEntries = entries
  }

  /** Reload a task's time entries and update its local state and total. */
  const refreshTaskTotal = async (taskId: string | number): Promise<void> => {
    try {
      const entries = await kanbanApi.listTimeEntries(taskId)
      setTaskTimeEntries(taskId, entries)
      setTaskTotal(taskId, sumEntryDurations(entries))
    } catch {
      // Keep the previous total; the next refresh corrects it.
    }
  }

  const handleTimerExpired = (task: KanbanTaskDto, _entry?: TaskTimeEntryDto): void => {
    const key = String(task.id)
    const lastAlertTime = recentAlerts.get(key)
    const now = Date.now()
    if (lastAlertTime !== undefined && now - lastAlertTime < 3000) {
      return
    }
    recentAlerts.set(key, now)
    notify.timerComplete(task.title)
  }

  const startTimer = async (
    taskId: string | number,
    defaultTimer?: Partial<TaskTimerDto>,
  ): Promise<void> => {
    const task = options.findTask(taskId)
    if (!task) return

    const nowIso = new Date().toISOString()
    const isResuming = task.timer?.state === 'PAUSED' && Boolean(task.timer?.startedAt)
    const sessionStartedAt = isResuming ? task.timer!.startedAt : (defaultTimer?.startedAt || nowIso)

    const updatedTimer: TaskTimerDto = {
      taskId,
      mode: defaultTimer?.mode || task.timer?.mode || 'COUNT_DOWN',
      targetDurationSeconds: defaultTimer?.targetDurationSeconds ?? task.timer?.targetDurationSeconds ?? 1500,
      state: 'RUNNING',
      startedAt: sessionStartedAt,
      lastResumedAt: nowIso,
      lastPausedAt: null,
      elapsedSeconds: task.timer?.elapsedSeconds || 0,
    }

    task.timer = { ...updatedTimer }
    options.onAfterTimerChange?.(task)

    await persistTaskTimer(task, taskId, updatedTimer, 'Unable to start timer')
  }

  const pauseTimer = async (taskId: string | number): Promise<void> => {
    const task = options.findTask(taskId)
    if (!task || !task.timer) return

    const currentTimer = task.timer
    const nowIso = new Date().toISOString()
    const pausedTimer: TaskTimerDto = {
      ...currentTimer,
      state: 'PAUSED',
      startedAt: currentTimer.startedAt,
      lastResumedAt: null,
      lastPausedAt: nowIso,
      elapsedSeconds: computeAccumulatedSeconds(currentTimer),
    }

    task.timer = { ...pausedTimer }
    options.onAfterTimerChange?.(task)

    await persistTaskTimer(task, taskId, pausedTimer, 'Unable to pause timer')
  }

  const stopTimer = async (
    taskId: string | number,
    entry?: TaskTimeEntryDto,
  ): Promise<void> => {
    const key = String(taskId)
    const lastStopped = recentlyStoppedTasks.get(key)
    const now = Date.now()
    if (lastStopped !== undefined && now - lastStopped < 2000) {
      return
    }
    recentlyStoppedTasks.set(key, now)

    const task = options.findTask(taskId)
    if (!task || !task.timer) return
    if (task.timer.state === 'IDLE') return

    const currentTimer = task.timer
    const idleTimer: TaskTimerDto = {
      ...currentTimer,
      state: 'IDLE',
      startedAt: null,
      lastResumedAt: null,
      lastPausedAt: null,
      elapsedSeconds: computeAccumulatedSeconds(currentTimer),
    }

    task.timer = {
      ...idleTimer,
      elapsedSeconds: 0,
    }
    options.onAfterTimerChange?.(task)

    if (entry) {
      handleTimerExpired(task, entry)
    }

    const ok = await persistTaskTimer(task, taskId, idleTimer, 'Unable to stop timer')
    if (!ok) return

    // Stopping saves the session as a time entry on the server.
    await refreshTaskTotal(taskId)
  }

  return {
    updateTask,
    deleteTask,
    saveTask,
    createTag,
    startTimer,
    pauseTimer,
    stopTimer,
    setTaskTotal,
    setTaskTimeEntries,
    refreshTaskTotal,
    handleTimerExpired,
  }
}

import type { Ref } from 'vue'
import type {
  KanbanBoardDto,
  KanbanColumnDto,
  KanbanTaskDto,
  TagDto,
  TaskFeedItemDto,
} from '~/api/kanban'
import {
  reindexTasks,
  sameId,
  syncTaskFields,
} from '~/composables/useKanbanTaskActions'

export interface BoardTaskLocation {
  board: KanbanBoardDto
  column: KanbanColumnDto
  index: number
  task: KanbanTaskDto
}

export interface UseTaskFeedSyncOptions {
  boards: Ref<KanbanBoardDto[]>
  feedTasks: Ref<TaskFeedItemDto[]>
  userTags: Ref<TagDto[]>
  activeTask: Ref<TaskFeedItemDto | null>
}

/** Coordinate cross-board state synchronization between the Task Feed rail and board cards. */
export function useTaskFeedSync({
  boards,
  feedTasks,
  userTags,
  activeTask,
}: UseTaskFeedSyncOptions) {
  const findFeedTask = (taskId: string | number): TaskFeedItemDto | undefined => {
    return feedTasks.value.find(task => sameId(task.id, taskId))
  }

  const findBoardTaskLocation = (
    taskId: string | number,
    boardId?: string | number,
  ): BoardTaskLocation | undefined => {
    const targetBoards = boardId != null
      ? boards.value.filter(board => sameId(board.id, boardId))
      : boards.value

    for (const board of targetBoards) {
      for (const column of board.columns || []) {
        const index = (column.tasks || []).findIndex(task => sameId(task.id, taskId))
        if (index !== -1) {
          return {
            board,
            column,
            index,
            task: column.tasks[index]!,
          }
        }
      }
    }
    return undefined
  }

  const syncUpdatedTask = (feedTask: TaskFeedItemDto, updatedFromServer?: KanbanTaskDto): void => {
    const timestamp = updatedFromServer?.updatedAt ?? new Date().toISOString()
    feedTask.updatedAt = timestamp
    if (updatedFromServer?.totalSeconds !== undefined) {
      feedTask.totalSeconds = updatedFromServer.totalSeconds
    }
    if (updatedFromServer?.reminderAt !== undefined) {
      feedTask.reminderAt = updatedFromServer.reminderAt
    }
    if (updatedFromServer?.reminderSentAt !== undefined) {
      feedTask.reminderSentAt = updatedFromServer.reminderSentAt
    }

    const parentBoard = boards.value.find(board => sameId(board.id, feedTask.boardId))
    const matchedColumn = parentBoard?.columns?.find(col => sameId(col.id, feedTask.columnId))
    if (matchedColumn) {
      feedTask.columnTitle = matchedColumn.title
    }

    const boardLocation = findBoardTaskLocation(feedTask.id, feedTask.boardId)
    if (boardLocation) {
      const boardTask = boardLocation.task
      syncTaskFields(boardTask, feedTask)
      boardTask.columnId = feedTask.columnId
      boardTask.position = feedTask.position
      boardTask.updatedAt = timestamp
      boardTask.timer = feedTask.timer ? { ...feedTask.timer } : null
    }
  }

  const createSnapshot = (): (() => void) => {
    const feedSnapshot = JSON.parse(JSON.stringify(feedTasks.value)) as TaskFeedItemDto[]
    const boardsSnapshot = JSON.parse(JSON.stringify(boards.value)) as KanbanBoardDto[]
    const activeTaskId = activeTask.value?.id
    return () => {
      feedTasks.value = feedSnapshot
      boards.value = boardsSnapshot
      if (activeTaskId != null) {
        activeTask.value = feedTasks.value.find(t => sameId(t.id, activeTaskId)) ?? null
      }
    }
  }

  const moveTaskLocally = (
    task: KanbanTaskDto,
    destinationColumnId: string | number,
  ): number | null => {
    const feedTask = task as TaskFeedItemDto
    const board = boards.value.find(b => sameId(b.id, feedTask.boardId))
    const destCol = board?.columns?.find(col => sameId(col.id, destinationColumnId))
    if (!board || !destCol) return null

    feedTask.columnId = destCol.id
    feedTask.columnTitle = destCol.title

    let existingBoardTask: KanbanTaskDto | undefined
    for (const col of board.columns) {
      const idx = (col.tasks || []).findIndex(t => sameId(t.id, feedTask.id))
      if (idx !== -1) {
        existingBoardTask = col.tasks.splice(idx, 1)[0]
        reindexTasks(col.tasks)
        break
      }
    }

    if (!destCol.tasks) destCol.tasks = []
    const targetPosition = destCol.tasks.length
    const movedBoardTask: KanbanTaskDto = existingBoardTask
      ? { ...existingBoardTask, columnId: destCol.id, position: targetPosition }
      : { ...feedTask, columnId: destCol.id, position: targetPosition }
    destCol.tasks.push(movedBoardTask)
    reindexTasks(destCol.tasks)
    feedTask.position = targetPosition
    return targetPosition
  }

  const removeTaskLocally = (taskId: string | number): boolean => {
    const feedIndex = feedTasks.value.findIndex(t => sameId(t.id, taskId))
    if (feedIndex === -1) return false
    const [removed] = feedTasks.value.splice(feedIndex, 1)
    if (removed) {
      const location = findBoardTaskLocation(taskId, removed.boardId)
      if (location) {
        location.column.tasks.splice(location.index, 1)
        reindexTasks(location.column.tasks)
      }
    }
    if (activeTask.value && sameId(activeTask.value.id, taskId)) {
      activeTask.value = null
    }
    return true
  }

  const onAfterTaskUpdate = (task: KanbanTaskDto, updatedFromServer?: KanbanTaskDto): void => {
    syncUpdatedTask(task as TaskFeedItemDto, updatedFromServer)
  }

  const onAfterTagCreate = (created: TagDto): void => {
    const exists = userTags.value.some(
      tag => sameId(tag.id, created.id) || tag.name.toLowerCase() === created.name.toLowerCase(),
    )
    if (!exists) {
      userTags.value = [...userTags.value, created]
    }
  }

  const onAfterTimerChange = (task: KanbanTaskDto): void => {
    const feedTask = task as TaskFeedItemDto
    const timestamp = new Date().toISOString()
    feedTask.updatedAt = timestamp
    const boardTask = findBoardTaskLocation(feedTask.id, feedTask.boardId)?.task
    if (boardTask) {
      boardTask.timer = feedTask.timer ? { ...feedTask.timer } : null
      boardTask.updatedAt = timestamp
    }
  }

  const onAfterTaskTotalChange = (
    taskId: string | number,
    totalSeconds: number,
    changed: boolean,
  ): void => {
    const feedTask = findFeedTask(taskId)
    if (feedTask) {
      feedTask.totalSeconds = totalSeconds
    }
    const boardTask = findBoardTaskLocation(taskId, feedTask?.boardId)?.task
    if (boardTask) {
      boardTask.totalSeconds = totalSeconds
    }
    if (!changed) return

    const timestamp = new Date().toISOString()
    if (feedTask) {
      feedTask.updatedAt = timestamp
    }
    if (boardTask) {
      boardTask.updatedAt = timestamp
    }
  }

  return {
    findFeedTask,
    findBoardTaskLocation,
    syncUpdatedTask,
    createSnapshot,
    moveTaskLocally,
    removeTaskLocally,
    onAfterTaskUpdate,
    onAfterTagCreate,
    onAfterTimerChange,
    onAfterTaskTotalChange,
  }
}

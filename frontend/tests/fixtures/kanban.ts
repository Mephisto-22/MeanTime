import { vi } from 'vitest'
import { computed } from 'vue'
import type { UserOut } from '~/api/friends'
import type {
  KanbanBoardDto,
  KanbanColumnDto,
  KanbanColumnSummary,
  KanbanContext,
  KanbanTaskDto,
  TagDto,
  TaskFeedItemDto,
} from '~/api/kanban'

let nextTaskId = 1
let nextColumnId = 1
let nextBoardId = 1
let nextTagId = 1

export function createTagFixture(overrides: Partial<TagDto> = {}): TagDto {
  const id = overrides.id ?? `tag-${nextTagId++}`
  return {
    id,
    name: overrides.name ?? `Tag ${id}`,
    createdAt: overrides.createdAt,
  }
}

export function createTaskFixture(overrides: Partial<KanbanTaskDto> = {}): KanbanTaskDto {
  const id = overrides.id ?? `task-${nextTaskId++}`
  return {
    id,
    title: overrides.title ?? `Task ${id}`,
    position: overrides.position ?? 0,
    columnId: overrides.columnId ?? 'col-1',
    description: overrides.description,
    priority: overrides.priority,
    tags: overrides.tags,
    timer: overrides.timer,
    totalSeconds: overrides.totalSeconds,
    recurringTaskId: overrides.recurringTaskId,
    recurringTask: overrides.recurringTask,
    dueAt: overrides.dueAt,
    reminderOffsetSeconds: overrides.reminderOffsetSeconds,
    reminderAt: overrides.reminderAt,
    reminderSentAt: overrides.reminderSentAt,
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt,
  }
}

export function createTaskFeedItemFixture(overrides: Partial<TaskFeedItemDto> = {}): TaskFeedItemDto {
  const baseTask = createTaskFixture(overrides)
  return {
    ...baseTask,
    boardId: overrides.boardId ?? 'board-1',
    boardTitle: overrides.boardTitle ?? 'Board 1',
    columnTitle: overrides.columnTitle ?? 'To Do',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00Z',
  }
}

export function createColumnFixture(overrides: Partial<KanbanColumnDto> = {}): KanbanColumnDto {
  const id = overrides.id ?? `col-${nextColumnId++}`
  return {
    id,
    title: overrides.title ?? `Column ${id}`,
    position: overrides.position ?? 0,
    boardId: overrides.boardId ?? 'board-1',
    autoClearDurationSeconds: overrides.autoClearDurationSeconds ?? null,
    tasks: overrides.tasks ?? [],
  }
}

export function createBoardFixture(overrides: Partial<KanbanBoardDto> = {}): KanbanBoardDto {
  const id = overrides.id ?? `board-${nextBoardId++}`
  const columns = overrides.columns ?? [
    createColumnFixture({ id: `col-${id}-1`, title: 'To Do', position: 0, boardId: id }),
    createColumnFixture({ id: `col-${id}-2`, title: 'In Progress', position: 1, boardId: id }),
    createColumnFixture({ id: `col-${id}-3`, title: 'Done', position: 2, boardId: id }),
  ]

  return {
    id,
    title: overrides.title ?? `Board ${id}`,
    description: overrides.description,
    isOwner: overrides.isOwner ?? true,
    columns,
  }
}


export const DialogStub = {
  name: 'Dialog',
  props: ['visible', 'header'],
  template: '<div v-if="visible" data-testid="task-dialog" class="p-dialog" :data-header="header"><slot /></div>',
}

export function createKanbanContextMock(overrides: Partial<KanbanContext> = {}): KanbanContext {
  return {
    columns: computed<KanbanColumnSummary[]>(() => []),
    availableTags: computed<TagDto[]>(() => []),
    isShared: computed<boolean>(() => false),
    boardMembers: computed<UserOut[]>(() => []),
    createTag: vi.fn(),
    moveTask: vi.fn(),
    openCreateTaskDialog: vi.fn(),
    openEditTaskDialog: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    startTimer: vi.fn(),
    pauseTimer: vi.fn(),
    stopTimer: vi.fn(),
    setTaskTotal: vi.fn(),
    onTimerExpired: vi.fn(),
    ...overrides,
  }
}

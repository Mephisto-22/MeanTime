import type { KanbanBoardDto, KanbanColumnDto, KanbanTaskDto, TagDto } from '~/api/kanban'

let nextTaskId = 1
let nextColumnId = 1
let nextBoardId = 1
let nextTagId = 1

export function createTagFixture(overrides: Partial<TagDto> = {}): TagDto {
  const id = overrides.id ?? `tag-${nextTagId++}`
  return {
    id,
    name: overrides.name ?? `Tag ${id}`,
    created_at: overrides.created_at,
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
  }
}

export function createColumnFixture(overrides: Partial<KanbanColumnDto> = {}): KanbanColumnDto {
  const id = overrides.id ?? `col-${nextColumnId++}`
  return {
    id,
    title: overrides.title ?? `Column ${id}`,
    position: overrides.position ?? 0,
    boardId: overrides.boardId ?? 'board-1',
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
    columns,
  }
}

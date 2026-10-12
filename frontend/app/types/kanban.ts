import type { ComputedRef, InjectionKey } from 'vue'

export interface KanbanTaskDto {
  id: string | number
  name: string
  order: number
  columnId: string | number
}

export interface KanbanColumnDto {
  id: string | number
  name: string
  order: number
  boardId: string | number
  tasks: KanbanTaskDto[]
}

export interface KanbanBoardDto {
  id: string | number
  name: string
  description?: string
  columns: KanbanColumnDto[]
}

export interface TaskMoveRequest {
  taskId: string | number
  fromColumnId: string | number
  toColumnId: string | number
  targetOrder: number
}

export interface KanbanColumnSummary {
  id: string | number
  name: string
  order: number
}

export interface KanbanContext {
  columns: ComputedRef<KanbanColumnSummary[]>
  moveTask: (req: TaskMoveRequest) => Promise<void> | void
}

export const kanbanContextKey: InjectionKey<KanbanContext> = Symbol('kanbanContext')

import type { ComputedRef, InjectionKey } from 'vue'
import { mockKanbanBoard } from '~/mocks/kanban'

export interface KanbanTaskDto {
  id: string | number
  title: string
  description?: string
  position: number
  columnId: string | number
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
  taskId: string | number
  fromColumnId: string | number
  toColumnId: string | number
  targetOrder: number
}

export interface KanbanColumnSummary {
  id: string | number
  title: string
  position: number
}

export interface KanbanContext {
  columns: ComputedRef<KanbanColumnSummary[]>
  moveTask: (req: TaskMoveRequest) => Promise<void> | void
}

export const kanbanContextKey: InjectionKey<KanbanContext> = Symbol('kanbanContext')

export class KanbanApi {
  readonly endpoint = '/api/kanban'

  /**
   * Asynchronously retrieves a Kanban board by ID.
   * Resolves against decoupled mock fixtures until backend Ninja endpoints are connected.
   */
  async getBoard(_id: string | number): Promise<KanbanBoardDto> {
    return Promise.resolve(JSON.parse(JSON.stringify(mockKanbanBoard)))
  }

  /**
   * Asynchronously persists a task relocation across columns.
   * Simulates asynchronous persistence; designed to transition to apiService.patch/post.
   */
  async moveTask(_req: TaskMoveRequest): Promise<void> {
    return Promise.resolve()
  }
}

export const kanbanApi = new KanbanApi()

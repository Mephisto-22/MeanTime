import type { KanbanBoardDto, TaskMoveRequest } from '~/types/kanban'
import { mockKanbanBoard } from '~/mocks/kanban'

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

import type { KanbanBoardDto } from '~/types/kanban'
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
}

export const kanbanApi = new KanbanApi()

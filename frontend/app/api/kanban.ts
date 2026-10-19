import type { ComputedRef, InjectionKey } from 'vue'
import { apiService } from '~/services/ApiService'

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

/** A board as shown on the board selection page, without its columns and tasks. */
export interface KanbanBoardSummary {
  id: number
  name: string
  description: string
}

/** The fields a user can set when creating or editing a board. */
export interface KanbanBoardInput {
  name: string
  description: string
}

// Shapes sent and returned by the backend (backend/kanban/schemas.py). The
// backend calls names `title` and orders `position`; the mappers below turn
// them into the frontend's `name` and `order`.
interface TaskResponse {
  id: number
  title: string
  description: string
  position: number
  column_id: number
}

interface ColumnResponse {
  id: number
  title: string
  position: number
  board_id: number
  tasks: TaskResponse[]
}

interface BoardResponse {
  id: number
  title: string
  description: string
  columns: ColumnResponse[]
}

interface BoardRequest {
  title: string
  description: string
}

const toBoardSummary = (board: BoardResponse): KanbanBoardSummary => ({
  id: board.id,
  name: board.title,
  description: board.description,
})

const toBoardRequest = (input: KanbanBoardInput): BoardRequest => ({
  title: input.name,
  description: input.description,
})

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

const toBoardDto = (board: BoardResponse): KanbanBoardDto => ({
  id: board.id,
  name: board.title,
  description: board.description,
  columns: [...board.columns].sort(byPosition).map(column => ({
    id: column.id,
    name: column.title,
    order: column.position,
    boardId: column.board_id,
    tasks: [...column.tasks].sort(byPosition).map(task => ({
      id: task.id,
      name: task.title,
      order: task.position,
      columnId: task.column_id,
    })),
  })),
})

export interface KanbanContext {
  columns: ComputedRef<KanbanColumnSummary[]>
  moveTask: (req: TaskMoveRequest) => Promise<void> | void
}

export const kanbanContextKey: InjectionKey<KanbanContext> = Symbol('kanbanContext')

export class KanbanApi {
  readonly endpoint = '/api/kanban'

  /**
   * Lists the boards owned by the logged-in user.
   */
  async listBoards(): Promise<KanbanBoardSummary[]> {
    const boards = await apiService.get<BoardResponse[]>(`${this.endpoint}/boards`)
    return boards.map(toBoardSummary)
  }

  /**
   * Creates a board for the logged-in user and returns it with its new id.
   */
  async createBoard(input: KanbanBoardInput): Promise<KanbanBoardSummary> {
    const board = await apiService.post<BoardResponse>(`${this.endpoint}/boards`, toBoardRequest(input))
    return toBoardSummary(board)
  }

  /**
   * Saves a new name and description for an existing board.
   */
  async updateBoard(id: number, input: KanbanBoardInput): Promise<KanbanBoardSummary> {
    const board = await apiService.patch<BoardResponse>(`${this.endpoint}/boards/${id}`, toBoardRequest(input))
    return toBoardSummary(board)
  }

  /**
   * Retrieves one of the logged-in user's boards with its columns and tasks.
   */
  async getBoard(id: string | number): Promise<KanbanBoardDto> {
    const board = await apiService.get<BoardResponse>(`${this.endpoint}/boards/${id}`)
    return toBoardDto(board)
  }

  /**
   * Saves a task's new column and position after it is dragged.
   */
  async moveTask(req: TaskMoveRequest): Promise<void> {
    // Ids read back from the DOM during a drag arrive as strings.
    await apiService.post(`${this.endpoint}/tasks/${req.taskId}/move`, {
      to_column_id: Number(req.toColumnId),
      target_position: req.targetOrder,
    })
  }
}

export const kanbanApi = new KanbanApi()

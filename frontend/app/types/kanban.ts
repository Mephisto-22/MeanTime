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

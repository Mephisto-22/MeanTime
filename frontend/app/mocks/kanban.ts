import type { KanbanBoardDto, KanbanColumnDto, KanbanTaskDto } from '~/api/kanban'

export const mockTasks: KanbanTaskDto[] = [
  { id: 'task-1', name: 'Design responsive layout', order: 0, columnId: 'col-1' },
  { id: 'task-2', name: 'Define TypeScript contracts', order: 1, columnId: 'col-1' },
  { id: 'task-3', name: 'Implement component hierarchy', order: 2, columnId: 'col-1' },
  { id: 'task-4', name: 'Integrate PrimeVue theme', order: 0, columnId: 'col-2' },
  { id: 'task-5', name: 'Configure horizontal scroll track', order: 1, columnId: 'col-2' },
  { id: 'task-6', name: 'Setup Docker compose environment', order: 0, columnId: 'col-4' },
]

export const mockColumns: KanbanColumnDto[] = [
  {
    id: 'col-1',
    name: 'To Do',
    order: 0,
    boardId: 'board-1',
    tasks: mockTasks.filter(t => t.columnId === 'col-1'),
  },
  {
    id: 'col-2',
    name: 'In Progress',
    order: 1,
    boardId: 'board-1',
    tasks: mockTasks.filter(t => t.columnId === 'col-2'),
  },
  {
    id: 'col-3',
    name: 'Review',
    order: 2,
    boardId: 'board-1',
    tasks: [],
  },
  {
    id: 'col-4',
    name: 'Done',
    order: 3,
    boardId: 'board-1',
    tasks: mockTasks.filter(t => t.columnId === 'col-4'),
  },
]

export const mockKanbanBoard: KanbanBoardDto = {
  id: 'board-1',
  name: 'Sprint Roadmap',
  description: 'Team sprint workflow and task prioritization tracking.',
  columns: mockColumns,
}

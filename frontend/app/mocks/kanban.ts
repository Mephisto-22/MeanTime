import type { KanbanBoardDto, KanbanColumnDto, KanbanTaskDto } from '~/api/kanban'

export const mockTasks: KanbanTaskDto[] = [
  { id: 'task-1', title: 'Design responsive layout', position: 0, columnId: 'col-1' },
  { id: 'task-2', title: 'Define TypeScript contracts', position: 1, columnId: 'col-1' },
  { id: 'task-3', title: 'Implement component hierarchy', position: 2, columnId: 'col-1' },
  { id: 'task-4', title: 'Integrate PrimeVue theme', position: 0, columnId: 'col-2' },
  { id: 'task-5', title: 'Configure horizontal scroll track', position: 1, columnId: 'col-2' },
  { id: 'task-6', title: 'Setup Docker compose environment', position: 0, columnId: 'col-4' },
]

export const mockColumns: KanbanColumnDto[] = [
  {
    id: 'col-1',
    title: 'To Do',
    position: 0,
    boardId: 'board-1',
    tasks: mockTasks.filter(t => t.columnId === 'col-1'),
  },
  {
    id: 'col-2',
    title: 'In Progress',
    position: 1,
    boardId: 'board-1',
    tasks: mockTasks.filter(t => t.columnId === 'col-2'),
  },
  {
    id: 'col-3',
    title: 'Review',
    position: 2,
    boardId: 'board-1',
    tasks: [],
  },
  {
    id: 'col-4',
    title: 'Done',
    position: 3,
    boardId: 'board-1',
    tasks: mockTasks.filter(t => t.columnId === 'col-4'),
  },
]

export const mockKanbanBoard: KanbanBoardDto = {
  id: 'board-1',
  title: 'Sprint Roadmap',
  description: 'Team sprint workflow and task prioritization tracking.',
  columns: mockColumns,
}

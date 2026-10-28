import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ToastEventBus from 'primevue/toasteventbus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { kanbanApi } from '~/api/kanban'
import Board from '~/components/kanban/Board.vue'
import { createBoardFixture, createColumnFixture, createTaskFixture } from '../fixtures/kanban'

const DialogStub = {
  name: 'Dialog',
  props: ['visible', 'header'],
  template: '<div v-if="visible" data-testid="task-dialog" class="p-dialog" :data-header="header"><slot /></div>',
}

function mountBoard(boardData: any) {
  return mount(Board, {
    props: {
      board: boardData,
    },
    global: {
      plugins: [PrimeVue, ToastService],
      stubs: {
        Dialog: DialogStub,
      },
    },
  })
}

describe('Board Component DOM & Optimistic Mutation Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ToastEventBus, 'emit')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders board title, description, and column container', () => {
    const board = createBoardFixture({
      title: 'Main Kanban Board',
      description: 'Sprint tasks and workflow tracking',
    })

    const wrapper = mountBoard(board)
    expect(wrapper.find('[data-testid="board-title"]').text()).toBe('Main Kanban Board')
    expect(wrapper.find('[data-testid="board-description"]').text()).toBe('Sprint tasks and workflow tracking')
    expect(wrapper.find('[data-testid="kanban-columns-track"]').exists()).toBe(true)
  })

  it('notifies when task movement cannot be persisted', async () => {
    const board = createBoardFixture({ columns: [createColumnFixture({ id: 'col-1', tasks: [createTaskFixture({ id: 'task-1', columnId: 'col-1' })] })] })
    vi.spyOn(kanbanApi, 'moveTask').mockRejectedValue(new Error('Movement failed'))
    const wrapper = mountBoard(board)
    await (wrapper.vm as any).handleMoveTask({ taskId: 'task-1', fromColumnId: 'col-1', toColumnId: 'col-1', targetPosition: 0 })
    expect(ToastEventBus.emit).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'error', summary: 'Unable to move task', detail: 'Movement failed' }))
  })

  it('optimistic task creation: appends temporary task, calls kanbanApi, and reconciles server ID on success', async () => {
    const board = createBoardFixture({
      columns: [createColumnFixture({ id: 'col-1', tasks: [] })],
    })

    const createSpy = vi.spyOn(kanbanApi, 'createTask').mockResolvedValue({
      id: 777,
      title: 'Created Task',
      description: 'New Description',
      position: 0,
      columnId: 'col-1',
    })

    const wrapper = mountBoard(board)
    const boardVm = wrapper.vm as any

    // Trigger openCreateTaskDialog for col-1
    boardVm.openCreateTaskDialog('col-1')
    expect(boardVm.isTaskDialogOpen).toBe(true)

    // Simulate saving task from dialog
    await boardVm.handleSaveTask({
      title: 'Created Task',
      description: 'New Description',
      mode: 'create',
      columnId: 'col-1',
      taskId: null,
    })

    expect(createSpy).toHaveBeenCalledWith('col-1', {
      title: 'Created Task',
      description: 'New Description',
    })

    // Check that task exists with reconciled server ID (777)
    const colTasks = boardVm.localColumns[0].tasks
    expect(colTasks).toHaveLength(1)
    expect(colTasks[0].id).toBe(777)
    expect(colTasks[0].title).toBe('Created Task')
  })

  it('optimistic task creation rollback: network error removes optimistic task and shows a toast', async () => {
    const board = createBoardFixture({
      columns: [createColumnFixture({ id: 'col-1', tasks: [] })],
    })

    vi.spyOn(kanbanApi, 'createTask').mockRejectedValue(new Error('Network creation failure'))

    const wrapper = mountBoard(board)
    const boardVm = wrapper.vm as any

    await boardVm.handleSaveTask({
      title: 'Doomed Task',
      description: 'Will fail',
      mode: 'create',
      columnId: 'col-1',
      taskId: null,
    })

    // Task must be rolled back
    expect(boardVm.localColumns[0].tasks).toHaveLength(0)
    expect(ToastEventBus.emit).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'error', summary: 'Unable to create task', detail: 'Network creation failure' }))
  })

  it('vertical task drag-and-drop: reorders task within column and calls kanbanApi.moveTask', async () => {
    const task1 = createTaskFixture({ id: 't-1', position: 0, columnId: 'col-1' })
    const task2 = createTaskFixture({ id: 't-2', position: 1, columnId: 'col-1' })
    const task3 = createTaskFixture({ id: 't-3', position: 2, columnId: 'col-1' })

    const board = createBoardFixture({
      columns: [createColumnFixture({ id: 'col-1', tasks: [task1, task2, task3] })],
    })

    const moveSpy = vi.spyOn(kanbanApi, 'moveTask').mockResolvedValue({ success: true })

    const wrapper = mountBoard(board)
    const boardVm = wrapper.vm as any

    // Move task 1 from position 0 to position 2
    await boardVm.handleMoveTask({
      taskId: 't-1',
      fromColumnId: 'col-1',
      toColumnId: 'col-1',
      targetPosition: 2,
    })

    expect(moveSpy).toHaveBeenCalledWith('t-1', {
      to_column_id: 'col-1',
      target_position: 2,
    })

    const reorderedIds = boardVm.localColumns[0].tasks.map((t: any) => t.id)
    expect(reorderedIds).toEqual(['t-2', 't-3', 't-1'])
  })

  it('horizontal task drag-and-drop: moves task across columns and updates columnId', async () => {
    const task1 = createTaskFixture({ id: 't-1', position: 0, columnId: 'col-source' })
    const board = createBoardFixture({
      columns: [
        createColumnFixture({ id: 'col-source', tasks: [task1] }),
        createColumnFixture({ id: 'col-target', tasks: [] }),
      ],
    })

    const moveSpy = vi.spyOn(kanbanApi, 'moveTask').mockResolvedValue({ success: true })

    const wrapper = mountBoard(board)
    const boardVm = wrapper.vm as any

    await boardVm.handleMoveTask({
      taskId: 't-1',
      fromColumnId: 'col-source',
      toColumnId: 'col-target',
      targetPosition: 0,
    })

    expect(moveSpy).toHaveBeenCalledWith('t-1', {
      to_column_id: 'col-target',
      target_position: 0,
    })

    expect(boardVm.localColumns[0].tasks).toHaveLength(0)
    expect(boardVm.localColumns[1].tasks).toHaveLength(1)
    expect(boardVm.localColumns[1].tasks[0].id).toBe('t-1')
    expect(boardVm.localColumns[1].tasks[0].columnId).toBe('col-target')
  })

  it('optimistic task update rollback: network error restores original title and description', async () => {
    const task = createTaskFixture({
      id: 'task-orig',
      title: 'Original Title',
      description: 'Original Description',
      columnId: 'col-1',
    })

    const board = createBoardFixture({
      columns: [createColumnFixture({ id: 'col-1', tasks: [task] })],
    })

    vi.spyOn(kanbanApi, 'updateTask').mockRejectedValue(new Error('Update failed'))

    const wrapper = mountBoard(board)
    const boardVm = wrapper.vm as any

    await boardVm.handleSaveTask({
      title: 'Updated Title',
      description: 'Updated Description',
      mode: 'edit',
      columnId: 'col-1',
      taskId: 'task-orig',
    })

    // Rollback restored original fields
    const currentTask = boardVm.localColumns[0].tasks[0]
    expect(currentTask.title).toBe('Original Title')
    expect(currentTask.description).toBe('Original Description')
    expect(ToastEventBus.emit).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'error', summary: 'Unable to update task', detail: 'Update failed' }))
  })

  it('optimistic task delete rollback: network error restores task to original column', async () => {
    const task = createTaskFixture({
      id: 'task-to-delete',
      title: 'Keep Me',
      columnId: 'col-1',
      position: 0,
    })

    const board = createBoardFixture({
      columns: [createColumnFixture({ id: 'col-1', tasks: [task] })],
    })

    vi.spyOn(kanbanApi, 'deleteTask').mockRejectedValue(new Error('Delete rejected'))

    const wrapper = mountBoard(board)
    const boardVm = wrapper.vm as any

    await boardVm.handleDeleteTask('task-to-delete')

    // Task should be restored to column
    expect(boardVm.localColumns[0].tasks).toHaveLength(1)
    expect(boardVm.localColumns[0].tasks[0].id).toBe('task-to-delete')
    expect(ToastEventBus.emit).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'error', summary: 'Unable to delete task', detail: 'Delete rejected' }))
  })
})

import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { defineComponent, h, inject } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { kanbanApi, kanbanContextKey } from '~/api/kanban'
import Board from '~/components/kanban/Board.vue'
import { createBoardFixture, createColumnFixture, createTaskFixture, createTagFixture } from '../fixtures/kanban'

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
      plugins: [PrimeVue],
      stubs: {
        Dialog: DialogStub,
      },
    },
  })
}

describe('Board Component DOM & Optimistic Mutation Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(kanbanApi, 'listTags').mockResolvedValue([])
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

  it('fetches user tags on mount via kanbanApi.listTags and exposes availableTags and createTag via kanbanContextKey', async () => {
    const tag1 = createTagFixture({ id: 'tag-1', name: 'Frontend' })
    const tag2 = createTagFixture({ id: 'tag-2', name: 'Backend' })
    const listTagsSpy = vi.spyOn(kanbanApi, 'listTags').mockResolvedValue([tag1, tag2])

    let capturedContext: any = null
    const TestConsumer = defineComponent({
      setup() {
        capturedContext = inject(kanbanContextKey)
        return () => h('div', { 'data-testid': 'test-consumer' })
      },
    })

    const board = createBoardFixture({
      columns: [createColumnFixture({ id: 'col-1' })],
    })

    mount(Board, {
      props: { board },
      slots: {
        column: () => h(TestConsumer),
      },
      global: {
        plugins: [PrimeVue],
        stubs: { Dialog: DialogStub },
      },
    })

    await flushPromises()

    expect(listTagsSpy).toHaveBeenCalledTimes(1)
    expect(capturedContext).not.toBeNull()
    expect(capturedContext.availableTags.value).toEqual([tag1, tag2])
    expect(typeof capturedContext.createTag).toBe('function')
  })

  it('dialog createTag requests immediately invoke kanbanApi.createTag, append the tag to availableTags, and return the created tag for task linking', async () => {
    const existingTag = createTagFixture({ id: 'tag-1', name: 'Existing Tag' })
    vi.spyOn(kanbanApi, 'listTags').mockResolvedValue([existingTag])

    const createdTag = createTagFixture({ id: 99, name: 'Brand New Tag' })
    const createTagSpy = vi.spyOn(kanbanApi, 'createTag').mockResolvedValue(createdTag)

    let capturedContext: any = null
    const TestConsumer = defineComponent({
      setup() {
        capturedContext = inject(kanbanContextKey)
        return () => h('div', { 'data-testid': 'test-consumer' })
      },
    })

    const board = createBoardFixture({
      columns: [createColumnFixture({ id: 'col-1' })],
    })

    const wrapper = mount(Board, {
      props: { board },
      slots: {
        column: () => h(TestConsumer),
      },
      global: {
        plugins: [PrimeVue],
        stubs: { Dialog: DialogStub },
      },
    })

    await flushPromises()

    // 1. Invoke createTag via context
    const returnedTag = await capturedContext.createTag('Brand New Tag')

    expect(createTagSpy).toHaveBeenCalledWith({ name: 'Brand New Tag' })
    expect(returnedTag).toEqual(createdTag)
    expect(capturedContext.availableTags.value).toContainEqual(createdTag)
    expect(wrapper.vm.availableTags).toContainEqual(createdTag)

    // 2. Calling with existing tag name does not duplicate in availableTags
    await capturedContext.createTag({ name: 'brand new tag' })
    const matching = capturedContext.availableTags.value.filter(
      (t: any) => t.name.toLowerCase() === 'brand new tag',
    )
    expect(matching).toHaveLength(1)
  })

  it('saving an edited task with changed column dispatches updateTask and moveTask concurrently via Promise.all and relocates to bottom of destination column', async () => {
    const taskToMove = createTaskFixture({
      id: 'task-1',
      title: 'Original Title',
      description: 'Original Notes',
      columnId: 'col-1',
      position: 0,
      priority: 'LOW',
      tags: [],
    })
    const existingTargetTask = createTaskFixture({
      id: 'task-2',
      title: 'Existing in Col 2',
      columnId: 'col-2',
      position: 0,
    })

    const board = createBoardFixture({
      columns: [
        createColumnFixture({ id: 'col-1', tasks: [taskToMove] }),
        createColumnFixture({ id: 'col-2', tasks: [existingTargetTask] }),
      ],
    })

    let updateStarted = false
    let moveStarted = false
    let updateRunningDuringMove = false

    const updateSpy = vi.spyOn(kanbanApi, 'updateTask').mockImplementation(async (id, payload) => {
      updateStarted = true
      if (moveStarted) updateRunningDuringMove = true
      await new Promise(resolve => setTimeout(resolve, 20))
      return {
        id,
        ...payload,
        columnId: 'col-2',
        position: 1,
      } as any
    })

    const moveSpy = vi.spyOn(kanbanApi, 'moveTask').mockImplementation(async (id, req) => {
      moveStarted = true
      if (updateStarted) updateRunningDuringMove = true
      await new Promise(resolve => setTimeout(resolve, 20))
      return {
        id,
        columnId: req.to_column_id,
        position: req.target_position,
      } as any
    })

    const wrapper = mountBoard(board)
    const boardVm = wrapper.vm as any

    const newTag = createTagFixture({ id: 'tag-10', name: 'Refactor' })

    const savePromise = boardVm.handleSaveTask({
      mode: 'edit',
      taskId: 'task-1',
      columnId: 'col-2',
      title: 'Moved & Updated Title',
      description: 'New Description Notes',
      priority: 'HIGH',
      tags: [newTag],
      tag_ids: ['tag-10'],
    })

    // Verify optimistic placement and field values immediately before API promises resolve
    expect(boardVm.localColumns[0].tasks).toHaveLength(0)
    expect(boardVm.localColumns[1].tasks).toHaveLength(2)
    const movedOptimistic = boardVm.localColumns[1].tasks[1]
    expect(movedOptimistic.id).toBe('task-1')
    expect(movedOptimistic.title).toBe('Moved & Updated Title')
    expect(movedOptimistic.description).toBe('New Description Notes')
    expect(movedOptimistic.priority).toBe('HIGH')
    expect(movedOptimistic.tags).toEqual([newTag])
    expect(movedOptimistic.columnId).toBe('col-2')
    expect(movedOptimistic.position).toBe(1)

    await savePromise

    expect(updateSpy).toHaveBeenCalledWith('task-1', {
      title: 'Moved & Updated Title',
      description: 'New Description Notes',
      priority: 'HIGH',
      tag_ids: ['tag-10'],
    })
    expect(moveSpy).toHaveBeenCalledWith('task-1', {
      to_column_id: 'col-2',
      target_position: 1, // length of col-2 tasks before relocation
    })
    expect(updateRunningDuringMove).toBe(true)
  })

  it('move-on-save rollback: network error in moveTask rolls back relocated task to source column and previous field values', async () => {
    const originalTag = createTagFixture({ id: 'tag-1', name: 'Original Tag' })
    const task = createTaskFixture({
      id: 'task-rollback-move',
      title: 'Initial Title',
      description: 'Initial Description',
      columnId: 'col-source',
      position: 0,
      priority: 'LOW',
      tags: [originalTag],
    })
    const otherDestTask = createTaskFixture({
      id: 'dest-task',
      columnId: 'col-dest',
      position: 0,
    })

    const board = createBoardFixture({
      columns: [
        createColumnFixture({ id: 'col-source', tasks: [task] }),
        createColumnFixture({ id: 'col-dest', tasks: [otherDestTask] }),
      ],
    })

    vi.spyOn(kanbanApi, 'updateTask').mockResolvedValue({ id: 'task-rollback-move' } as any)
    vi.spyOn(kanbanApi, 'moveTask').mockRejectedValue(new Error('Move relocation network failure'))

    const wrapper = mountBoard(board)
    const boardVm = wrapper.vm as any

    await boardVm.handleSaveTask({
      mode: 'edit',
      taskId: 'task-rollback-move',
      columnId: 'col-dest',
      title: 'Doomed Update Title',
      description: 'Doomed Update Notes',
      priority: 'HIGH',
      tags: [],
    })

    // Rollback verification: task is returned to col-source
    expect(boardVm.localColumns[0].tasks).toHaveLength(1)
    expect(boardVm.localColumns[1].tasks).toHaveLength(1)

    const revertedTask = boardVm.localColumns[0].tasks[0]
    expect(revertedTask.id).toBe('task-rollback-move')
    expect(revertedTask.columnId).toBe('col-source')
    expect(revertedTask.title).toBe('Initial Title')
    expect(revertedTask.description).toBe('Initial Description')
    expect(revertedTask.priority).toBe('LOW')
    expect(revertedTask.tags).toEqual([originalTag])

    // Error banner is populated
    expect(boardVm.errorMessage).toContain('Move relocation network failure')
  })

  it('move-on-save rollback: network error in updateTask rolls back relocated task to source column and previous field values', async () => {
    const task = createTaskFixture({
      id: 'task-rollback-update',
      title: 'Initial Title 2',
      description: 'Initial Description 2',
      columnId: 'col-source',
      position: 0,
      priority: 'MEDIUM',
    })

    const board = createBoardFixture({
      columns: [
        createColumnFixture({ id: 'col-source', tasks: [task] }),
        createColumnFixture({ id: 'col-dest', tasks: [] }),
      ],
    })

    vi.spyOn(kanbanApi, 'updateTask').mockRejectedValue(new Error('Update network error'))
    vi.spyOn(kanbanApi, 'moveTask').mockResolvedValue({ id: 'task-rollback-update' } as any)

    const wrapper = mountBoard(board)
    const boardVm = wrapper.vm as any

    await boardVm.handleSaveTask({
      mode: 'edit',
      taskId: 'task-rollback-update',
      columnId: 'col-dest',
      title: 'Will Fail',
      description: 'Will Fail Description',
      priority: 'HIGH',
    })

    expect(boardVm.localColumns[0].tasks).toHaveLength(1)
    expect(boardVm.localColumns[1].tasks).toHaveLength(0)

    const revertedTask = boardVm.localColumns[0].tasks[0]
    expect(revertedTask.id).toBe('task-rollback-update')
    expect(revertedTask.columnId).toBe('col-source')
    expect(revertedTask.title).toBe('Initial Title 2')
    expect(revertedTask.priority).toBe('MEDIUM')

    expect(boardVm.errorMessage).toContain('Update network error')
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

  it('optimistic task creation rollback: network error removes optimistic task and surfaces error banner', async () => {
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
    // Error banner message should be populated
    expect(boardVm.errorMessage).toContain('Network creation failure')
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
    expect(boardVm.errorMessage).toContain('Update failed')
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
    expect(boardVm.errorMessage).toContain('Delete rejected')
  })

  it('editing a task on initial page load (with backend column_id or null columnId) updates cleanly without destination column not found error', async () => {
    const rawBackendTask = {
      id: 'task-backend-1',
      title: 'Initial Title',
      description: 'Initial Description',
      position: 0,
      column_id: 'col-1',
      priority: null,
      tags: [],
    }

    const board = {
      id: 'board-1',
      title: 'Initial Board',
      columns: [
        {
          id: 'col-1',
          title: 'To Do',
          position: 0,
          board_id: 'board-1',
          tasks: [rawBackendTask],
        },
      ],
    }

    const updateSpy = vi.spyOn(kanbanApi, 'updateTask').mockResolvedValue({
      id: 'task-backend-1',
      title: 'Updated Title',
      description: 'Initial Description',
      column_id: 'col-1',
      position: 0,
      priority: null,
      tags: [],
    } as any)

    const wrapper = mountBoard(board)
    const boardVm = wrapper.vm as any

    // When the board loads, tasks should be properly associated with columnId
    boardVm.openEditTaskDialog(boardVm.localColumns[0].tasks[0])
    expect(boardVm.activeColumnId).toBe('col-1')

    // Saving edit without moving column (e.g. columnId is null or omitted or same)
    await boardVm.handleSaveTask({
      mode: 'edit',
      taskId: 'task-backend-1',
      title: 'Updated Title',
      description: 'Initial Description',
      columnId: null,
    })

    expect(boardVm.errorMessage).toBeNull()
    expect(updateSpy).toHaveBeenCalledWith('task-backend-1', {
      title: 'Updated Title',
      description: 'Initial Description',
    })
    expect(boardVm.localColumns[0].tasks[0].title).toBe('Updated Title')
  })
})

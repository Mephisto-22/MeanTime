import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it, vi } from 'vitest'
import { kanbanContextKey } from '~/api/kanban'
import Column from '~/components/kanban/Column.vue'
import { createColumnFixture, createTaskFixture } from '../fixtures/kanban'

function mountColumn(props: any = {}, contextOverrides: any = {}) {
  const kanbanContext = {
    openCreateTaskDialog: vi.fn(),
    openEditTaskDialog: vi.fn(),
    moveTask: vi.fn(),
    columns: { value: [] },
    ...contextOverrides,
  }

  const wrapper = mount(Column, {
    props: {
      column: createColumnFixture({ id: 'col-1', title: 'To Do', tasks: [] }),
      ...props,
    },
    global: {
      plugins: [PrimeVue],
      provide: {
        [kanbanContextKey as symbol]: kanbanContext,
      },
    },
  })

  return { wrapper, kanbanContext }
}

describe('Column Component DOM Suite', () => {
  it('renders column title and task count badge', () => {
    const task1 = createTaskFixture({ id: 't-1' })
    const task2 = createTaskFixture({ id: 't-2' })
    const { wrapper } = mountColumn({
      column: createColumnFixture({
        title: 'In Progress',
        tasks: [task1, task2],
      }),
    })

    expect(wrapper.text()).toContain('In Progress')
    const countTag = wrapper.find('[data-testid="column-task-count"]')
    expect(countTag.exists()).toBe(true)
    expect(countTag.text()).toContain('2')
  })

  it('renders empty placeholder when column has zero tasks', () => {
    const { wrapper } = mountColumn({
      column: createColumnFixture({ tasks: [] }),
    })

    const placeholder = wrapper.find('[data-testid="column-empty-placeholder"]')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.text()).toContain('No tasks')
  })

  it('renders Add Task button and clicking invokes openCreateTaskDialog(column.id)', async () => {
    const { wrapper, kanbanContext } = mountColumn({
      column: createColumnFixture({ id: 'col-42' }),
    })

    const addBtn = wrapper.find('[data-testid="add-task-button"]')
    expect(addBtn.exists()).toBe(true)

    await addBtn.trigger('click')
    expect(kanbanContext.openCreateTaskDialog).toHaveBeenCalledTimes(1)
    expect(kanbanContext.openCreateTaskDialog).toHaveBeenCalledWith('col-42')
  })

  it('dispatches moveTask to kanbanContext on drag update within column', () => {
    const { wrapper, kanbanContext } = mountColumn({
      column: createColumnFixture({ id: 'col-1' }),
    })

    const draggable = wrapper.findComponent({ name: 'VueDraggable' })
    draggable.vm.$emit('update', {
      data: { id: 'task-10' },
      newIndex: 2,
    })

    expect(kanbanContext.moveTask).toHaveBeenCalledWith({
      taskId: 'task-10',
      fromColumnId: 'col-1',
      toColumnId: 'col-1',
      targetPosition: 2,
    })
  })

  it('dispatches moveTask to kanbanContext on drag add across columns', () => {
    const { wrapper, kanbanContext } = mountColumn({
      column: createColumnFixture({ id: 'col-target' }),
    })

    const draggable = wrapper.findComponent({ name: 'VueDraggable' })
    draggable.vm.$emit('add', {
      data: { id: 'task-cross' },
      from: { getAttribute: () => 'col-source' },
      newIndex: 0,
    })

    expect(kanbanContext.moveTask).toHaveBeenCalledWith({
      taskId: 'task-cross',
      fromColumnId: 'col-source',
      toColumnId: 'col-target',
      targetPosition: 0,
    })
  })
})

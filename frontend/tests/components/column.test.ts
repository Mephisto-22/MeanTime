import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { kanbanContextKey } from '~/api/kanban'
import Column from '~/components/kanban/Column.vue'
import { createColumnFixture, createTaskFixture } from '../fixtures/kanban'

function mountColumn(props: any = {}, contextOverrides: any = {}, slots: Record<string, any> = {}) {
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
    slots,
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

  it('supports hiding edit/add buttons, customizing emptyText, and rendering #header-actions and #subheader slots', () => {
    const { wrapper } = mountColumn(
      {
        column: createColumnFixture({ id: 'col-feed', title: 'Task Feed', tasks: [] }),
        showEditButton: false,
        showAddTask: false,
        emptyText: 'No tasks match your filters',
      },
      {},
      {
        'header-actions': '<button data-testid="feed-sort-button">Sort</button>',
        subheader: '<div data-testid="feed-filter-bar">Filter bar</div>',
      },
    )

    expect(wrapper.find('[data-testid="edit-column-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="add-task-button"]').exists()).toBe(false)

    const headerActions = wrapper.find('[data-testid="feed-sort-button"]')
    expect(headerActions.exists()).toBe(true)
    expect(wrapper.find('[data-testid="feed-filter-bar"]').exists()).toBe(true)

    const placeholder = wrapper.find('[data-testid="column-empty-placeholder"]')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.text()).toBe('No tasks match your filters')
    expect(placeholder.classes()).toContain('px-4')
    expect(placeholder.classes()).toContain('text-center')
  })

  it('disables drag-and-drop, forwards draggable=false to KanbanTask, and ignores reorder/add events when draggable is false', () => {
    const task = createTaskFixture({ id: 't-static', title: 'Static Task' })
    const column = createColumnFixture({ id: 'col-static', tasks: [task] })
    const { wrapper, kanbanContext } = mountColumn({
      column,
      draggable: false,
    })

    const draggable = wrapper.findComponent({ name: 'VueDraggable' })
    expect(draggable.props('disabled')).toBe(true)

    const taskEl = wrapper.find('[data-testid="kanban-task"]')
    expect(taskEl.classes()).toContain('cursor-pointer')
    expect(taskEl.classes()).not.toContain('cursor-grab')

    draggable.vm.$emit('update', { data: { id: 't-static' }, newIndex: 1 })
    draggable.vm.$emit('add', {
      data: { id: 't-other' },
      from: { getAttribute: () => 'col-other' },
      newIndex: 0,
    })
    draggable.vm.$emit('update:modelValue', [])

    expect(kanbanContext.moveTask).not.toHaveBeenCalled()
    expect(column.tasks).toHaveLength(1)
    expect(column.tasks[0]?.id).toBe('t-static')
  })

  it('renders custom #task slot for each task in the column', () => {
    const task = createTaskFixture({ id: 't-custom', title: 'Slotted Task' })
    const { wrapper } = mountColumn(
      {
        column: createColumnFixture({ id: 'col-custom', tasks: [task] }),
      },
      {},
      {
        task: ({ task: slottedTask }: { task: any }) =>
          h('div', { 'data-testid': 'custom-task-slot' }, slottedTask.title),
      },
    )

    const custom = wrapper.find('[data-testid="custom-task-slot"]')
    expect(custom.exists()).toBe(true)
    expect(custom.text()).toBe('Slotted Task')
  })
})

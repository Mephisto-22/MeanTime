import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it, vi } from 'vitest'
import { kanbanContextKey } from '~/api/kanban'
import Task from '~/components/kanban/Task.vue'
import { createTaskFixture } from '../fixtures/kanban'

function mountTask(props: any = {}, contextOverrides: any = {}) {
  const kanbanContext = {
    openEditTaskDialog: vi.fn(),
    openCreateTaskDialog: vi.fn(),
    moveTask: vi.fn(),
    columns: { value: [] },
    ...contextOverrides,
  }

  const wrapper = mount(Task, {
    props: {
      task: createTaskFixture({ id: 'task-1', title: 'Test Task Title' }),
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

describe('Task Component DOM Suite', () => {
  it('renders task title and grab cursor without menu dropdown', () => {
    const { wrapper } = mountTask({
      task: createTaskFixture({ title: 'Build Vitest Suite' }),
    })

    expect(wrapper.text()).toContain('Build Vitest Suite')
    const card = wrapper.find('[data-testid="kanban-task"]')
    expect(card.exists()).toBe(true)
    expect(card.classes()).toContain('cursor-grab')
  })

  it('clicking a Task card invokes kanbanContext.openEditTaskDialog with the task', async () => {
    const task = createTaskFixture({ id: 'task-42', title: 'Clickable Task' })
    const { wrapper, kanbanContext } = mountTask({ task })

    await wrapper.find('[data-testid="kanban-task"]').trigger('click')

    expect(kanbanContext.openEditTaskDialog).toHaveBeenCalledTimes(1)
    expect(kanbanContext.openEditTaskDialog).toHaveBeenCalledWith(task)
  })

  it('drag disambiguation: pointer movement beyond 5px threshold suppresses click-to-edit', async () => {
    const task = createTaskFixture({ id: 'task-drag' })
    const { wrapper, kanbanContext } = mountTask({ task })
    const card = wrapper.find('[data-testid="kanban-task"]')

    // Pointer down at (10, 10)
    await card.trigger('pointerdown', { clientX: 10, clientY: 10, buttons: 1 })
    // Move to (30, 30) -> distance > 5px threshold
    await card.trigger('pointermove', { clientX: 30, clientY: 30, buttons: 1 })

    // Click trigger immediately after drag gesture
    await card.trigger('click')

    expect(kanbanContext.openEditTaskDialog).not.toHaveBeenCalled()
  })

  it('drag disambiguation: HTML5 dragstart and dragend guard suppresses click', async () => {
    const task = createTaskFixture({ id: 'task-html5' })
    const { wrapper, kanbanContext } = mountTask({ task })
    const card = wrapper.find('[data-testid="kanban-task"]')

    await card.trigger('dragstart')
    await card.trigger('click')

    expect(kanbanContext.openEditTaskDialog).not.toHaveBeenCalled()
  })
})

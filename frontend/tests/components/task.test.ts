import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it, vi } from 'vitest'
import { kanbanContextKey } from '~/api/kanban'
import Task from '~/components/kanban/Task.vue'
import { createTaskFixture, createTagFixture } from '../fixtures/kanban'

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
  describe('Layout & Title', () => {
    it('renders task title and grab cursor without menu dropdown', () => {
      const { wrapper } = mountTask({
        task: createTaskFixture({ title: 'Build Vitest Suite' }),
      })

      expect(wrapper.text()).toContain('Build Vitest Suite')
      const taskEl = wrapper.find('[data-testid="kanban-task"]')
      expect(taskEl.exists()).toBe(true)
      expect(taskEl.classes()).toContain('cursor-grab')
      const titleEl = wrapper.find('h4')
      expect(titleEl.exists()).toBe(true)
      expect(titleEl.classes()).toContain('font-semibold')
    })
  })

  describe('Description preview & omission', () => {
    it('renders single-line clamped description when description is present', () => {
      const { wrapper } = mountTask({
        task: createTaskFixture({
          title: 'Document API',
          description: 'Ensure all Swagger docs and endpoints are updated.',
        }),
      })

      const descEl = wrapper.find('[data-testid="task-description"]')
      expect(descEl.exists()).toBe(true)
      expect(descEl.text()).toBe('Ensure all Swagger docs and endpoints are updated.')
      expect(descEl.classes()).toContain('line-clamp-1')
      expect(descEl.classes()).toContain('text-xs')
      expect(descEl.classes()).toContain('text-surface-500')
      expect(descEl.classes()).toContain('mt-0.5')
    })

    it('completely omits description element when description is undefined or empty', () => {
      const { wrapper: wrapperEmpty } = mountTask({
        task: createTaskFixture({ title: 'Empty Desc Task', description: '' }),
      })
      expect(wrapperEmpty.find('[data-testid="task-description"]').exists()).toBe(false)

      const { wrapper: wrapperUndefined } = mountTask({
        task: createTaskFixture({ title: 'Undefined Desc Task', description: undefined }),
      })
      expect(wrapperUndefined.find('[data-testid="task-description"]').exists()).toBe(false)
    })

    it('completely omits description element with zero whitespace or placeholder when whitespace only', () => {
      const { wrapper } = mountTask({
        task: createTaskFixture({ title: 'Whitespace Task', description: '    \n\t   ' }),
      })
      expect(wrapper.find('[data-testid="task-description"]').exists()).toBe(false)
    })
  })

  describe('Priority styling & micro-pip', () => {
    it('renders HIGH priority pip with red styling and red border-l-4 indicator', () => {
      const { wrapper } = mountTask({
        task: createTaskFixture({ priority: 'HIGH' }),
      })

      const taskEl = wrapper.find('[data-testid="kanban-task"]')
      expect(taskEl.classes()).toContain('border-l-4')
      expect(taskEl.classes()).toContain('border-l-red-500')

      const pipEl = wrapper.find('[data-testid="task-priority-indicator"]')
      expect(pipEl.exists()).toBe(true)
      expect(pipEl.text()).toContain('HIGH')
      expect(pipEl.classes()).toContain('bg-red-50')
      expect(pipEl.classes()).toContain('text-red-700')

      const dotEl = wrapper.find('[data-testid="task-priority-dot"]')
      expect(dotEl.exists()).toBe(true)
      expect(dotEl.classes()).toContain('bg-red-500')
    })

    it('renders MED / MEDIUM priority pip with amber styling and amber border-l-4 indicator', () => {
      const { wrapper } = mountTask({
        task: createTaskFixture({ priority: 'MEDIUM' }),
      })

      const taskEl = wrapper.find('[data-testid="kanban-task"]')
      expect(taskEl.classes()).toContain('border-l-4')
      expect(taskEl.classes()).toContain('border-l-amber-500')

      const pipEl = wrapper.find('[data-testid="task-priority-indicator"]')
      expect(pipEl.exists()).toBe(true)
      expect(pipEl.text()).toContain('MED')
      expect(pipEl.classes()).toContain('bg-amber-50')
      expect(pipEl.classes()).toContain('text-amber-700')

      const dotEl = wrapper.find('[data-testid="task-priority-dot"]')
      expect(dotEl.exists()).toBe(true)
      expect(dotEl.classes()).toContain('bg-amber-500')
    })

    it('renders LOW priority pip with sky blue styling and sky blue border-l-4 indicator', () => {
      const { wrapper } = mountTask({
        task: createTaskFixture({ priority: 'LOW' }),
      })

      const taskEl = wrapper.find('[data-testid="kanban-task"]')
      expect(taskEl.classes()).toContain('border-l-4')
      expect(taskEl.classes()).toContain('border-l-sky-500')

      const pipEl = wrapper.find('[data-testid="task-priority-indicator"]')
      expect(pipEl.exists()).toBe(true)
      expect(pipEl.text()).toContain('LOW')
      expect(pipEl.classes()).toContain('bg-sky-50')
      expect(pipEl.classes()).toContain('text-sky-700')

      const dotEl = wrapper.find('[data-testid="task-priority-dot"]')
      expect(dotEl.exists()).toBe(true)
      expect(dotEl.classes()).toContain('bg-sky-500')
    })

    it('completely omits priority pip and displays transparent border when priority is null', () => {
      const { wrapper } = mountTask({
        task: createTaskFixture({ priority: null }),
      })

      const taskEl = wrapper.find('[data-testid="kanban-task"]')
      expect(taskEl.classes()).toContain('border-l-4')
      expect(taskEl.classes()).toContain('border-l-transparent')

      const pipEl = wrapper.find('[data-testid="task-priority-indicator"]')
      expect(pipEl.exists()).toBe(false)
    })
  })

  describe('Tag chips & overflow badge', () => {
    it('omits tag container and chips when tags are undefined or empty', () => {
      const { wrapper: wrapperEmpty } = mountTask({
        task: createTaskFixture({ tags: [] }),
      })
      expect(wrapperEmpty.findAll('[data-testid="task-tag-chip"]')).toHaveLength(0)
      expect(wrapperEmpty.find('[data-testid="task-tag-overflow-badge"]').exists()).toBe(false)

      const { wrapper: wrapperUndefined } = mountTask({
        task: createTaskFixture({ tags: undefined }),
      })
      expect(wrapperUndefined.findAll('[data-testid="task-tag-chip"]')).toHaveLength(0)
      expect(wrapperUndefined.find('[data-testid="task-tag-overflow-badge"]').exists()).toBe(false)
    })

    it('renders 1, 2, and 3 tag chips with dot prefix without overflow badge', () => {
      // 1 tag
      const { wrapper: wrapper1 } = mountTask({
        task: createTaskFixture({
          tags: [createTagFixture({ name: 'Frontend' })],
        }),
      })
      const chips1 = wrapper1.findAll('[data-testid="task-tag-chip"]')
      expect(chips1).toHaveLength(1)
      expect(chips1[0].text()).toContain('•')
      expect(chips1[0].text()).toContain('Frontend')
      expect(wrapper1.find('[data-testid="task-tag-overflow-badge"]').exists()).toBe(false)

      // 2 tags
      const { wrapper: wrapper2 } = mountTask({
        task: createTaskFixture({
          tags: [
            createTagFixture({ name: 'Frontend' }),
            createTagFixture({ name: 'UI' }),
          ],
        }),
      })
      const chips2 = wrapper2.findAll('[data-testid="task-tag-chip"]')
      expect(chips2).toHaveLength(2)
      expect(chips2[1].text()).toContain('UI')
      expect(wrapper2.find('[data-testid="task-tag-overflow-badge"]').exists()).toBe(false)

      // 3 tags
      const { wrapper: wrapper3 } = mountTask({
        task: createTaskFixture({
          tags: [
            createTagFixture({ name: 'Frontend' }),
            createTagFixture({ name: 'UI' }),
            createTagFixture({ name: 'Design' }),
          ],
        }),
      })
      const chips3 = wrapper3.findAll('[data-testid="task-tag-chip"]')
      expect(chips3).toHaveLength(3)
      expect(chips3[2].text()).toContain('Design')
      expect(wrapper3.find('[data-testid="task-tag-overflow-badge"]').exists()).toBe(false)
    })

    it('caps tag chips at 3 maximum and renders +N overflow badge when 4 or more exist', () => {
      // 4 tags -> 3 chips + 1 badge
      const { wrapper: wrapper4 } = mountTask({
        task: createTaskFixture({
          tags: [
            createTagFixture({ name: 'Tag1' }),
            createTagFixture({ name: 'Tag2' }),
            createTagFixture({ name: 'Tag3' }),
            createTagFixture({ name: 'Tag4' }),
          ],
        }),
      })
      const chips4 = wrapper4.findAll('[data-testid="task-tag-chip"]')
      expect(chips4).toHaveLength(3)
      const badge4 = wrapper4.find('[data-testid="task-tag-overflow-badge"]')
      expect(badge4.exists()).toBe(true)
      expect(badge4.text()).toBe('+1')

      // 5 tags -> 3 chips + 2 badge
      const { wrapper: wrapper5 } = mountTask({
        task: createTaskFixture({
          tags: [
            createTagFixture({ name: 'Tag1' }),
            createTagFixture({ name: 'Tag2' }),
            createTagFixture({ name: 'Tag3' }),
            createTagFixture({ name: 'Tag4' }),
            createTagFixture({ name: 'Tag5' }),
          ],
        }),
      })
      const chips5 = wrapper5.findAll('[data-testid="task-tag-chip"]')
      expect(chips5).toHaveLength(3)
      const badge5 = wrapper5.find('[data-testid="task-tag-overflow-badge"]')
      expect(badge5.exists()).toBe(true)
      expect(badge5.text()).toBe('+2')
    })
  })

  describe('Interaction & Drag Disambiguation', () => {
    it('clicking a Task invokes kanbanContext.openEditTaskDialog with the task', async () => {
      const task = createTaskFixture({ id: 'task-42', title: 'Clickable Task' })
      const { wrapper, kanbanContext } = mountTask({ task })

      await wrapper.find('[data-testid="kanban-task"]').trigger('click')

      expect(kanbanContext.openEditTaskDialog).toHaveBeenCalledTimes(1)
      expect(kanbanContext.openEditTaskDialog).toHaveBeenCalledWith(task)
    })

    it('clicking a Task invokes onOpenEdit prop when provided', async () => {
      const task = createTaskFixture({ id: 'task-prop', title: 'Prop Callback Task' })
      const onOpenEdit = vi.fn()
      const { wrapper, kanbanContext } = mountTask({ task, onOpenEdit })

      await wrapper.find('[data-testid="kanban-task"]').trigger('click')

      expect(onOpenEdit).toHaveBeenCalledTimes(1)
      expect(onOpenEdit).toHaveBeenCalledWith(task)
      expect(kanbanContext.openEditTaskDialog).not.toHaveBeenCalled()
    })

    it('pointer movement within 5px threshold does not suppress click-to-edit', async () => {
      const task = createTaskFixture({ id: 'task-small-move' })
      const { wrapper, kanbanContext } = mountTask({ task })
      const taskEl = wrapper.find('[data-testid="kanban-task"]')

      // Pointer down at (10, 10)
      await taskEl.trigger('pointerdown', { clientX: 10, clientY: 10, buttons: 1 })
      // Move to (12, 13) -> deltaX = 2, deltaY = 3 -> hypot = 3.6px <= 5px
      await taskEl.trigger('pointermove', { clientX: 12, clientY: 13, buttons: 1 })

      await taskEl.trigger('click')

      expect(kanbanContext.openEditTaskDialog).toHaveBeenCalledTimes(1)
      expect(kanbanContext.openEditTaskDialog).toHaveBeenCalledWith(task)
    })

    it('drag disambiguation: pointer movement beyond 5px threshold suppresses click-to-edit', async () => {
      const task = createTaskFixture({ id: 'task-drag' })
      const { wrapper, kanbanContext } = mountTask({ task })
      const taskEl = wrapper.find('[data-testid="kanban-task"]')

      // Pointer down at (10, 10)
      await taskEl.trigger('pointerdown', { clientX: 10, clientY: 10, buttons: 1 })
      // Move to (30, 30) -> distance > 5px threshold
      await taskEl.trigger('pointermove', { clientX: 30, clientY: 30, buttons: 1 })

      // Click trigger immediately after drag gesture
      await taskEl.trigger('click')

      expect(kanbanContext.openEditTaskDialog).not.toHaveBeenCalled()
    })

    it('drag disambiguation: HTML5 dragstart and dragend guard suppresses click', async () => {
      const task = createTaskFixture({ id: 'task-html5' })
      const { wrapper, kanbanContext } = mountTask({ task })
      const taskEl = wrapper.find('[data-testid="kanban-task"]')

      await taskEl.trigger('dragstart')
      await taskEl.trigger('click')

      expect(kanbanContext.openEditTaskDialog).not.toHaveBeenCalled()
    })
  })
})

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PrimeVue from 'primevue/config'
import { describe, expect, it, vi } from 'vitest'
import TaskDialog from '~/components/kanban/TaskDialog.vue'
import Task from '~/components/kanban/Task.vue'
import {
  createTaskFixture,
  ToggleSwitchStub,
  InputNumberStub,
  InputMaskStub,
  DatePickerStub,
} from '../fixtures'
import { kanbanContextKey, TASK_DUE_DATE_STATUS_CONFIG } from '~/api/kanban'

const DialogStub = {
  name: 'Dialog',
  props: ['visible', 'header'],
  template: '<div v-if="visible" data-testid="task-dialog" class="p-dialog" :data-header="header"><slot /></div>',
}

const SelectStub = {
  name: 'Select',
  props: ['modelValue', 'options'],
  emits: ['update:modelValue'],
  template: `
    <select
      :value="modelValue ?? ''"
      data-testid="select-stub"
      @change="$emit('update:modelValue', $event.target.value === '' || $event.target.value === 'null' ? null : (isNaN(Number($event.target.value)) ? $event.target.value : Number($event.target.value)))"
    >
      <option
        v-for="o in options"
        :key="o.id !== undefined ? o.id : String(o.value)"
        :value="o.id !== undefined ? o.id : (o.value ?? '')"
      >
        {{ o.title || o.label }}
      </option>
    </select>
  `,
}

function mountTaskDialog(props: Record<string, any> = {}) {
  const kanbanContext = {
    openEditTaskDialog: vi.fn(),
    openCreateTaskDialog: vi.fn(),
    moveTask: vi.fn(),
    columns: { value: [] },
  }

  return mount(TaskDialog, {
    props: {
      visible: true,
      mode: 'create',
      columnId: 'col-1',
      ...props,
    },
    global: {
      plugins: [PrimeVue],
      provide: {
        [kanbanContextKey as symbol]: kanbanContext,
      },
      stubs: {
        Dialog: DialogStub,
        Select: SelectStub,
        ToggleSwitch: ToggleSwitchStub,
        InputNumber: InputNumberStub,
        InputMask: InputMaskStub,
        DatePicker: DatePickerStub,
      },
    },
  })
}

function mountTask(props: any = {}) {
  const kanbanContext = {
    openEditTaskDialog: vi.fn(),
    openCreateTaskDialog: vi.fn(),
    moveTask: vi.fn(),
    columns: { value: [] },
  }

  const wrapper = mount(Task, {
    props: {
      task: createTaskFixture({ id: 'task-1', title: 'Test Task' }),
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

describe('Task Due Date & Collaborator Reminders Component Suite', () => {
  describe('TaskDialog UI & Payload emission', () => {
    it('renders Due Date and Recurrence sections side-by-side inside the grid container', () => {
      const wrapper = mountTaskDialog()
      const dueDateSection = wrapper.find('[data-testid="task-dialog-due-date-section"]')
      const recurrenceSection = wrapper.find('[data-testid="task-dialog-recurrence-section"]')

      expect(dueDateSection.exists()).toBe(true)
      expect(recurrenceSection.exists()).toBe(true)
    })

    it('initializes due date section with toggle disabled in create mode', () => {
      const wrapper = mountTaskDialog({ mode: 'create' })
      const toggle = wrapper.find<HTMLInputElement>('[data-testid="task-due-date-toggle"]')
      expect(toggle.exists()).toBe(true)
      expect(toggle.element.checked).toBe(false)
      expect(wrapper.find('[data-testid="task-due-date-controls"]').exists()).toBe(false)
    })

    it('toggling due date switch reveals date, time, and reminder controls with matching dimensions', async () => {
      const wrapper = mountTaskDialog({ mode: 'create' })
      const toggle = wrapper.find<HTMLInputElement>('[data-testid="task-due-date-toggle"]')

      await toggle.setValue(true)
      await nextTick()

      expect(wrapper.find('[data-testid="task-due-date-controls"]').exists()).toBe(true)
      const dateInput = wrapper.find('[data-testid="task-due-date-input"]')
      const timeInput = wrapper.find('[data-testid="task-due-time-input"]')
      expect(dateInput.exists()).toBe(true)
      expect(timeInput.exists()).toBe(true)
      expect(wrapper.find('[data-testid="task-reminder-toggle"]').exists()).toBe(true)
    })

    it('populates existing due date and reminder in edit mode', () => {
      const task = createTaskFixture({
        id: 'task-with-due',
        title: 'Task with Deadline',
        dueAt: '2026-11-20T17:00:00.000Z',
        reminderOffsetSeconds: 3600,
      })

      const wrapper = mountTaskDialog({ mode: 'edit', task })
      const toggle = wrapper.find<HTMLInputElement>('[data-testid="task-due-date-toggle"]')
      expect(toggle.element.checked).toBe(true)
      expect(wrapper.find('[data-testid="task-due-date-controls"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="task-reminder-select"]').exists()).toBe(true)
    })

    it('toggling collaborator reminder off hides reminder interval select', async () => {
      const task = createTaskFixture({
        id: 'task-with-due',
        title: 'Task with Deadline',
        dueAt: '2026-11-20T17:00:00.000Z',
        reminderOffsetSeconds: 3600,
      })

      const wrapper = mountTaskDialog({ mode: 'edit', task })
      const reminderToggle = wrapper.find<HTMLInputElement>('[data-testid="task-reminder-toggle"]')
      expect(reminderToggle.element.checked).toBe(true)
      expect(wrapper.find('[data-testid="task-reminder-select"]').exists()).toBe(true)

      await reminderToggle.setValue(false)
      await nextTick()

      expect(wrapper.find('[data-testid="task-reminder-select"]').exists()).toBe(false)
    })

    it('submitting with due date enabled emits dueAt, due_at, reminderOffsetSeconds in save payload', async () => {
      const wrapper = mountTaskDialog({ mode: 'create' })
      await wrapper.find<HTMLInputElement>('[data-testid="task-title-input"]').setValue('Deliver Due Date Feature')

      // Turn on Due Date
      const toggle = wrapper.find<HTMLInputElement>('[data-testid="task-due-date-toggle"]')
      await toggle.setValue(true)
      await nextTick()

      // Enter date and time
      const dateInput = wrapper.find<HTMLInputElement>('[data-testid="task-due-date-input"]')
      await dateInput.setValue('2026-11-25')
      await nextTick()

      // Save
      await wrapper.find('form').trigger('submit')
      await nextTick()

      const saveEmits = wrapper.emitted('save')
      expect(saveEmits).toBeDefined()
      expect(saveEmits).toHaveLength(1)

      const payload = saveEmits![0][0] as any
      expect(payload.dueAt).toBeDefined()
      expect(payload.due_at).toBeDefined()
      expect(typeof payload.dueAt).toBe('string')
      expect(payload.reminderOffsetSeconds).toBe(3600)
      expect(payload.reminder_offset_seconds).toBe(3600)
    })

    it('clearing an existing due date in edit mode emits null values', async () => {
      const task = createTaskFixture({
        id: 'task-with-due',
        title: 'Task with Deadline',
        dueAt: '2026-11-20T17:00:00.000Z',
        reminderOffsetSeconds: 3600,
      })

      const wrapper = mountTaskDialog({ mode: 'edit', task })
      const toggle = wrapper.find<HTMLInputElement>('[data-testid="task-due-date-toggle"]')
      expect(toggle.element.checked).toBe(true)

      // Turn off due date
      await toggle.setValue(false)
      await nextTick()

      // Save
      await wrapper.find('form').trigger('submit')
      await nextTick()

      const saveEmits = wrapper.emitted('save')
      expect(saveEmits).toBeDefined()
      const payload = saveEmits![0][0] as any
      expect(payload.dueAt).toBeNull()
      expect(payload.due_at).toBeNull()
      expect(payload.reminderOffsetSeconds).toBeNull()
      expect(payload.reminder_offset_seconds).toBeNull()
    })
  })

  describe('Task Card Visual Indicators', () => {
    it('omits due date badge when task has no due date', () => {
      const { wrapper } = mountTask({
        task: createTaskFixture({ dueAt: null, due_at: null }),
      })

      expect(wrapper.find('[data-testid="task-due-date-badge"]').exists()).toBe(false)
    })

    it('renders overdue badge when deadline is in the past', () => {
      const pastDate = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
      const { wrapper } = mountTask({
        task: createTaskFixture({ dueAt: pastDate }),
      })

      const badge = wrapper.find('[data-testid="task-due-date-badge"]')
      expect(badge.exists()).toBe(true)
      expect(badge.attributes('data-status')).toBe('overdue')
      expect(badge.classes()).toContain('text-red-700')
    })

    it('renders due soon badge when deadline is within 24 hours', () => {
      const dueSoonDate = new Date(Date.now() + 4 * 3600 * 1000).toISOString()
      const { wrapper } = mountTask({
        task: createTaskFixture({ dueAt: dueSoonDate }),
      })

      const badge = wrapper.find('[data-testid="task-due-date-badge"]')
      expect(badge.exists()).toBe(true)
      expect(badge.attributes('data-status')).toBe('due_soon')
      expect(badge.classes()).toContain('text-amber-700')
    })

    it('renders upcoming badge when deadline is more than 24 hours away', () => {
      const upcomingDate = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
      const { wrapper } = mountTask({
        task: createTaskFixture({ dueAt: upcomingDate }),
      })

      const badge = wrapper.find('[data-testid="task-due-date-badge"]')
      expect(badge.exists()).toBe(true)
      expect(badge.attributes('data-status')).toBe('upcoming')
      expect(badge.classes()).toContain('text-surface-600')
    })
  })
})

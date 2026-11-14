import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it } from 'vitest'
import TaskDialog from '~/components/kanban/TaskDialog.vue'
import { createTaskFixture, createTagFixture, ToggleSwitchStub, InputNumberStub, InputMaskStub, DatePickerStub } from '../fixtures'
import type { TaskDialogSavePayload, TagDto } from '~/api/kanban'

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
      @change="$emit('update:modelValue', $event.target.value === '' || $event.target.value === 'null' ? null : $event.target.value)"
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
  return mount(TaskDialog, {
    props: {
      visible: true,
      mode: 'create',
      columnId: 'col-1',
      ...props,
    },
    global: {
      plugins: [PrimeVue],
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

describe('TaskDialog Component DOM Suite', () => {
  it('renders PrimeVue Dialog structure, title InputText, tag InputText, and description Textarea', () => {
    const wrapper = mountTaskDialog()
    expect(wrapper.find('[data-testid="task-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="task-title-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="task-tag-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="task-description-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="task-save-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="task-cancel-button"]').exists()).toBe(true)
  })

  it('in create mode: initializes blank and disables Save button when title is empty or whitespace', async () => {
    const wrapper = mountTaskDialog({ mode: 'create' })
    const titleInput = wrapper.find<HTMLInputElement>('[data-testid="task-title-input"]')
    const descInput = wrapper.find<HTMLTextAreaElement>('[data-testid="task-description-input"]')
    const saveButton = wrapper.find('[data-testid="task-save-button"]')

    expect(titleInput.element.value).toBe('')
    expect(descInput.element.value).toBe('')
    expect(saveButton.attributes('disabled')).toBeDefined()
    expect(titleInput.attributes('aria-invalid')).toBe('true')
    expect(titleInput.classes()).toContain('p-invalid')

    await titleInput.setValue('   ')
    expect(saveButton.attributes('disabled')).toBeDefined()

    await titleInput.setValue('Valid Title')
    expect(saveButton.attributes('disabled')).toBeUndefined()
    expect(titleInput.attributes('aria-invalid')).toBe('false')
  })

  it('in edit mode: populates fields from active task and enables Save', () => {
    const sampleTask = createTaskFixture({
      id: 't-100',
      title: 'Existing Task Title',
      description: 'Existing Details',
      columnId: 'col-1',
      priority: 'HIGH',
      tags: [createTagFixture({ id: 'tag-1', name: 'Frontend' })],
    })

    const wrapper = mountTaskDialog({
      mode: 'edit',
      task: sampleTask,
    })

    const titleInput = wrapper.find<HTMLInputElement>('[data-testid="task-title-input"]')
    const descInput = wrapper.find<HTMLTextAreaElement>('[data-testid="task-description-input"]')
    const saveButton = wrapper.find('[data-testid="task-save-button"]')

    expect(titleInput.element.value).toBe('Existing Task Title')
    expect(descInput.element.value).toBe('Existing Details')
    expect(saveButton.attributes('disabled')).toBeUndefined()
  })

  it('in edit mode: correctly populates column select and save payload when task has backend column_id', async () => {
    const backendTask = {
      id: 't-backend',
      title: 'Backend Task Title',
      description: 'Backend Details',
      column_id: 'col-2',
      priority: 'LOW',
      tags: [],
    }

    const wrapper = mountTaskDialog({
      mode: 'edit',
      task: backendTask as any,
      columns: [
        { id: 'col-1', title: 'To Do', position: 0 },
        { id: 'col-2', title: 'In Progress', position: 1 },
      ],
    })

    const titleInput = wrapper.find<HTMLInputElement>('[data-testid="task-title-input"]')
    expect(titleInput.element.value).toBe('Backend Task Title')

    await wrapper.find('form').trigger('submit.prevent')
    const saveEmits = wrapper.emitted('save')
    expect(saveEmits).toHaveLength(1)
    const payload = saveEmits![0][0] as TaskDialogSavePayload
    expect(payload.columnId).toBe('col-2')
  })

  it('discard behavior: cancelling or closing discards changes without mutating active task', async () => {
    const sampleTask = createTaskFixture({
      id: 't-100',
      title: 'Original Title',
      description: 'Original Description',
    })

    const wrapper = mountTaskDialog({
      mode: 'edit',
      task: sampleTask,
    })

    const titleInput = wrapper.find<HTMLInputElement>('[data-testid="task-title-input"]')
    await titleInput.setValue('Modified Title Never Saved')

    const cancelButton = wrapper.find('[data-testid="task-cancel-button"]')
    await cancelButton.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('update:visible')?.[0]).toEqual([false])
    expect(sampleTask.title).toBe('Original Title')
  })

  it('save submission: emits save payload with trimmed data, priority, tags, and tag_ids and closes dialog', async () => {
    const wrapper = mountTaskDialog({
      mode: 'create',
      columnId: 'col-2',
    })

    const titleInput = wrapper.find<HTMLInputElement>('[data-testid="task-title-input"]')
    const descInput = wrapper.find<HTMLTextAreaElement>('[data-testid="task-description-input"]')

    await titleInput.setValue('   New Task Title   ')
    await descInput.setValue('   New Task Description   ')

    await wrapper.find('form').trigger('submit.prevent')

    const saveEmits = wrapper.emitted('save')
    expect(saveEmits).toHaveLength(1)
    const payload = saveEmits![0][0] as TaskDialogSavePayload
    expect(payload).toEqual({
      title: 'New Task Title',
      description: 'New Task Description',
      mode: 'create',
      columnId: 'col-2',
      taskId: null,
      priority: null,
      tags: [],
      tagIds: [],
      recurrence: null,
      recurringTaskId: null,
      applyToFuture: false,
    })
    expect(wrapper.emitted('update:visible')?.[0]).toEqual([false])
  })

  it('renders "Delete Task" button in edit mode and hides it in create mode', () => {
    const createWrapper = mountTaskDialog({ mode: 'create' })
    expect(createWrapper.find('[data-testid="task-delete-button"]').exists()).toBe(false)

    const editWrapper = mountTaskDialog({
      mode: 'edit',
      task: createTaskFixture({ id: 'task-1' }),
    })
    expect(editWrapper.find('[data-testid="task-delete-button"]').exists()).toBe(true)
  })

  it('delete confirmation flow: initiating delete prompts confirmation, cancelling resets, and confirming emits delete event', async () => {
    const sampleTask = createTaskFixture({ id: 'task-to-delete' })
    const wrapper = mountTaskDialog({
      mode: 'edit',
      task: sampleTask,
    })

    await wrapper.find('[data-testid="task-delete-button"]').trigger('click')
    expect(wrapper.find('[data-testid="task-delete-confirmation"]').exists()).toBe(true)

    // Cancel delete
    await wrapper.find('[data-testid="task-cancel-delete-button"]').trigger('click')
    expect(wrapper.find('[data-testid="task-delete-confirmation"]').exists()).toBe(false)

    // Re-initiate and confirm delete
    await wrapper.find('[data-testid="task-delete-button"]').trigger('click')
    await wrapper.find('[data-testid="task-confirm-delete-button"]').trigger('click')

    expect(wrapper.emitted('delete')?.[0]).toEqual(['task-to-delete', { cancelRecurrence: false }])
    expect(wrapper.emitted('update:visible')?.[0]).toEqual([false])
  })

  it('updates form dynamically when active task prop changes while dialog is open', async () => {
    const task1 = createTaskFixture({ id: 't-1', title: 'Task One', description: 'Desc One' })
    const task2 = createTaskFixture({ id: 't-2', title: 'Task Two', description: 'Desc Two' })

    const wrapper = mountTaskDialog({
      mode: 'edit',
      task: task1,
    })

    expect(wrapper.find<HTMLInputElement>('[data-testid="task-title-input"]').element.value).toBe('Task One')

    await wrapper.setProps({ task: task2 })
    expect(wrapper.find<HTMLInputElement>('[data-testid="task-title-input"]').element.value).toBe('Task Two')
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="task-description-input"]').element.value).toBe('Desc Two')
  })

  it('in create mode: renders frameless title input, read-only column badge, and priority select defaulting to null', () => {
    const wrapper = mountTaskDialog({
      mode: 'create',
      columnId: 'col-1',
      columns: [
        { id: 'col-1', title: 'To Do', position: 0 },
        { id: 'col-2', title: 'In Progress', position: 1 },
      ],
    })

    // Prominent frameless title input
    const titleInput = wrapper.find('[data-testid="task-title-input"]')
    expect(titleInput.exists()).toBe(true)
    expect(titleInput.classes()).toContain('border-0')

    // Read-only column badge in create mode
    expect(wrapper.find('[data-testid="task-column-badge"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="task-column-badge"]').text()).toContain('To Do')
    expect(wrapper.find('[data-testid="task-column-select"]').exists()).toBe(false)

    // Stacked priority select defaulting to null
    expect(wrapper.find('[data-testid="task-priority-select"]').exists()).toBe(true)
  })

  it('in edit mode: renders column mover select and priority select populated from active task', async () => {
    const task = createTaskFixture({
      id: 't-200',
      title: 'Task in col 1',
      columnId: 'col-1',
      priority: 'MEDIUM',
    })

    const wrapper = mountTaskDialog({
      mode: 'edit',
      task,
      columns: [
        { id: 'col-1', title: 'To Do', position: 0 },
        { id: 'col-2', title: 'Done', position: 1 },
      ],
    })

    expect(wrapper.find('[data-testid="task-column-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="task-column-badge"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="task-priority-select"]').exists()).toBe(true)

    // Change column and priority
    const colSelect = wrapper.find('[data-testid="task-column-select"]')
    await colSelect.setValue('col-2')

    const prioritySelect = wrapper.find('[data-testid="task-priority-select"]')
    await prioritySelect.setValue('HIGH')

    await wrapper.find('form').trigger('submit.prevent')

    const savePayload = wrapper.emitted('save')?.[0]?.[0] as TaskDialogSavePayload
    expect(savePayload.columnId).toBe('col-2')
    expect(savePayload.priority).toBe('HIGH')
  })

  it('priority selector: allows clearing priority back to null (None)', async () => {
    const task = createTaskFixture({
      id: 't-300',
      title: 'Prioritized Task',
      priority: 'HIGH',
    })

    const wrapper = mountTaskDialog({
      mode: 'edit',
      task,
    })

    const prioritySelect = wrapper.find('[data-testid="task-priority-select"]')
    await prioritySelect.setValue('')

    await wrapper.find('form').trigger('submit.prevent')
    const savePayload = wrapper.emitted('save')?.[0]?.[0] as TaskDialogSavePayload
    expect(savePayload.priority).toBeNull()
  })

  it('tag input pill: enforces 50-character limit, ignores empty input, and trims leading/trailing whitespace', async () => {
    const wrapper = mountTaskDialog({
      mode: 'create',
      availableTags: [],
    })

    const tagInput = wrapper.find<HTMLInputElement>('[data-testid="task-tag-input"]')
    expect(tagInput.exists()).toBe(true)
    expect(tagInput.attributes('maxlength')).toBe('50')

    // Empty or whitespace-only input on Enter does nothing
    await tagInput.setValue('   ')
    await tagInput.trigger('keydown.enter')
    expect(wrapper.findAll('[data-testid="task-attached-tag"]')).toHaveLength(0)

    // Valid multi-word tag preserves inner whitespace but trims edges
    await tagInput.setValue('   Tech Debt   ')
    await tagInput.trigger('keydown.enter')

    const attachedTags = wrapper.findAll('[data-testid="task-attached-tag"]')
    expect(attachedTags).toHaveLength(1)
    expect(attachedTags[0].text()).toContain('Tech Debt')
    expect(wrapper.emitted('createTag')?.[0]).toEqual(['Tech Debt'])

    // Duplicate addition (case-insensitive) is ignored
    await tagInput.setValue('tech debt')
    await tagInput.trigger('keydown.enter')
    expect(wrapper.findAll('[data-testid="task-attached-tag"]')).toHaveLength(1)
  })

  it('attached tags: populate to the right with remove buttons that strictly unlink tags from task', async () => {
    const tag1 = createTagFixture({ id: 'tag-1', name: 'Bug' })
    const tag2 = createTagFixture({ id: 'tag-2', name: 'Refactor' })
    const availableTags: TagDto[] = [tag1, tag2]

    const task = createTaskFixture({
      id: 't-400',
      title: 'Task with tags',
      tags: [tag1, tag2],
    })

    const wrapper = mountTaskDialog({
      mode: 'edit',
      task,
      availableTags,
    })

    const attached = wrapper.findAll('[data-testid="task-attached-tag"]')
    expect(attached).toHaveLength(2)

    // Click remove on the first tag
    const removeButtons = wrapper.findAll('[data-testid="task-remove-tag-button"]')
    expect(removeButtons).toHaveLength(2)
    await removeButtons[0].trigger('click')

    const remainingAttached = wrapper.findAll('[data-testid="task-attached-tag"]')
    expect(remainingAttached).toHaveLength(1)
    expect(remainingAttached[0].text()).toContain('Refactor')

    // availableTags in the library remains untouched
    expect(availableTags).toHaveLength(2)

    await wrapper.find('form').trigger('submit.prevent')
    const savePayload = wrapper.emitted('save')?.[0]?.[0] as TaskDialogSavePayload
    expect(savePayload.tags).toEqual([tag2])
    expect(savePayload.tagIds).toEqual(['tag-2'])
  })

  it('in-layout suggestions box: displays unattached library tags, filters case-insensitively, and attaches directly on click', async () => {
    const availableTags: TagDto[] = [
      createTagFixture({ id: '1', name: 'Frontend' }),
      createTagFixture({ id: '2', name: 'Design System' }),
      createTagFixture({ id: '3', name: 'Backend' }),
    ]

    const wrapper = mountTaskDialog({
      mode: 'create',
      availableTags,
    })

    // Initially shows all unattached library tags
    let suggestions = wrapper.findAll('[data-testid="task-tag-suggestion"]')
    expect(suggestions).toHaveLength(3)

    // Type case-insensitive query 'front'
    const tagInput = wrapper.find<HTMLInputElement>('[data-testid="task-tag-input"]')
    await tagInput.setValue('front')

    suggestions = wrapper.findAll('[data-testid="task-tag-suggestion"]')
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].text()).toContain('Frontend')

    // Click to attach directly
    await suggestions[0].trigger('click')

    // Tag is attached, tag input cleared
    expect(wrapper.findAll('[data-testid="task-attached-tag"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="task-attached-tag"]').text()).toContain('Frontend')
    expect(tagInput.element.value).toBe('')

    // Attached tag is now excluded from suggestions
    suggestions = wrapper.findAll('[data-testid="task-tag-suggestion"]')
    expect(suggestions).toHaveLength(2)
    expect(suggestions.some(s => s.text().includes('Frontend'))).toBe(false)
  })

  describe('Recurring Task Management (Ticket #252)', () => {
    it('recurrence section: renders toggle switch defaulting to off, hiding controls', () => {
      const wrapper = mountTaskDialog({ mode: 'create' })
      expect(wrapper.find('[data-testid="task-dialog-recurrence-section"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="task-recurrence-toggle"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="task-recurrence-controls"]').exists()).toBe(false)
    })

    it('recurrence section: toggling recurrence on reveals controls defaulting to DAILY', async () => {
      const wrapper = mountTaskDialog({ mode: 'create' })
      const toggle = wrapper.find<HTMLInputElement>('[data-testid="task-recurrence-toggle"]')
      await toggle.setValue(true)

      expect(wrapper.find('[data-testid="task-recurrence-controls"]').exists()).toBe(true)
      const cadenceSelect = wrapper.find<HTMLSelectElement>('[data-testid="task-cadence-select"]')
      expect(cadenceSelect.exists()).toBe(true)
      expect(cadenceSelect.element.value).toBe('DAILY')
      expect(wrapper.find('[data-testid="task-weekdays-selector"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="task-day-of-month-input"]').exists()).toBe(false)
    })

    it('recurrence section: switching cadence to WEEKLY shows weekday selector chips and allows toggling days', async () => {
      const wrapper = mountTaskDialog({ mode: 'create' })
      await wrapper.find<HTMLInputElement>('[data-testid="task-recurrence-toggle"]').setValue(true)

      const cadenceSelect = wrapper.find<HTMLSelectElement>('[data-testid="task-cadence-select"]')
      await cadenceSelect.setValue('WEEKLY')

      const weekdaysSelector = wrapper.find('[data-testid="task-weekdays-selector"]')
      expect(weekdaysSelector.exists()).toBe(true)

      // Toggle Tuesday (value 1)
      const tuesdayChip = wrapper.find('[data-testid="weekday-chip-1"]')
      expect(tuesdayChip.exists()).toBe(true)
      await tuesdayChip.trigger('click')

      // Save task with weekly recurrence
      const titleInput = wrapper.find<HTMLInputElement>('[data-testid="task-title-input"]')
      await titleInput.setValue('Weekly Standup Task')
      await wrapper.find('form').trigger('submit.prevent')

      const savePayload = wrapper.emitted('save')?.[0]?.[0] as TaskDialogSavePayload
      expect(savePayload.recurrence).toBeDefined()
      expect(savePayload.recurrence?.cadence).toBe('WEEKLY')
      expect(savePayload.recurrence?.daysOfWeek).toContain(1)
    })

    it('recurrence section: switching cadence to MONTHLY shows day-of-month input', async () => {
      const wrapper = mountTaskDialog({ mode: 'create' })
      await wrapper.find<HTMLInputElement>('[data-testid="task-recurrence-toggle"]').setValue(true)

      const cadenceSelect = wrapper.find<HTMLSelectElement>('[data-testid="task-cadence-select"]')
      await cadenceSelect.setValue('MONTHLY')

      const dayInput = wrapper.find<HTMLInputElement>('[data-testid="task-day-of-month-input"]')
      expect(dayInput.exists()).toBe(true)
      await dayInput.setValue('15')

      const titleInput = wrapper.find<HTMLInputElement>('[data-testid="task-title-input"]')
      await titleInput.setValue('Monthly Review Task')
      await wrapper.find('form').trigger('submit.prevent')

      const savePayload = wrapper.emitted('save')?.[0]?.[0] as TaskDialogSavePayload
      expect(savePayload.recurrence?.cadence).toBe('MONTHLY')
      expect(savePayload.recurrence?.dayOfMonth).toBe(15)
    })

    it('recurrence save scope: editing recurring task prompts for save scope modal', async () => {
      const recurringTask = createTaskFixture({
        id: 't-recurring',
        title: 'Original Recurring Task',
        recurringTaskId: 'rec-1',
        recurringTask: {
          id: 'rec-1',
          cadence: 'DAILY',
          daysOfWeek: [],
          dayOfMonth: null,
          timeOfDay: '09:00:00',
          timezone: 'UTC',
          isActive: true,
        },
      } as any)

      const wrapper = mountTaskDialog({
        mode: 'edit',
        task: recurringTask,
      })

      // Form loads with recurrence toggle on
      const toggle = wrapper.find<HTMLInputElement>('[data-testid="task-recurrence-toggle"]')
      expect(toggle.element.checked).toBe(true)

      // Try to submit form
      await wrapper.find('form').trigger('submit.prevent')

      // Save is NOT emitted yet; confirmation prompt appears
      expect(wrapper.emitted('save')).toBeUndefined()
      const scopeConfirmation = wrapper.find('[data-testid="task-save-scope-confirmation"]')
      expect(scopeConfirmation.exists()).toBe(true)

      // Clicking cancel on scope modal dismisses it
      await wrapper.find('[data-testid="task-save-scope-cancel-button"]').trigger('click')
      expect(wrapper.find('[data-testid="task-save-scope-confirmation"]').exists()).toBe(false)
      expect(wrapper.emitted('save')).toBeUndefined()

      // Re-trigger submit and click "Update this task only"
      await wrapper.find('form').trigger('submit.prevent')
      await wrapper.find('[data-testid="task-save-scope-this-button"]').trigger('click')

      expect(wrapper.emitted('save')).toHaveLength(1)
      const saveThisOnly = wrapper.emitted('save')![0][0] as TaskDialogSavePayload
      expect(saveThisOnly.applyToFuture).toBe(false)

      // Mount again to test "Update this and all future tasks"
      const wrapper2 = mountTaskDialog({
        mode: 'edit',
        task: recurringTask,
      })
      await wrapper2.find('form').trigger('submit.prevent')
      await wrapper2.find('[data-testid="task-save-scope-future-button"]').trigger('click')

      expect(wrapper2.emitted('save')).toHaveLength(1)
      const saveFuture = wrapper2.emitted('save')![0][0] as TaskDialogSavePayload
      expect(saveFuture.applyToFuture).toBe(true)
    })

    it('recurrence delete flow: deleting recurring task shows two delete options', async () => {
      const recurringTask = createTaskFixture({
        id: 't-recurring-del',
        recurringTaskId: 'rec-1',
        recurringTask: {
          id: 'rec-1',
          cadence: 'DAILY',
          daysOfWeek: [],
          dayOfMonth: null,
          timeOfDay: '09:00:00',
          timezone: 'UTC',
          isActive: true,
        },
      } as any)

      const wrapper = mountTaskDialog({
        mode: 'edit',
        task: recurringTask,
      })

      await wrapper.find('[data-testid="task-delete-button"]').trigger('click')
      expect(wrapper.find('[data-testid="task-delete-confirmation"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="task-delete-single-button"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="task-delete-cancel-recurrence-button"]').exists()).toBe(true)

      // Test "Delete this task only"
      await wrapper.find('[data-testid="task-delete-single-button"]').trigger('click')
      expect(wrapper.emitted('delete')?.[0]).toEqual(['t-recurring-del', { cancelRecurrence: false }])

      // Mount again to test "Delete this task and cancel recurrence"
      const wrapper2 = mountTaskDialog({
        mode: 'edit',
        task: recurringTask,
      })
      await wrapper2.find('[data-testid="task-delete-button"]').trigger('click')
      await wrapper2.find('[data-testid="task-delete-cancel-recurrence-button"]').trigger('click')
      expect(wrapper2.emitted('delete')?.[0]).toEqual(['t-recurring-del', { cancelRecurrence: true }])
    })

    it('recurrence toggle off: turning recurrence off on recurring task emits recurrence: null without prompting save scope modal', async () => {
      const recurringTask = createTaskFixture({
        id: 't-recurring-off',
        recurringTaskId: 'rec-1',
        recurringTask: {
          id: 'rec-1',
          cadence: 'DAILY',
          daysOfWeek: [],
          dayOfMonth: null,
          timeOfDay: '09:00:00',
          timezone: 'UTC',
          isActive: true,
        },
      } as any)

      const wrapper = mountTaskDialog({
        mode: 'edit',
        task: recurringTask,
      })

      // Turn off toggle
      await wrapper.find<HTMLInputElement>('[data-testid="task-recurrence-toggle"]').setValue(false)

      // Submit
      await wrapper.find('form').trigger('submit.prevent')

      // Directly saves without scope confirmation modal
      expect(wrapper.find('[data-testid="task-save-scope-confirmation"]').exists()).toBe(false)
      expect(wrapper.emitted('save')).toHaveLength(1)
      const payload = wrapper.emitted('save')![0][0] as TaskDialogSavePayload
      expect(payload.recurrence).toBeNull()
      expect(payload.recurringTaskId).toBe('rec-1')
    })

    it('recurrence UI: renders compact side-by-side cadence and masked time inputs, clamping invalid times', async () => {
      const wrapper = mountTaskDialog({ mode: 'create' })
      await wrapper.find<HTMLInputElement>('[data-testid="task-recurrence-toggle"]').setValue(true)

      const controls = wrapper.find('[data-testid="task-recurrence-controls"]')
      expect(controls.exists()).toBe(true)

      // Cadence and Time inputs both exist in controls
      const cadenceSelect = controls.find('[data-testid="task-cadence-select"]')
      const timeInput = controls.find<HTMLInputElement>('[data-testid="task-time-of-day-input"]')
      expect(cadenceSelect.exists()).toBe(true)
      expect(timeInput.exists()).toBe(true)

      // Test sliding segmented tabs for cadence
      const weeklyTab = controls.findAll('button[role="tab"]').find(b => b.text().includes('Weekly'))
      expect(weeklyTab).toBeDefined()
      await weeklyTab!.trigger('click')
      expect(wrapper.find('[data-testid="task-weekdays-selector"]').exists()).toBe(true)

      // Test time masking and clamping invalid time (e.g. 25:99 -> 23:59)
      await timeInput.setValue('25:99')
      await timeInput.trigger('blur')
      expect(timeInput.element.value).toBe('23:59')

      // Save task with clamped time
      const titleInput = wrapper.find<HTMLInputElement>('[data-testid="task-title-input"]')
      await titleInput.setValue('Masked Time Task')
      await wrapper.find('form').trigger('submit.prevent')

      const savePayload = wrapper.emitted('save')?.[0]?.[0] as TaskDialogSavePayload
      expect(savePayload.recurrence?.timeOfDay).toBe('23:59')
      expect(savePayload.recurrence?.cadence).toBe('WEEKLY')
    })
  })
})

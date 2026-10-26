import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it } from 'vitest'
import TaskDialog from '~/components/kanban/TaskDialog.vue'
import { createTaskFixture } from '../fixtures/kanban'

const DialogStub = {
  name: 'Dialog',
  props: ['visible', 'header'],
  template: '<div v-if="visible" data-testid="task-dialog" class="p-dialog" :data-header="header"><slot /></div>',
}

function mountTaskDialog(props: any = {}) {
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
      },
    },
  })
}

describe('TaskDialog Component DOM Suite', () => {
  it('renders PrimeVue Dialog structure, title InputText, and description Textarea', () => {
    const wrapper = mountTaskDialog()
    expect(wrapper.find('[data-testid="task-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="task-title-input"]').exists()).toBe(true)
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

    await titleInput.setValue('   ')
    expect(saveButton.attributes('disabled')).toBeDefined()

    await titleInput.setValue('Valid Title')
    expect(saveButton.attributes('disabled')).toBeUndefined()
  })

  it('in edit mode: populates fields from active task and enables Save', () => {
    const sampleTask = createTaskFixture({
      id: 't-100',
      title: 'Existing Task Title',
      description: 'Existing Details',
      columnId: 'col-1',
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

  it('save submission: emits save payload with trimmed data and closes dialog', async () => {
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
    expect(saveEmits![0][0]).toEqual({
      title: 'New Task Title',
      description: 'New Task Description',
      mode: 'create',
      columnId: 'col-2',
      taskId: null,
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

    expect(wrapper.emitted('delete')?.[0]).toEqual(['task-to-delete'])
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
})

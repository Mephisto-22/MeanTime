import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ColumnFormDialog from '~/components/kanban/ColumnFormDialog.vue'
import { kanbanApi } from '~/api/kanban'
import { createColumnFixture } from '../fixtures/kanban'

const DialogStub = {
  name: 'Dialog',
  props: ['visible', 'header'],
  template: '<div v-if="visible" data-testid="column-dialog" class="p-dialog" :data-header="header"><slot /></div>',
}

const SelectStub = {
  name: 'Select',
  props: ['modelValue', 'options', 'optionLabel', 'optionValue'],
  emits: ['update:modelValue'],
  template: `
    <select
      data-testid="auto-clear-preset-select"
      :value="modelValue"
      @change="$emit('update:modelValue', $event.target.value === '' ? null : (isNaN(Number($event.target.value)) ? $event.target.value : Number($event.target.value)))"
    >
      <option
        v-for="o in options"
        :key="String(o.value)"
        :value="String(o.value)"
      >
        {{ o.label }}
      </option>
    </select>
  `,
}

const ToggleSwitchStub = {
  name: 'ToggleSwitch',
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template: `
    <input
      type="checkbox"
      role="switch"
      data-testid="column-auto-clear-toggle"
      :checked="!!modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.checked)"
    />
  `,
}

const InputNumberStub = {
  name: 'InputNumber',
  props: ['modelValue', 'disabled', 'min', 'max', 'placeholder'],
  emits: ['update:modelValue'],
  template: `
    <input
      type="number"
      data-testid="custom-auto-clear-days"
      :value="modelValue"
      :disabled="disabled"
      :min="min"
      :max="max"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', Number($event.target.value))"
    />
  `,
}

function mountDialog(props: Record<string, any> = {}) {
  return mount(ColumnFormDialog, {
    props: {
      visible: true,
      boardId: 'board-1',
      column: null,
      ...props,
    },
    global: {
      plugins: [PrimeVue],
      stubs: {
        Dialog: DialogStub,
        Select: SelectStub,
        ToggleSwitch: ToggleSwitchStub,
        InputNumber: InputNumberStub,
      },
    },
  })
}

describe('ColumnFormDialog Auto-Clear Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders auto-clear toggle off by default for new column', () => {
    const wrapper = mountDialog({ column: null })
    const toggle = wrapper.find('[data-testid="column-auto-clear-toggle"]')
    expect(toggle.exists()).toBe(true)
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.find('[data-testid="auto-clear-preset-select"]').exists()).toBe(false)
  })

  it('restores auto-clear toggle and preset when editing column with preset duration', () => {
    const col = createColumnFixture({
      title: 'Done',
      autoClearDurationSeconds: 259200, // 3 days
    })
    const wrapper = mountDialog({ column: col })

    const toggle = wrapper.find('[data-testid="column-auto-clear-toggle"]')
    expect((toggle.element as HTMLInputElement).checked).toBe(true)

    const select = wrapper.find('[data-testid="auto-clear-preset-select"]')
    expect(select.exists()).toBe(true)
    expect((select.element as HTMLSelectElement).value).toBe('259200')
    expect(wrapper.find('[data-testid="custom-auto-clear-days"]').exists()).toBe(false)
  })

  it('restores auto-clear toggle, custom preset, and custom days when editing column with custom duration', () => {
    const col = createColumnFixture({
      title: 'Holding',
      autoClearDurationSeconds: 432000, // 5 days
    })
    const wrapper = mountDialog({ column: col })

    const toggle = wrapper.find('[data-testid="column-auto-clear-toggle"]')
    expect((toggle.element as HTMLInputElement).checked).toBe(true)

    const select = wrapper.find('[data-testid="auto-clear-preset-select"]')
    expect(select.exists()).toBe(true)
    expect((select.element as HTMLSelectElement).value).toBe('custom')

    const daysInput = wrapper.find('[data-testid="custom-auto-clear-days"]')
    expect(daysInput.exists()).toBe(true)
    expect((daysInput.element as HTMLInputElement).value).toBe('5')
  })

  it('shows preset select dropdown when auto-clear is toggled on', async () => {
    const wrapper = mountDialog({ column: null })
    expect(wrapper.find('[data-testid="auto-clear-preset-select"]').exists()).toBe(false)

    const toggle = wrapper.find('[data-testid="column-auto-clear-toggle"]')
    await toggle.setValue(true)

    expect(wrapper.find('[data-testid="auto-clear-preset-select"]').exists()).toBe(true)
  })

  it('reveals custom days input when Custom... preset is selected', async () => {
    const wrapper = mountDialog({ column: null })
    const toggle = wrapper.find('[data-testid="column-auto-clear-toggle"]')
    await toggle.setValue(true)

    const select = wrapper.find('[data-testid="auto-clear-preset-select"]')
    expect(wrapper.find('[data-testid="custom-auto-clear-days"]').exists()).toBe(false)

    await select.setValue('custom')
    expect(wrapper.find('[data-testid="custom-auto-clear-days"]').exists()).toBe(true)
  })

  it('submits save payload with calculated preset duration in seconds', async () => {
    const spy = vi.spyOn(kanbanApi, 'createColumn').mockResolvedValue(
      createColumnFixture({ id: 'col-new', title: 'Archived', autoClearDurationSeconds: 604800 })
    )

    const wrapper = mountDialog({ column: null })
    await wrapper.find('#column-title').setValue('Archived')

    // Turn on auto-clear
    await wrapper.find('[data-testid="column-auto-clear-toggle"]').setValue(true)
    // Select 1 week (604800)
    await wrapper.find('[data-testid="auto-clear-preset-select"]').setValue('604800')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(spy).toHaveBeenCalledWith('board-1', {
      title: 'Archived',
      autoClearDurationSeconds: 604800,
    })
  })

  it('submits save payload with calculated custom days duration in seconds', async () => {
    const col = createColumnFixture({ id: 'col-edit', title: 'Backlog', autoClearDurationSeconds: null })
    const spy = vi.spyOn(kanbanApi, 'updateColumn').mockResolvedValue(
      createColumnFixture({ id: 'col-edit', title: 'Backlog', autoClearDurationSeconds: 864000 })
    )

    const wrapper = mountDialog({ column: col })
    await wrapper.find('[data-testid="column-auto-clear-toggle"]').setValue(true)
    await wrapper.find('[data-testid="auto-clear-preset-select"]').setValue('custom')
    await wrapper.find('[data-testid="custom-auto-clear-days"]').setValue(10)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(spy).toHaveBeenCalledWith('col-edit', {
      title: 'Backlog',
      autoClearDurationSeconds: 864000,
    })
  })

  it('submits save payload with autoClearDurationSeconds: null when auto-clear is toggled off', async () => {
    const col = createColumnFixture({ id: 'col-edit', title: 'Done', autoClearDurationSeconds: 259200 })
    const spy = vi.spyOn(kanbanApi, 'updateColumn').mockResolvedValue(
      createColumnFixture({ id: 'col-edit', title: 'Done', autoClearDurationSeconds: null })
    )

    const wrapper = mountDialog({ column: col })
    expect((wrapper.find('[data-testid="column-auto-clear-toggle"]').element as HTMLInputElement).checked).toBe(true)

    // Toggle off
    await wrapper.find('[data-testid="column-auto-clear-toggle"]').setValue(false)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(spy).toHaveBeenCalledWith('col-edit', {
      title: 'Done',
      autoClearDurationSeconds: null,
    })
  })
})

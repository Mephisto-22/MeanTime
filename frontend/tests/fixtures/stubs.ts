export const ToggleSwitchStub = {
  name: 'ToggleSwitch',
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template: `
    <input
      type="checkbox"
      role="switch"
      :checked="Boolean(modelValue)"
      :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.checked)"
    />
  `,
}

export const InputNumberStub = {
  name: 'InputNumber',
  props: ['modelValue', 'min', 'max', 'disabled'],
  emits: ['update:modelValue'],
  template: `
    <input
      type="number"
      :value="modelValue"
      :min="min"
      :max="max"
      :disabled="disabled"
      @input="$emit('update:modelValue', Number($event.target.value))"
    />
  `,
}

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

export const InputMaskStub = {
  name: 'InputMask',
  props: ['modelValue', 'mask', 'placeholder', 'disabled', 'size'],
  emits: ['update:modelValue', 'blur'],
  template: `
    <input
      type="text"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="$emit('update:modelValue', $event.target.value)"
      @blur="$emit('blur', $event)"
    />
  `,
}

export const DatePickerStub = {
  name: 'DatePicker',
  props: {
    modelValue: { type: [Date, String, Number, Object, Array], default: null },
    timeOnly: { type: Boolean, default: false },
    dateFormat: { type: String, default: null },
    hourFormat: { type: String, default: '24' },
    placeholder: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    size: { type: String, default: null },
    fluid: { type: Boolean, default: false },
    view: { type: String, default: 'date' },
    showIcon: { type: Boolean, default: false },
    iconDisplay: { type: String, default: 'button' },
  },
  emits: ['update:modelValue', 'blur', 'change'],
  template: `
    <input
      type="text"
      :value="formattedValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="handleInput($event)"
      @blur="handleBlur($event)"
    />
  `,
  computed: {
    isTimeOnly(): boolean {
      return Boolean(this.timeOnly) || (this.timeOnly as any) === ''
    },
    formattedValue(): string {
      if (this.modelValue instanceof Date) {
        if (this.isTimeOnly) {
          const h = String(this.modelValue.getHours()).padStart(2, '0')
          const m = String(this.modelValue.getMinutes()).padStart(2, '0')
          return `${h}:${m}`
        }
        return String(this.modelValue.getDate())
      }
      return this.modelValue != null ? String(this.modelValue) : ''
    },
  },
  methods: {
    handleInput(e: any) {
      const val = e.target.value
      if (this.isTimeOnly) {
        this.$emit('update:modelValue', val)
      } else {
        const num = parseInt(val, 10)
        if (!isNaN(num)) {
          this.$emit('update:modelValue', num)
        } else {
          this.$emit('update:modelValue', val)
        }
      }
    },
    handleBlur(e: any) {
      this.$emit('blur', e)
      if (e?.target) {
        e.target.value = this.formattedValue
      }
      this.$nextTick(() => {
        if (e?.target) {
          e.target.value = this.formattedValue
        }
      })
    },
  },
}

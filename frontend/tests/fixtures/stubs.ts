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
      } else if (typeof val === 'string' && (val.includes('-') || val.includes('/'))) {
        this.$emit('update:modelValue', new Date(val))
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

export const NuxtLinkStub = {
  name: 'NuxtLink',
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : undefined" @click="$event.preventDefault()"><slot /></a>',
}

export const AppDialogStub = {
  name: 'Dialog',
  inheritAttrs: false,
  props: ['visible', 'header'],
  template: '<div v-if="visible" v-bind="$attrs" class="p-dialog" :data-header="header"><slot /><slot name="footer" /></div>',
}

export const PopoverStub = {
  name: 'Popover',
  inheritAttrs: false,
  emits: ['show', 'hide'],
  expose: ['toggle', 'show', 'hide'],
  data() {
    return {
      visible: false,
    }
  },
  methods: {
    toggle(_event?: Event) {
      this.visible = !this.visible
      this.$emit(this.visible ? 'show' : 'hide')
    },
    show(_event?: Event) {
      if (!this.visible) {
        this.visible = true
        this.$emit('show')
      }
    },
    hide() {
      if (this.visible) {
        this.visible = false
        this.$emit('hide')
      }
    },
  },
  template: '<div v-if="visible" v-bind="$attrs" class="p-popover"><slot /></div>',
}

export const SelectStub = {
  name: 'Select',
  inheritAttrs: false,
  props: ['modelValue', 'options', 'optionLabel', 'optionValue', 'disabled'],
  emits: ['update:modelValue', 'change'],
  template: `
    <select
      v-bind="$attrs"
      :value="modelValue ?? ''"
      :disabled="disabled"
      @change="onChange"
    >
      <option
        v-for="o in options"
        :key="String(getOptionValue(o))"
        :value="getOptionValue(o) ?? ''"
      >
        {{ getOptionLabel(o) }}
      </option>
    </select>
  `,
  methods: {
    getOptionValue(option: any) {
      return this.optionValue ? option[this.optionValue] : (option.id !== undefined ? option.id : option.value)
    },
    getOptionLabel(option: any) {
      return this.optionLabel ? option[this.optionLabel] : (option.title || option.label || option.display_name)
    },
    onChange(event: any) {
      const raw = event.target.value
      if (raw === '' || raw === 'null') {
        this.$emit('update:modelValue', null)
        this.$emit('change', { value: null })
        return
      }
      const matched = (this.options || []).find((o: any) => String(this.getOptionValue(o)) === String(raw))
      const val = matched ? this.getOptionValue(matched) : raw
      this.$emit('update:modelValue', val)
      this.$emit('change', { value: val })
    },
  },
}

<template>
  <div
    data-testid="task-dialog-due-date-section"
    class="flex flex-col gap-3 rounded-xl border border-surface-200/80 bg-surface-50/50 p-4 dark:border-surface-800 dark:bg-surface-900/40 h-full"
  >
    <!-- Header: Icon, Title, Active Date Chip & Toggle -->
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-200/70 text-surface-600 dark:bg-surface-800 dark:text-surface-300">
          <i class="pi pi-calendar text-sm" />
        </div>
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2">
            <Label
              for="task-due-date-toggle"
              class="text-sm font-semibold text-surface-900 dark:text-surface-100 cursor-pointer select-none"
            >
              Due date
            </Label>
            <span
              v-if="formattedActiveDeadline"
              class="inline-flex items-center gap-1 rounded bg-primary-100/70 dark:bg-primary-950/80 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 text-[10px] font-mono font-medium"
            >
              {{ formattedActiveDeadline }}
            </span>
          </div>
          <p class="text-xs text-surface-500 dark:text-surface-400 truncate">
            Target completion & collaborator dispatch
          </p>
        </div>
      </div>

      <ToggleSwitch
        id="task-due-date-toggle"
        v-model="isEnabled"
        data-testid="task-due-date-toggle"
      />
    </div>

    <!-- Controls: Connected pickers + Inset Reminder Card with independent toggle -->
    <div
      v-if="isEnabled"
      data-testid="task-due-date-controls"
      class="flex flex-col gap-3.5 pt-3 border-t border-surface-200/70 dark:border-surface-800"
    >
      <!-- Date & Time Inputs: Exact matching dimensions, heights, and styling -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div class="flex flex-col gap-1">
          <Label for="task-due-date-input" class="text-xs font-semibold text-surface-600 dark:text-surface-300">
            Target date
          </Label>
          <DatePicker
            id="task-due-date-input"
            v-model="dateModel"
            date-format="yy-mm-dd"
            show-icon
            icon-display="input"
            placeholder="Select date"
            size="small"
            fluid
            data-testid="task-due-date-input"
            class="text-xs font-medium"
          />
        </div>

        <div class="flex flex-col gap-1">
          <Label for="task-due-time-input" class="text-xs font-semibold text-surface-600 dark:text-surface-300">
            Target time
          </Label>
          <DatePicker
            id="task-due-time-input"
            v-model="timeDateModel"
            time-only
            hour-format="24"
            show-icon
            icon-display="input"
            placeholder="17:00"
            size="small"
            fluid
            data-testid="task-due-time-input"
            class="text-xs font-medium"
          />
        </div>
      </div>

      <!-- Inset Reminder Deck with Independent Toggle -->
      <div class="rounded-lg border border-surface-200/90 bg-surface-100/60 p-3 dark:border-surface-700/80 dark:bg-surface-800/40 flex flex-col gap-3">
        <!-- Toggle Row: Bell icon, Title & Toggle Switch -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <i class="pi pi-bell text-xs text-amber-500" />
            <span class="text-xs font-semibold text-surface-800 dark:text-surface-200 select-none">
              Email collaborator reminder
            </span>
          </div>

          <ToggleSwitch
            id="task-reminder-toggle"
            v-model="isReminderEnabled"
            data-testid="task-reminder-toggle"
          />
        </div>

        <!-- Reminder Subcontrols (when enabled): Balanced vertical rhythm -->
        <div
          v-if="isReminderEnabled"
          class="flex flex-col gap-2.5 pt-2.5 border-t border-surface-200/70 dark:border-surface-700/70"
        >
          <!-- Side-by-side Label & Select filling the remaining width -->
          <div class="flex items-center gap-3">
            <Label
              for="task-reminder-select"
              class="text-xs font-semibold text-surface-600 dark:text-surface-300 shrink-0 whitespace-nowrap"
            >
              Send reminder
            </Label>
            <div class="flex-1 min-w-0">
              <Select
                id="task-reminder-select"
                v-model="reminderOffsetModel"
                :options="reminderOptions"
                option-label="label"
                option-value="value"
                size="small"
                fluid
                data-testid="task-reminder-select"
                class="text-xs w-full"
              />
            </div>
          </div>

          <!-- Calculated Dispatch Time Callout -->
          <div
            v-if="computedDispatchTimestamp"
            class="rounded-md bg-surface-0 dark:bg-surface-900 p-2.5 border border-surface-200/80 dark:border-surface-700/60 text-[11px] text-surface-600 dark:text-surface-300 flex items-start gap-2.5"
          >
            <i class="pi pi-send text-primary-500 text-xs mt-0.5 shrink-0" />
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="font-medium text-surface-800 dark:text-surface-100">
                Dispatch time: {{ computedDispatchTimestamp }}
              </span>
              <span class="text-surface-400">
                To board owner & active collaborators ({{ userTimezone }})
              </span>
            </div>
          </div>
        </div>

        <div v-else class="text-[11px] text-surface-400 italic pt-0.5">
          No automated email will be sent for this deadline.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { REMINDER_PRESET_OPTIONS } from '~/api/kanban'

const props = withDefaults(
  defineProps<{
    enabled: boolean
    dueDate: Date | string | number | null
    dueTime: string
    reminderOffsetSeconds: number | null
    userTimezone?: string
  }>(),
  {
    enabled: false,
    dueDate: null,
    dueTime: '17:00',
    reminderOffsetSeconds: 3600,
    userTimezone: 'UTC',
  },
)

const emit = defineEmits<{
  (e: 'update:enabled', val: boolean): void
  (e: 'update:dueDate', val: Date | null): void
  (e: 'update:dueTime', val: string): void
  (e: 'update:reminderOffsetSeconds', val: number | null): void
}>()

const isEnabled = computed({
  get: () => props.enabled,
  set: (val: boolean) => emit('update:enabled', val),
})

const dateModel = computed({
  get: () => {
    if (!props.dueDate) return null
    if (props.dueDate instanceof Date) return props.dueDate
    const parsed = new Date(props.dueDate)
    return isNaN(parsed.getTime()) ? null : parsed
  },
  set: (val: Date | string | number | null) => {
    if (!val) {
      emit('update:dueDate', null)
      return
    }
    let d: Date | null = null
    if (val instanceof Date) {
      d = val
    } else if (typeof val === 'string') {
      const parsed = new Date(val)
      d = isNaN(parsed.getTime()) ? null : parsed
    } else if (typeof val === 'number') {
      if (val >= 1 && val <= 31) {
        d = new Date()
        d.setDate(val)
      } else {
        const parsed = new Date(val)
        d = isNaN(parsed.getTime()) ? null : parsed
      }
    }
    emit('update:dueDate', d && !isNaN(d.getTime()) ? d : null)
  },
})

const timeDateModel = computed({
  get: (): Date | null => {
    if (!props.dueTime) return null
    const [h, m] = props.dueTime.split(':').map((n) => parseInt(n, 10))
    const d = new Date()
    d.setHours(h ?? 17, m ?? 0, 0, 0)
    return d
  },
  set: (val: Date | null) => {
    if (!val) {
      emit('update:dueTime', '17:00')
      return
    }
    const anyVal = val as unknown
    if (anyVal instanceof Date) {
      const h = String(anyVal.getHours()).padStart(2, '0')
      const m = String(anyVal.getMinutes()).padStart(2, '0')
      emit('update:dueTime', `${h}:${m}`)
    } else if (typeof anyVal === 'string') {
      emit('update:dueTime', anyVal)
    }
  },
})

const isReminderEnabled = computed({
  get: () => props.reminderOffsetSeconds !== null,
  set: (val: boolean) => {
    if (val) {
      emit('update:reminderOffsetSeconds', 3600)
    } else {
      emit('update:reminderOffsetSeconds', null)
    }
  },
})

const reminderOptions = REMINDER_PRESET_OPTIONS.filter((o) => o.value !== null && o.value !== -1)

const reminderOffsetModel = computed({
  get: () => props.reminderOffsetSeconds ?? 3600,
  set: (val: number | null) => emit('update:reminderOffsetSeconds', val),
})

const formattedActiveDeadline = computed(() => {
  if (!props.dueDate) return null
  const d = new Date(props.dueDate)
  const month = d.toLocaleString('en-US', { month: 'short' })
  const day = d.getDate()
  return `${month} ${day}, ${props.dueTime || '17:00'}`
})

const computedDispatchTimestamp = computed(() => {
  if (!props.dueDate || props.reminderOffsetSeconds === null) return null
  const d = new Date(props.dueDate)
  const [h, m] = props.dueTime.split(':').map((n) => parseInt(n, 10))
  d.setHours(h ?? 17, m ?? 0, 0, 0)

  const dispatchMs = d.getTime() - props.reminderOffsetSeconds * 1000
  const dispatchDate = new Date(dispatchMs)
  return `${dispatchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${String(dispatchDate.getHours()).padStart(2, '0')}:${String(dispatchDate.getMinutes()).padStart(2, '0')}`
})
</script>

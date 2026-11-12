<template>
  <Dialog
    v-model:visible="visible"
    :header="column ? 'Edit Column' : 'Create Column'"
    modal
    class="dialog-sm"
    :closable="!busy"
    :draggable="false"
  >
    <form @submit.prevent="handleSave" class="flex flex-col gap-4">
      <div class="field-group">
        <Label for="column-title" class="font-medium">
          Column Title
        </Label>

        <InputText
          id="column-title"
          v-model="title"
          autofocus
          maxlength="100"
          placeholder="Enter column title"
          :invalid="!!errorMessage && !title.trim()"
          :disabled="busy"
        />

        <small v-if="!title.trim() && attemptedSave" class="text-red-500">
          A column title is required.
        </small>
      </div>

      <div class="flex items-center justify-between gap-4 pt-1">
        <div class="flex flex-col">
          <Label for="column-auto-clear-toggle" class="font-medium text-sm">
            Auto-clear tasks
          </Label>
          <span class="text-xs text-surface-500">
            Automatically archive inactive tasks in this column.
          </span>
        </div>

        <ToggleSwitch
          id="column-auto-clear-toggle"
          v-model="autoClearEnabled"
          :disabled="busy"
          data-testid="column-auto-clear-toggle"
        />
      </div>

      <div v-if="autoClearEnabled" class="flex flex-col gap-3">
        <div class="field-group">
          <Label for="auto-clear-preset-select" class="text-sm font-medium">
            Retention Duration
          </Label>

          <Select
            id="auto-clear-preset-select"
            v-model="selectedPreset"
            :options="AUTO_CLEAR_PRESET_OPTIONS"
            optionLabel="label"
            optionValue="value"
            placeholder="Select retention duration"
            :disabled="busy"
            data-testid="auto-clear-preset-select"
          />
        </div>

        <div v-if="selectedPreset === 'custom'" class="field-group">
          <Label for="custom-auto-clear-days" class="text-sm font-medium">
            Custom Days
          </Label>

          <InputNumber
            id="custom-auto-clear-days"
            v-model="customDays"
            :min="1"
            :max="365"
            placeholder="Days before auto-clearing"
            :disabled="busy"
            data-testid="custom-auto-clear-days"
          />
        </div>
      </div>

      <p v-if="errorMessage" class="text-sm text-red-500">
        {{ errorMessage }}
      </p>

      <div class="flex items-center justify-between gap-2">
        <Button
          v-if="column"
          label="Delete"
          icon="pi pi-trash"
          severity="danger"
          text
          type="button"
          :disabled="busy"
          @click="confirmingDelete = !confirmingDelete"
        />

        <div class="ml-auto flex gap-2">
          <Button
            label="Cancel"
            severity="secondary"
            text
            type="button"
            :disabled="busy"
            @click="visible = false"
          />

          <Button
            :label="column ? 'Save Changes' : 'Create Column'"
            type="submit"
            :loading="busy && !confirmingDelete"
            :disabled="busy"
          />
        </div>
      </div>

      <div
        v-if="confirmingDelete"
        class="danger-callout-box"
      >
        <p class="mb-3 text-sm">
          Are you sure you want to delete this column? Tasks in this column
          may also be deleted.
        </p>

        <div class="flex justify-end gap-2">
          <Button
            label="Cancel"
            severity="secondary"
            text
            size="small"
            type="button"
            :disabled="busy"
            @click="confirmingDelete = false"
          />

          <Button
            label="Delete Column"
            severity="danger"
            size="small"
            type="button"
            :loading="busy"
            :disabled="busy"
            @click="handleDelete"
          />
        </div>
      </div>
    </form>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { kanbanApi } from '~/api/kanban'
import type { KanbanColumnDto } from '~/api/kanban'

const props = defineProps<{
  boardId: string | number
  column: KanbanColumnDto | null
}>()

const emit = defineEmits<{
  created: [column: KanbanColumnDto]
  updated: [column: KanbanColumnDto]
  deleted: [columnId: string | number]
}>()

const visible = defineModel<boolean>('visible', { default: false })

interface PresetOption {
  label: string
  value: number | string
}

const AUTO_CLEAR_PRESET_OPTIONS: PresetOption[] = [
  { label: '3 days', value: 259200 },
  { label: '1 week', value: 604800 },
  { label: '2 weeks', value: 1209600 },
  { label: '1 month', value: 2592000 },
  { label: 'Custom...', value: 'custom' },
]

const title = ref('')
const autoClearEnabled = ref(false)
const selectedPreset = ref<number | string>(259200)
const customDays = ref<number | null>(3)
const busy = ref(false)
const attemptedSave = ref(false)
const confirmingDelete = ref(false)
const errorMessage = ref('')

watch(
  () => [visible.value, props.column] as const,
  ([isVisible, column]) => {
    if (isVisible) {
      title.value = column?.title ?? ''
      attemptedSave.value = false
      confirmingDelete.value = false
      errorMessage.value = ''

      const duration = column?.autoClearDurationSeconds ?? (column as any)?.auto_clear_duration_seconds
      if (duration && duration > 0) {
        autoClearEnabled.value = true
        const isStandardPreset = [259200, 604800, 1209600, 2592000].includes(duration)
        if (isStandardPreset) {
          selectedPreset.value = duration
          customDays.value = Math.round(duration / 86400)
        } else {
          selectedPreset.value = 'custom'
          customDays.value = Math.max(1, Math.round(duration / 86400))
        }
      } else {
        autoClearEnabled.value = false
        selectedPreset.value = 259200
        customDays.value = 3
      }
    }
  },
  { immediate: true },
)

const handleSave = async () => {
  attemptedSave.value = true
  errorMessage.value = ''

  const trimmedTitle = title.value.trim()

  if (!trimmedTitle) {
    return
  }

  let autoClearDurationSeconds: number | null = null
  if (autoClearEnabled.value) {
    if (selectedPreset.value === 'custom') {
      const days = customDays.value && customDays.value > 0 ? customDays.value : 1
      autoClearDurationSeconds = days * 86400
    } else {
      autoClearDurationSeconds = Number(selectedPreset.value)
    }
  }

  busy.value = true

  try {
    if (props.column) {
      const updatedColumn = await kanbanApi.updateColumn(
        props.column.id,
        {
          title: trimmedTitle,
          autoClearDurationSeconds,
        },
      )

      emit('updated', updatedColumn)
    } else {
      const createdColumn = await kanbanApi.createColumn(
        props.boardId,
        {
          title: trimmedTitle,
          autoClearDurationSeconds,
        },
      )

      emit('created', createdColumn)
    }

    visible.value = false
  } catch (error) {
    console.error('Failed to save column:', error)
    errorMessage.value = 'Unable to save the column. Please try again.'
  } finally {
    busy.value = false
  }
}

const handleDelete = async () => {
  if (!props.column) {
    return
  }

  busy.value = true
  errorMessage.value = ''

  try {
    await kanbanApi.deleteColumn(props.column.id)

    emit('deleted', props.column.id)
    visible.value = false
  } catch (error) {
    console.error('Failed to delete column:', error)
    errorMessage.value = 'Unable to delete the column. Please try again.'
  } finally {
    busy.value = false
  }
}
</script>

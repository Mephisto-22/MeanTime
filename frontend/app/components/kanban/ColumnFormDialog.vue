<template>
  <Dialog
    v-model:visible="visible"
    :header="column ? 'Edit Column' : 'Create Column'"
    modal
    :style="{ width: '25rem' }"
    :closable="!busy"
    :draggable="false"
  >
    <form @submit.prevent="handleSave" class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <label for="column-title" class="font-medium">
          Column Title
        </label>

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
        class="rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950"
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

const title = ref('')
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
    }
  },
)

const handleSave = async () => {
  attemptedSave.value = true
  errorMessage.value = ''

  const trimmedTitle = title.value.trim()

  if (!trimmedTitle) {
    return
  }

  busy.value = true

  try {
    if (props.column) {
      const updatedColumn = await kanbanApi.updateColumn(
        props.column.id,
        { title: trimmedTitle },
      )

      emit('updated', updatedColumn)
    } else {
      const createdColumn = await kanbanApi.createColumn(
        props.boardId,
        { title: trimmedTitle },
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
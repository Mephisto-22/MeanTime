<template>
  <Dialog
    v-model:visible="isVisible"
    data-testid="task-dialog"
    modal
    :header="mode === 'edit' ? 'Edit task' : 'New task'"
    :draggable="false"
    class="w-[min(32rem,calc(100vw-2rem))]"
  >
    <form
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="save"
    >
      <div class="flex flex-col gap-2">
        <Label for="task-title-input">Title</Label>
        <InputText
          id="task-title-input"
          v-model="title"
          data-testid="task-title-input"
          autofocus
          fluid
          placeholder="Task title"
        />
      </div>

      <div class="flex flex-col gap-2">
        <Label for="task-description-input">Description (optional)</Label>
        <Textarea
          id="task-description-input"
          v-model="description"
          data-testid="task-description-input"
          rows="4"
          fluid
          placeholder="Task description"
        />
      </div>

      <!-- Delete Confirmation Step -->
      <div
        v-if="isConfirmingDelete"
        data-testid="task-delete-confirmation"
        class="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30"
      >
        <p class="text-sm font-medium text-red-800 dark:text-red-200">
          Are you sure you want to delete this task? This cannot be undone.
        </p>
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            size="small"
            text
            data-testid="task-cancel-delete-button"
            @click="cancelDelete"
          />
          <Button
            type="button"
            label="Confirm Delete"
            severity="danger"
            size="small"
            data-testid="task-confirm-delete-button"
            @click="confirmDelete"
          />
        </div>
      </div>

      <!-- Action Buttons -->
      <div v-if="!isConfirmingDelete" class="flex items-center justify-between gap-2 pt-2">
        <div>
          <Button
            v-if="mode === 'edit'"
            type="button"
            label="Delete Task"
            severity="danger"
            text
            data-testid="task-delete-button"
            @click="initiateDelete"
          />
        </div>
        <div class="flex items-center gap-2">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            text
            data-testid="task-cancel-button"
            @click="cancel"
          />
          <Button
            type="submit"
            data-testid="task-save-button"
            :label="mode === 'edit' ? 'Save' : 'Create'"
            :disabled="isSaveDisabled"
          />
        </div>
      </div>
    </form>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { KanbanTaskDto, TaskDialogSavePayload } from '~/api/kanban'

interface Props {
  visible?: boolean
  mode: 'create' | 'edit'
  task?: KanbanTaskDto | null
  columnId?: string | number | null
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  task: null,
  columnId: null,
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'save', payload: TaskDialogSavePayload): void
  (e: 'delete', taskId: string | number): void
  (e: 'cancel'): void
}>()

const isVisible = computed({
  get: () => props.visible,
  set: (val: boolean) => emit('update:visible', val),
})

const title = ref('')
const description = ref('')
const isConfirmingDelete = ref(false)

const trimmedTitle = computed(() => title.value.trim())
const isSaveDisabled = computed(() => trimmedTitle.value === '')

const syncFormWithProps = () => {
  isConfirmingDelete.value = false
  if (props.mode === 'edit' && props.task) {
    title.value = props.task.title ?? ''
    description.value = props.task.description ?? ''
  } else {
    title.value = ''
    description.value = ''
  }
}

watch(
  () => props.visible,
  (isOpen) => {
    if (isOpen) {
      syncFormWithProps()
    }
  },
  { immediate: true },
)

watch(
  () => props.task,
  () => {
    if (props.visible) {
      syncFormWithProps()
    }
  },
)

const initiateDelete = () => {
  isConfirmingDelete.value = true
}

const cancelDelete = () => {
  isConfirmingDelete.value = false
}

const confirmDelete = () => {
  if (props.task?.id != null) {
    emit('delete', props.task.id)
  }
  isVisible.value = false
  isConfirmingDelete.value = false
}

const cancel = () => {
  isVisible.value = false
  isConfirmingDelete.value = false
  emit('cancel')
}

const save = () => {
  if (isSaveDisabled.value || isConfirmingDelete.value) {
    return
  }
  emit('save', {
    title: trimmedTitle.value,
    description: description.value.trim(),
    mode: props.mode,
    columnId: props.columnId ?? (props.task?.columnId ?? null),
    taskId: props.task?.id ?? null,
  })
  isVisible.value = false
}

defineExpose({
  title,
  description,
  isSaveDisabled,
  isVisible,
  isConfirmingDelete,
  initiateDelete,
  cancelDelete,
  confirmDelete,
  cancel,
  save,
})
</script>

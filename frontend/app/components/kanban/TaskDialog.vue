<template>
  <Dialog
    v-model:visible="isVisible"
    data-testid="task-dialog"
    modal
    :header="mode === 'edit' ? 'Edit task' : 'New task'"
    :draggable="false"
    class="w-[min(50rem,calc(100vw-2rem))]"
  >
    <form class="flex flex-col gap-5 pt-1" novalidate @submit.prevent="save">
      <!-- Frameless / Editorial Title Input -->
      <div class="flex flex-col gap-1">
        <Label for="task-title-input" class="sr-only">Task Title</Label>
        <InputText
          id="task-title-input"
          v-model="title"
          data-testid="task-title-input"
          autofocus
          required
          :class="isSaveDisabled ? '!border-red-500 dark:!border-red-400' : ''"
          maxlength="200"
          :invalid="isSaveDisabled"
          :aria-invalid="isSaveDisabled"
          :aria-describedby="isSaveDisabled ? 'task-title-error' : undefined"
          fluid
          placeholder="Task title..."
          class="text-xl font-bold tracking-tight border-0 border-b border-surface-200/90 rounded-none px-0 py-2 focus:ring-0 focus:border-primary-500 dark:border-surface-700 bg-transparent placeholder-surface-400"
        />
        <small v-if="isSaveDisabled" id="task-title-error" class="text-red-600 dark:text-red-400">Enter a title for the task.</small>
      </div>

      <!-- Properties Section: Left (Stacked Dropdowns) & Right (Static Add Tag + Flowing Attached Tags + In-Layout Suggestions) -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-5 py-2 border-b border-surface-200/70 pb-4 dark:border-surface-800">
        <!-- Left: Stacked Dropdowns (Column + Priority) (5 cols) -->
        <div class="flex flex-col gap-3 md:col-span-5">
          <!-- Column Selector / Badge -->
          <div class="flex flex-col gap-1">
            <Label for="task-column-select" class="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
              Column
            </Label>
            <div v-if="mode === 'edit'">
              <Select
                id="task-column-select"
                v-model="selectedColumnId"
                :options="availableColumns"
                option-label="title"
                option-value="id"
                size="small"
                fluid
                data-testid="task-column-select"
                class="text-xs"
              />
            </div>
            <div
              v-else
              data-testid="task-column-badge"
              class="flex items-center h-8 px-2.5 rounded border border-surface-200 bg-surface-50 text-xs font-medium text-surface-600 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300"
            >
              <i class="pi pi-bars text-[10px] mr-1.5 opacity-60" />
              {{ currentColumnTitle }}
            </div>
          </div>

          <!-- Priority Selector (Stacked directly below Column) -->
          <div class="flex flex-col gap-1">
            <Label for="task-priority-select" class="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
              Priority
            </Label>
            <Select
              id="task-priority-select"
              v-model="priority"
              :options="priorityOptions"
              option-label="label"
              option-value="value"
              size="small"
              fluid
              data-testid="task-priority-select"
              class="text-xs"
            >
              <template #value="slotProps">
                <span v-if="slotProps.value" class="inline-flex items-center gap-1.5 font-medium">
                  <span class="h-2 w-2 rounded-full" :class="getPriorityDot(slotProps.value)" />
                  {{ getPriorityLabel(slotProps.value) }}
                </span>
                <span v-else class="text-surface-400">None (Clear)</span>
              </template>
              <template #option="slotProps">
                <span class="inline-flex items-center gap-2 text-xs">
                  <span class="h-2 w-2 rounded-full" :class="getPriorityDot(slotProps.option.value)" />
                  {{ slotProps.option.label }}
                </span>
              </template>
            </Select>
          </div>
        </div>

        <!-- Right: Tags Management (Static Add Tag on left, Tags populate right, In-Layout Suggestions below) (7 cols) -->
        <div class="flex flex-col gap-1.5 md:col-span-7 md:border-l md:border-surface-200/70 md:pl-5 dark:md:border-surface-800">
          <div class="flex items-center justify-between">
            <Label class="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
              Tags
            </Label>
            <span class="text-[11px] text-surface-400">
              {{ attachedTags.length }} attached
            </span>
          </div>

          <!-- Tags input row: Static add tag box on left, attached tags populate to the right -->
          <div class="flex flex-wrap items-center gap-1.5 min-h-[28px]">
            <!-- Static Add Tag Input (rounded-full) -->
            <div class="shrink-0 flex items-center">
              <InputText
                id="task-tag-input"
                v-model="tagInputText"
                type="text"
                maxlength="50"
                placeholder="+ add tag..."
                data-testid="task-tag-input"
                class="!h-6 !w-24 rounded-full border border-dashed border-surface-300 bg-transparent px-2.5 text-[11px] text-surface-800 placeholder-surface-400 focus:!w-36 focus:border-solid focus:border-primary-500 focus:outline-none dark:border-surface-600 dark:text-surface-200 transition-all"
                @keydown.enter.prevent="addTagFromInput"
              />
            </div>

            <!-- Attached Tags (populating to the right of the static box) -->
            <span
              v-for="tag in attachedTags"
              :key="tag.id"
              data-testid="task-attached-tag"
              class="inline-flex items-center gap-1 rounded-full border border-surface-200 bg-surface-100/80 px-2.5 py-0.5 text-[11px] font-medium text-surface-700 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200"
            >
              {{ tag.name }}
              <Button
                type="button"
                text
                rounded
                severity="secondary"
                class="!p-0 !h-auto !w-auto !border-0 bg-transparent text-surface-400 hover:text-surface-700 dark:hover:text-surface-100 focus:outline-none shadow-none cursor-pointer"
                title="Remove tag"
                aria-label="Remove tag"
                data-testid="task-remove-tag-button"
                @click="removeTag(tag.id)"
              >
                &times;
              </Button>
            </span>

            <span
              v-if="attachedTags.length === 0"
              class="text-xs text-surface-400 italic"
            >
              No tags attached yet
            </span>
          </div>

          <!-- In-Layout Suggestions Section: tight spacing, harmonious colors -->
          <div class="flex flex-col gap-1 rounded-lg border border-surface-200/60 bg-surface-100/40 p-2 dark:border-surface-800/80 dark:bg-surface-800/30">
            <div class="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">
              <span>{{ tagInputText.trim() ? 'Matching Tags' : 'Available Library Tags' }}</span>
              <span v-if="suggestedTags.length > 0">Click to attach</span>
            </div>

            <div v-if="suggestedTags.length > 0" class="flex flex-wrap gap-1">
              <Button
                v-for="tag in suggestedTags"
                :key="tag.id"
                type="button"
                data-testid="task-tag-suggestion"
                unstyled
                class="inline-flex items-center rounded-full border border-dashed border-surface-300/90 bg-surface-50/70 px-2.5 py-0.5 text-[11px] font-medium text-surface-600 transition-colors hover:border-solid hover:border-primary-500 hover:bg-primary-50 hover:text-primary-700 dark:border-surface-700 dark:bg-surface-800/70 dark:text-surface-300 dark:hover:border-primary-400 dark:hover:bg-primary-950/40 dark:hover:text-primary-300 cursor-pointer"
                @click="attachExistingTag(tag)"
              >
                + {{ tag.name }}
              </Button>
            </div>
            <div v-else class="text-[11px] text-surface-400 italic py-0.5">
              {{ tagInputText.trim() ? 'No matching tags found. Press Enter to create.' : 'All available library tags attached.' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Description Textarea -->
      <div class="flex flex-col gap-1.5">
        <Label for="task-description-input" class="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400">
          Notes & Description
        </Label>
        <Textarea
          id="task-description-input"
          v-model="description"
          data-testid="task-description-input"
          rows="4"
          fluid
          placeholder="Task description..."
          class="text-sm leading-relaxed"
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
      <div v-if="!isConfirmingDelete" class="flex items-center justify-between border-t border-surface-200/80 pt-3 dark:border-surface-700">
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
import { ref, computed, watch, inject } from 'vue'
import type {
  KanbanTaskDto,
  TaskPriorityType,
  TagDto,
  TaskDialogSavePayload,
  KanbanColumnSummary,
} from '~/api/kanban'
import { kanbanContextKey, TASK_PRIORITY_CONFIG } from '~/api/kanban'

interface Props {
  visible?: boolean
  mode: 'create' | 'edit'
  task?: KanbanTaskDto | null
  columnId?: string | number | null
  availableTags?: TagDto[]
  columns?: KanbanColumnSummary[]
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  task: null,
  columnId: null,
  availableTags: () => [],
  columns: () => [],
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'save', payload: TaskDialogSavePayload): void
  (e: 'delete', taskId: string | number): void
  (e: 'cancel'): void
  (e: 'createTag', name: string): void
}>()

const kanbanContext = inject(kanbanContextKey, null)

const isVisible = computed({
  get: () => props.visible,
  set: (val: boolean) => emit('update:visible', val),
})

const title = ref('')
const description = ref('')
const priority = ref<TaskPriorityType>(null)
const selectedColumnId = ref<string | number | null>(null)
const attachedTags = ref<TagDto[]>([])
const tagInputText = ref('')
const isConfirmingDelete = ref(false)

const priorityOptions: Array<{ label: string; value: TaskPriorityType }> = [
  { label: 'None (Clear)', value: null },
  { label: 'Low', value: 'LOW' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'High', value: 'HIGH' },
]

const availableColumns = computed(() => {
  if (props.columns && props.columns.length > 0) return props.columns
  if (kanbanContext?.columns?.value) return kanbanContext.columns.value
  return []
})

const currentColumnTitle = computed(() => {
  const colId = selectedColumnId.value ?? props.columnId ?? props.task?.columnId ?? (props.task as any)?.column_id
  const col = availableColumns.value.find(c => String(c.id) === String(colId))
  return col?.title ?? 'Default Column'
})

const tagLibrary = computed<TagDto[]>(() => {
  if (props.availableTags && props.availableTags.length > 0) return props.availableTags
  if (kanbanContext?.availableTags?.value) return kanbanContext.availableTags.value
  return []
})

const trimmedTitle = computed(() => title.value.trim())
const isSaveDisabled = computed(() => trimmedTitle.value === '')

const getPriorityDot = (val: TaskPriorityType) => {
  if (val && val in TASK_PRIORITY_CONFIG) {
    return TASK_PRIORITY_CONFIG[val].dotClass
  }
  return 'bg-surface-400'
}

const getPriorityLabel = (val: TaskPriorityType) => {
  if (val && val in TASK_PRIORITY_CONFIG) {
    return TASK_PRIORITY_CONFIG[val].label
  }
  return 'None'
}

const syncFormWithProps = () => {
  isConfirmingDelete.value = false
  tagInputText.value = ''
  if (props.mode === 'edit' && props.task) {
    title.value = props.task.title ?? ''
    description.value = props.task.description ?? ''
    priority.value = props.task.priority ?? null
    selectedColumnId.value = props.task.columnId ?? (props.task as any)?.column_id ?? props.columnId ?? null
    attachedTags.value = props.task.tags ? [...props.task.tags] : []
  } else {
    title.value = ''
    description.value = ''
    priority.value = null
    selectedColumnId.value = props.columnId ?? null
    attachedTags.value = []
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

const suggestedTags = computed<TagDto[]>(() => {
  const query = tagInputText.value.trim().toLowerCase()
  const attachedIds = new Set(attachedTags.value.map(t => String(t.id)))
  const attachedNames = new Set(attachedTags.value.map(t => t.name.toLowerCase()))
  const unattached = tagLibrary.value.filter(
    (t: TagDto) => !attachedIds.has(String(t.id)) && !attachedNames.has(t.name.toLowerCase()),
  )

  if (!query) {
    return unattached
  }
  return unattached.filter((t: TagDto) => t.name.toLowerCase().includes(query))
})

const attachExistingTag = (tag: TagDto) => {
  const isAlreadyAttached = attachedTags.value.some(
    (t: TagDto) => String(t.id) === String(tag.id) || t.name.toLowerCase() === tag.name.toLowerCase(),
  )
  if (!isAlreadyAttached) {
    attachedTags.value.push(tag)
  }
  tagInputText.value = ''
}

const addTagFromInput = async () => {
  const name = tagInputText.value.trim()
  if (!name) return

  const isAlreadyAttached = attachedTags.value.some(
    (t: TagDto) => t.name.toLowerCase() === name.toLowerCase(),
  )
  if (isAlreadyAttached) {
    tagInputText.value = ''
    return
  }

  const existingInLibrary = tagLibrary.value.find(
    (t: TagDto) => t.name.toLowerCase() === name.toLowerCase(),
  )

  if (existingInLibrary) {
    attachExistingTag(existingInLibrary)
  } else {
    if (kanbanContext?.createTag) {
      try {
        const created = await kanbanContext.createTag({ name })
        if (created) {
          attachedTags.value.push(created)
          tagInputText.value = ''
          return
        }
      } catch {
        // The board reports the failed request through the shared toast host.
        return
      }
    }
    const newTag: TagDto = {
      id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
    }
    attachedTags.value.push(newTag)
    emit('createTag', name)
    tagInputText.value = ''
  }
}

const removeTag = (tagId: string | number) => {
  attachedTags.value = attachedTags.value.filter((t: TagDto) => String(t.id) !== String(tagId))
}

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
    columnId: selectedColumnId.value ?? props.columnId ?? (props.task?.columnId ?? (props.task as any)?.column_id ?? null),
    taskId: props.task?.id ?? null,
    priority: priority.value,
    tags: [...attachedTags.value],
    tag_ids: attachedTags.value.map(t => t.id),
  })
  isVisible.value = false
}

defineExpose({
  title,
  description,
  priority,
  selectedColumnId,
  attachedTags,
  tagInputText,
  isSaveDisabled,
  isVisible,
  isConfirmingDelete,
  initiateDelete,
  cancelDelete,
  confirmDelete,
  cancel,
  save,
  addTagFromInput,
  attachExistingTag,
  removeTag,
})
</script>

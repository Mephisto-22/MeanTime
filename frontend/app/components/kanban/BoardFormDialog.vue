<template>
  <Dialog
    v-model:visible="visible"
    data-testid="board-form-dialog"
    modal
    :header="isEditing ? 'Edit board' : 'New board'"
    :draggable="false"
    class="w-[min(28rem,calc(100vw-2rem))]"
  >
    <form
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="save"
    >
      <div class="flex flex-col gap-2">
        <label
          for="board-name"
          class="font-medium"
        >
          Name
        </label>
        <InputText
          id="board-name"
          v-model="name"
          data-testid="board-name-input"
          autofocus
          fluid
          :maxlength="NAME_MAX_LENGTH"
          :invalid="showNameError"
          :aria-describedby="showNameError ? 'board-name-error' : undefined"
        />
        <Message
          v-if="showNameError"
          id="board-name-error"
          data-testid="board-name-error"
          severity="error"
          size="small"
          variant="simple"
        >
          Enter a name for the board.
        </Message>
      </div>

      <div class="flex flex-col gap-2">
        <label
          for="board-description"
          class="font-medium"
        >
          Description
          <span class="font-normal text-surface-500 dark:text-surface-400">
            (optional)
          </span>
        </label>
        <Textarea
          id="board-description"
          v-model="description"
          data-testid="board-description-input"
          rows="3"
          fluid
        />
      </div>

      <Message
        v-if="saveFailed"
        data-testid="board-save-error"
        severity="error"
        :closable="false"
      >
        We couldn't save the board. Try again.
      </Message>

      <div class="flex justify-end gap-2">
        <Button
          type="button"
          label="Cancel"
          severity="secondary"
          text
          :disabled="isSaving"
          @click="visible = false"
        />
        <Button
          type="submit"
          data-testid="board-save-button"
          :label="isEditing ? 'Save' : 'Create'"
          :loading="isSaving"
        />
      </div>
    </form>
  </Dialog>
</template>

<script setup lang="ts">
import {
  kanbanApi,
  type KanbanBoardInput,
  type KanbanBoardSummary,
} from '~/api/kanban';

interface Props {
  /** The board to edit, or null to create a new one. */
  board: KanbanBoardSummary | null;
}

interface Emits {
  /** Fired after the backend has saved the board, so the page can re-fetch. */
  saved: [board: KanbanBoardSummary];
}

// Matches the max_length of Board.title in backend/kanban/models.py.
const NAME_MAX_LENGTH = 100;

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

/** Whether the dialog is open. Bound by the parent with v-model:visible. */
const visible = defineModel<boolean>('visible', {required: true});

const name = ref('');
const description = ref('');
const wasSubmitted = ref(false);
const isSaving = ref(false);
const saveFailed = ref(false);

const isEditing = computed(() => props.board !== null);
const trimmedName = computed(() => name.value.trim());
const showNameError = computed(
  () => wasSubmitted.value && trimmedName.value === '',
);

// Start from a clean form every time the dialog opens, so values and errors
// from the previous use never leak into the next one.
watch(visible, isOpen => {
  if (!isOpen) {
    return;
  }
  name.value = props.board?.name ?? '';
  description.value = props.board?.description ?? '';
  wasSubmitted.value = false;
  saveFailed.value = false;
});

async function save(): Promise<void> {
  wasSubmitted.value = true;
  if (trimmedName.value === '' || isSaving.value) {
    return;
  }

  const input: KanbanBoardInput = {
    name: trimmedName.value,
    description: description.value.trim(),
  };

  isSaving.value = true;
  saveFailed.value = false;
  try {
    const saved =
      props.board !== null
        ? await kanbanApi.updateBoard(props.board.id, input)
        : await kanbanApi.createBoard(input);
    emit('saved', saved);
    visible.value = false;
  } catch {
    saveFailed.value = true;
  } finally {
    isSaving.value = false;
  }
}
</script>

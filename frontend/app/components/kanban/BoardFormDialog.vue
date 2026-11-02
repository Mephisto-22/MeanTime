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
      id="board-form"
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="save"
    >
      <div class="flex flex-col gap-2">
        <Label for="board-title-input">Name</Label>
        <InputText
          id="board-title-input"
          v-model="title"
          data-testid="board-title-input"
          autofocus
          fluid
          :maxlength="TITLE_MAX_LENGTH"
          required
          :invalid="showTitleError"
          :aria-invalid="showTitleError"
          :aria-describedby="showTitleError ? 'board-title-error' : undefined"
        />
        <Message
          v-if="showTitleError"
          id="board-title-error"
          data-testid="board-title-error"
          severity="error"
          size="small"
          variant="simple"
        >
          Enter a name for the board.
        </Message>
      </div>

      <div class="flex flex-col gap-2">
        <Label for="board-description-input">Description (optional)</Label>
        <Textarea
          id="board-description-input"
          v-model="description"
          data-testid="board-description-input"
          rows="3"
          fluid
        />
      </div>
    </form>

    <template #footer>
      <Button
        v-if="isEditing"
        type="button"
        class="mr-auto"
        data-testid="board-delete-button"
        label="Delete board"
        severity="danger"
        text
        :loading="isDeleting"
        :disabled="isBusy"
        @click="deleteBoard"
      />
      <Button
        type="button"
        label="Cancel"
        severity="secondary"
        text
        :disabled="isBusy"
        @click="visible = false"
      />
      <!-- The footer is outside the form, so the form attribute links Save to it. -->
      <Button
        type="submit"
        form="board-form"
        data-testid="board-save-button"
        :label="isEditing ? 'Save' : 'Create'"
        :loading="isSaving"
        :disabled="isBusy || showTitleError"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import {kanbanApi, type KanbanBoardDto} from '~/api/kanban';

interface Props {
  /** The board to edit, or null to create a new one. */
  board: KanbanBoardDto | null;
}

interface Emits {
  /** Fired after the backend has saved the board, so the page can re-fetch. */
  saved: [board: KanbanBoardDto];
  /** Fired after the backend has deleted the board, so the page can re-fetch. */
  deleted: [board: KanbanBoardDto];
}

// Matches the max_length of Board.title in backend/kanban/models.py.
const TITLE_MAX_LENGTH = 100;

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

/** Whether the dialog is open. Bound by the parent with v-model:visible. */
const visible = defineModel<boolean>('visible', {required: true});

const title = ref('');
const description = ref('');
const isSaving = ref(false);
const isDeleting = ref(false);
const notify = useNotifications();

const isEditing = computed(() => props.board !== null);
const isBusy = computed(() => isSaving.value || isDeleting.value);
const trimmedTitle = computed(() => title.value.trim());
const showTitleError = computed(
  () => trimmedTitle.value === '',
);

// Start from a clean form every time the dialog opens, so values and errors
// from the previous use never leak into the next one.
watch(visible, isOpen => {
  if (!isOpen) {
    return;
  }
  title.value = props.board?.title ?? '';
  description.value = props.board?.description ?? '';
}, {immediate: true});

async function save(): Promise<void> {
  if (trimmedTitle.value === '' || isBusy.value) {
    return;
  }

  // The backend replaces both fields on every update, so always send both.
  const payload = {
    title: trimmedTitle.value,
    description: description.value.trim(),
  };

  isSaving.value = true;
  try {
    const saved =
      props.board !== null
        ? await kanbanApi.updateBoard(props.board.id, payload)
        : await kanbanApi.createBoard(payload);
    notify.success(props.board ? 'Board updated.' : 'Board created.');
    emit('saved', saved);
    visible.value = false;
  } catch (error) {
    notify.error(error, 'Unable to save board');
  } finally {
    isSaving.value = false;
  }
}

async function deleteBoard(): Promise<void> {
  if (props.board === null || isBusy.value) {
    return;
  }

  const board = props.board;
  isDeleting.value = true;
  try {
    await kanbanApi.deleteBoard(board.id);
    notify.success('Board deleted.');
    emit('deleted', board);
    visible.value = false;
  } catch (error) {
    notify.error(error, 'Unable to delete board');
  } finally {
    isDeleting.value = false;
  }
}
</script>

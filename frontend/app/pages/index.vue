<template>
  <div class="mx-auto max-w-7xl px-6 py-10">
    <div class="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-3xl font-bold tracking-tight">
          Your boards
        </h2>
        <p class="mt-1 text-surface-600 dark:text-surface-300">
          Pick a board to open, or create a new one.
        </p>
      </div>
      <Button
        v-if="boards.length != 0"
        data-testid="new-board-button"
        label="New board"
        icon="pi pi-plus"
        @click="openCreateDialog"
      />
    </div>

    <!-- Loading (first load only; a re-fetch keeps showing the current boards) -->
    <div
      v-if="status === 'pending' && boards.length === 0"
      data-testid="boards-loading"
      class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      <Skeleton
        v-for="n in 3"
        :key="n"
        height="9rem"
        border-radius="12px"
      />
    </div>

    <!-- Error -->
    <Message
      v-else-if="error"
      data-testid="boards-error"
      severity="error"
      :closable="false"
    >
      <div class="flex flex-wrap items-center gap-3">
        <span>We couldn't load your boards.</span>
        <Button
          label="Try again"
          icon="pi pi-refresh"
          severity="danger"
          text
          size="small"
          @click="() => refresh()"
        />
      </div>
    </Message>

    <!-- Empty -->
    <div
      v-else-if="boards.length === 0"
      data-testid="boards-empty"
      class="rounded-xl border border-dashed border-surface-300 px-6 py-16 text-center dark:border-surface-700"
    >
      <i class="pi pi-th-large text-4xl text-surface-400" />
      <h3 class="mt-4 text-xl font-semibold">
        You have no boards yet
      </h3>
      <p class="mt-1 text-surface-600 dark:text-surface-300">
        Create your first board to start tracking tasks.
      </p>
      <Button
        class="mt-6"
        label="New board"
        icon="pi pi-plus"
        @click="openCreateDialog"
      />
    </div>

    <!-- List -->
    <ul
      v-else
      class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      <li
        v-for="board in boards"
        :key="board.id"
      >
        <KanbanBoardCard
          :board="board"
          @edit="openEditDialog"
        />
      </li>
    </ul>

    <KanbanBoardFormDialog
      v-model:visible="isDialogOpen"
      :board="boardBeingEdited"
      @saved="() => refresh()"
    />
  </div>
</template>

<script setup lang="ts">
import {kanbanApi, type KanbanBoardDto} from '~/api/kanban';

// The backend is the source of truth: after every create or edit the list is
// fetched again rather than patched locally.
const {
  data: boards,
  status,
  error,
  refresh,
} = await useAsyncData('kanban-boards', () => kanbanApi.listBoards(), {
  default: () => [],
});

// State for the create/edit dialog. A null boardBeingEdited means the dialog
// is creating a new board.
const isDialogOpen = ref(false);
const boardBeingEdited = ref<KanbanBoardDto | null>(null);

function openCreateDialog(): void {
  boardBeingEdited.value = null;
  isDialogOpen.value = true;
}

function openEditDialog(board: KanbanBoardDto): void {
  boardBeingEdited.value = board;
  isDialogOpen.value = true;
}
</script>

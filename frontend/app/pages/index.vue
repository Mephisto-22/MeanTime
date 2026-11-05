<template>
  <div class="mx-auto max-w-7xl px-6 py-10 flex flex-col gap-8">
    <Toolbar class="border-none bg-transparent p-0">
      <template #start>
        <div class="flex flex-col gap-1">
          <h1 class="text-3xl font-bold tracking-tight text-surface-900 dark:text-surface-0">
            Your boards
          </h1>
          <p class="text-surface-600 dark:text-surface-400">
            Pick a board to open, or create a new one.
          </p>
        </div>
      </template>
      <template #end>
        <Button
          v-if="boards.length !== 0"
          data-testid="new-board-button"
          label="New board"
          icon="pi pi-plus"
          @click="openCreateDialog"
        />
      </template>
    </Toolbar>

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
    <div
      v-else-if="error"
      data-testid="boards-error"
      class="rounded-lg border border-surface-300 p-4 dark:border-surface-700"
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
    </div>

    <!-- Empty -->
    <Panel
      v-else-if="boards.length === 0"
      data-testid="boards-empty"
      class="border-dashed"
    >
      <div class="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div class="flex h-16 w-16 items-center justify-center rounded-full bg-surface-100 text-surface-400 dark:bg-surface-800 dark:text-surface-500">
          <i class="pi pi-th-large text-3xl" />
        </div>
        <div class="flex flex-col gap-1 max-w-sm">
          <h2 class="text-xl font-semibold text-surface-900 dark:text-surface-0">
            You have no boards yet
          </h2>
          <p class="text-sm text-surface-600 dark:text-surface-400">
            Create your first board to start tracking tasks.
          </p>
        </div>
        <Button
          label="New board"
          icon="pi pi-plus"
          @click="openCreateDialog"
        />
      </div>
    </Panel>

    <!-- List -->
    <ul
      v-else
      class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0"
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
      @deleted="() => refresh()"
    />
  </div>
</template>

<script setup lang="ts">
import {kanbanApi, type KanbanBoardDto} from '~/api/kanban';

const notify = useNotifications();

// The backend is the source of truth: after every create, edit or delete the list is
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

watch(error, value => {
  if (value) notify.error(value, 'Unable to load boards');
}, {immediate: true});
</script>

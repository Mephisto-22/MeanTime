<template>
  <div class="mx-auto max-w-7xl px-6 py-8 flex flex-col gap-6">
    <!-- Loading -->
    <div
      v-if="status === 'pending' && !board"
      data-testid="board-loading"
      class="flex gap-4 overflow-hidden"
    >
      <Skeleton
        v-for="n in 3"
        :key="n"
        width="16rem"
        height="50vh"
        border-radius="12px"
        class="shrink-0"
      />
    </div>

    <!-- Not found: missing, or owned by someone else -->
    <div
      v-else-if="isNotFound"
      data-testid="board-not-found"
      class="rounded-lg border border-surface-300 p-4 dark:border-surface-700"
    >
      This board doesn't exist, or it isn't yours.
    </div>

    <!-- Any other error -->
    <div
      v-else-if="error"
      data-testid="board-error"
      class="rounded-lg border border-surface-300 p-4 dark:border-surface-700"
    >
      <div class="flex flex-wrap items-center gap-3">
        <span>We couldn't load this board.</span>
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

    <template v-else-if="board">
      <KanbanBoard :board="board">
        <template #actions>
          <div
            v-if="board.collaborators && board.collaborators.length > 0"
            data-testid="collaborators-preview"
            class="flex -space-x-2 overflow-hidden"
          >
            <Avatar
              v-for="c in board.collaborators.slice(0, 3)"
              :key="c.id"
              :label="(c.display_name?.charAt(0) || 'U').toUpperCase()"
              shape="circle"
              class="border-2 border-surface-0 bg-primary-100 text-xs font-semibold text-primary-700 dark:border-surface-900 dark:bg-primary-950 dark:text-primary-300"
            />
            <span
              v-if="board.collaborators.length > 3"
              class="flex h-7 w-7 items-center justify-center rounded-full bg-surface-200 text-[10px] font-bold text-surface-600 dark:bg-surface-700 dark:text-surface-300"
            >
              +{{ board.collaborators.length - 3 }}
            </span>
          </div>

          <Button
            label="Share"
            icon="pi pi-users"
            size="small"
            data-testid="board-share-button"
            @click="isShareDialogOpen = true"
          />
        </template>
      </KanbanBoard>
      <p
        v-if="board.columns.length === 0"
        data-testid="board-no-columns"
        class="rounded-xl border border-dashed border-surface-300 px-6 py-10 text-center text-surface-600 dark:border-surface-700 dark:text-surface-300"
      >
        This board has no columns yet.
      </p>
    </template>

    <!-- Board Share Dialog -->
    <BoardShareDialog
      v-if="board"
      v-model:visible="isShareDialogOpen"
      :board="board"
      @collaborators-updated="() => refresh()"
      @left-board="() => navigateTo('/')"
    />
  </div>
</template>

<script setup lang="ts">
import {kanbanApi} from '~/api/kanban';
import BoardShareDialog from '~/components/kanban/BoardShareDialog.vue';

// Board ids are whole numbers; anything else gets Nuxt's 404 page without
// asking the backend.
definePageMeta({
  validate: route => /^\d+$/.test(String(route.params.id)),
});

const route = useRoute();
const notify = useNotifications();
const isShareDialogOpen = ref(false);

const {
  data: board,
  status,
  error,
  refresh,
} = await useAsyncData(
  () => `kanban-board-${route.params.id}`,
  () => kanbanApi.getBoard(String(route.params.id)),
);

// The backend answers 404 both for boards that don't exist and for boards
// that belong to another user.
const isNotFound = computed(() => {
  const err = error.value as
    | {statusCode?: number; cause?: {statusCode?: number}}
    | null
    | undefined;
  return err?.statusCode === 404 || err?.cause?.statusCode === 404;
});

watch(error, value => {
  if (value) notify.error(value, 'Unable to load board');
}, {immediate: true});
</script>

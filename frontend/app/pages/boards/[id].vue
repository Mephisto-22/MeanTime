<template>
  <div class="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-col gap-3 flex-1 h-[calc(100vh-4.25rem)] overflow-hidden">
    <!-- Loading -->
    <div
      v-if="status === 'pending' && !board"
      data-testid="board-loading"
      class="flex gap-4 overflow-hidden flex-1"
    >
      <Skeleton
        v-for="n in 3"
        :key="n"
        width="18rem"
        height="100%"
        border-radius="12px"
        class="shrink-0"
      />
    </div>

    <!-- Not found: missing, or owned by someone else -->
    <div
      v-else-if="isNotFound"
      data-testid="board-not-found"
      class="error-state-card"
    >
      This board doesn't exist, or it isn't yours.
    </div>

    <!-- Any other error -->
    <div
      v-else-if="error"
      data-testid="board-error"
      class="error-state-card"
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
      <KanbanBoard :board="board" class="flex-1 min-h-0">
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
              class="border-2 border-surface-0 user-avatar-primary text-xs font-semibold dark:border-surface-900"
            />
            <span
              v-if="board.collaborators.length > 3"
              class="avatar-overflow-badge"
            >
              +{{ board.collaborators.length - 3 }}
            </span>
          </div>

          <Button
            label="Share"
            icon="pi pi-users"
            data-testid="board-share-button"
            class="h-fit shrink-0"
            @click="isShareDialogOpen = true"
          />
        </template>
      </KanbanBoard>
      <p
        v-if="board.columns.length === 0"
        data-testid="board-no-columns"
        class="rounded-xl border border-dashed border-surface-300 px-6 py-12 text-center text-surface-600 dark:border-surface-700 dark:text-surface-400"
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

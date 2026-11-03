<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <NuxtLink
      to="/"
      data-testid="back-to-boards"
      class="mb-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
    >
      <i class="pi pi-arrow-left text-xs" />
      All boards
    </NuxtLink>

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
      class="rounded-lg border border-surface-300 p-4"
    >
      This board doesn't exist, or it isn't yours.
    </div>

    <!-- Any other error -->
    <div
      v-else-if="error"
      data-testid="board-error"
      class="rounded-lg border border-surface-300 p-4"
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
      <KanbanBoard :board="board" />
      <p
        v-if="board.columns.length === 0"
        data-testid="board-no-columns"
        class="mt-4 rounded-xl border border-dashed border-surface-300 px-6 py-10 text-center text-surface-600 dark:border-surface-700 dark:text-surface-300"
      >
        This board has no columns yet.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import {kanbanApi} from '~/api/kanban';

// Board ids are whole numbers; anything else gets Nuxt's 404 page without
// asking the backend.
definePageMeta({
  validate: route => /^\d+$/.test(String(route.params.id)),
});

const route = useRoute();
const notify = useNotifications();

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

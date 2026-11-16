<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 data-testid="analytics-title" class="text-xl font-bold tracking-tight text-surface-900 dark:text-surface-0">
        {{ analytics ? `${analytics.title} analytics` : 'Board analytics' }}
      </h1>
      <Button
        as="router-link"
        :to="`/boards/${route.params.id}`"
        label="Back to board"
        icon="pi pi-arrow-left"
        severity="secondary"
        text
        data-testid="analytics-back-link"
      />
    </div>

    <!-- Loading -->
    <div
      v-if="status === 'pending' && !analytics"
      data-testid="analytics-loading"
      class="grid gap-4 md:grid-cols-3"
    >
      <Skeleton height="8rem" border-radius="12px" />
      <Skeleton height="8rem" border-radius="12px" class="md:col-span-2" />
    </div>

    <!-- Not found: missing, or a board the user can't open -->
    <div
      v-else-if="isNotFound"
      data-testid="analytics-not-found"
      class="error-state-card"
    >
      This board doesn't exist, or it isn't shared with you.
    </div>

    <!-- Any other error -->
    <div
      v-else-if="error"
      data-testid="analytics-error"
      class="error-state-card"
    >
      <div class="flex flex-wrap items-center gap-3">
        <span>We couldn't load this board's analytics.</span>
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

    <!-- No tracked time yet -->
    <Message
      v-else-if="analytics && analytics.totalSeconds === 0"
      data-testid="analytics-empty"
      severity="secondary"
      icon="pi pi-clock"
    >
      No time has been tracked on this board yet. Start a timer or log past work on a task to see it here.
    </Message>

    <BoardAnalyticsSummary v-else-if="analytics" :analytics="analytics" />
  </div>
</template>

<script setup lang="ts">
import {analyticsApi} from '~/api/analytics';
import BoardAnalyticsSummary from '~/components/analytics/BoardAnalyticsSummary.vue';

// Board ids are whole numbers; anything else gets Nuxt's 404 page without
// asking the backend.
definePageMeta({
  validate: route => /^\d+$/.test(String(route.params.id)),
});

const route = useRoute();
const notify = useNotifications();

const {
  data: analytics,
  status,
  error,
  refresh,
} = await useAsyncData(
  () => `board-analytics-${route.params.id}`,
  () => analyticsApi.getBoardAnalytics(String(route.params.id)),
);

// The backend answers 404 both for boards that don't exist and for boards
// the user can't open.
const isNotFound = computed(() => {
  const err = error.value as
    | {statusCode?: number; cause?: {statusCode?: number}}
    | null
    | undefined;
  return err?.statusCode === 404 || err?.cause?.statusCode === 404;
});

watch(error, value => {
  if (value && !isNotFound.value) notify.error(value, 'Unable to load board analytics');
}, {immediate: true});
</script>

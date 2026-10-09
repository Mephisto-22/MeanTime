<template>
  <div class="mx-auto max-w-7xl px-6 py-10">
    <div class="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">
          Your dashboards
        </h1>
        <p class="mt-1 text-surface-600 dark:text-surface-300">
          Pick a dashboard to open, or create a new one.
        </p>
      </div>
      <Button
        data-testid="new-dashboard-button"
        label="New dashboard"
        icon="pi pi-plus"
        @click="openCreateDialog"
      />
    </div>

    <!-- Loading -->
    <div
      v-if="status === 'pending'"
      data-testid="dashboards-loading"
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
      data-testid="dashboards-error"
      severity="error"
      :closable="false"
    >
      <div class="flex flex-wrap items-center gap-3">
        <span>We couldn't load your dashboards.</span>
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
      v-else-if="dashboardsStore.dashboards.length === 0"
      data-testid="dashboards-empty"
      class="rounded-xl border border-dashed border-surface-300 px-6 py-16 text-center dark:border-surface-700"
    >
      <i class="pi pi-th-large text-4xl text-surface-400" />
      <h2 class="mt-4 text-xl font-semibold">
        You have no dashboards yet
      </h2>
      <p class="mt-1 text-surface-600 dark:text-surface-300">
        Create your first dashboard to start tracking tasks.
      </p>
      <Button
        class="mt-6"
        label="New dashboard"
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
        v-for="dashboard in dashboardsStore.dashboards"
        :key="dashboard.id"
      >
        <DashboardCard
          :dashboard="dashboard"
          @edit="openEditDialog"
        />
      </li>
    </ul>

    <!-- TODO: Mount the create/edit dialog here, driven by isDialogOpen and dashboardBeingEdited. -->
  </div>
</template>

<script setup lang="ts">
import {dashboardApi, type Dashboard} from '~/api';

const dashboardsStore = useDashboardsStore();

const {status, error, refresh} = await useAsyncData(
  'dashboards-list',
  async () => {
    const dashboards = await dashboardApi.list();
    dashboardsStore.setDashboards(dashboards);
    return dashboards;
  },
);

// State the create/edit dialog will read. A null dashboardBeingEdited means
// the dialog is creating a new dashboard.
const isDialogOpen = ref(false);
const dashboardBeingEdited = ref<Dashboard | null>(null);

function openCreateDialog(): void {
  dashboardBeingEdited.value = null;
  isDialogOpen.value = true;
}

function openEditDialog(dashboard: Dashboard): void {
  dashboardBeingEdited.value = dashboard;
  isDialogOpen.value = true;
}
</script>

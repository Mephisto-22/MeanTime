import {defineStore} from 'pinia';
import type {Dashboard} from '~/api';

/** Holds the current user's dashboards so pages and dialogs share one list. */
export const useDashboardsStore = defineStore('dashboards', () => {
  const dashboards = ref<Dashboard[]>([]);

  /** Replaces the whole list, for example after loading it from the API. */
  function setDashboards(newDashboards: Dashboard[]): void {
    dashboards.value = newDashboards;
  }

  return {
    dashboards,
    setDashboards,
  };
});

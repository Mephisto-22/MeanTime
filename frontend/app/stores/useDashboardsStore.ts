import {defineStore} from 'pinia';
import type {Dashboard} from '~/api';

/** Holds the current user's dashboards so pages and dialogs share one list. */
export const useDashboardsStore = defineStore('dashboards', () => {
  const dashboards = ref<Dashboard[]>([]);

  /** Replaces the whole list, for example after loading it from the API. */
  function setDashboards(newDashboards: Dashboard[]): void {
    dashboards.value = newDashboards;
  }

  /** Appends a newly created dashboard to the list. */
  function addDashboard(dashboard: Dashboard): void {
    dashboards.value.push(dashboard);
  }

  /** Swaps in the saved version of a dashboard that is already in the list. */
  function replaceDashboard(dashboard: Dashboard): void {
    const index = dashboards.value.findIndex(d => d.id === dashboard.id);
    if (index !== -1) {
      dashboards.value[index] = dashboard;
    }
  }

  return {
    dashboards,
    setDashboards,
    addDashboard,
    replaceDashboard,
  };
});

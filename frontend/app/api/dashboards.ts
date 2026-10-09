import {apiService} from '~/services/ApiService';

/** A kanban board owned by the current user. */
export interface Dashboard {
  id: number;
  name: string;
  description?: string;
}

/** The fields a user can set when creating or editing a dashboard. */
export interface DashboardPayload {
  name: string;
  description?: string;
}

// TODO: Set to false once the backend exposes the /api/dashboards endpoints.
const USE_PLACEHOLDER_DATA = true;

// Stands in for the database while USE_PLACEHOLDER_DATA is true. Changes live
// only in the browser's memory, so they are lost when the page is reloaded.
const placeholderDashboards: Dashboard[] = [
  {id: 1, name: 'School', description: 'Assignments, labs, and exam prep.'},
  {
    id: 2,
    name: 'MeanTime Sprint 1',
    description: 'Tasks for the first sprint of the project.',
  },
  {id: 3, name: 'Personal'},
];

/** Client for the dashboard endpoints of the backend API. */
export class DashboardApi {
  readonly endpoint = '/api/dashboards';

  /** Fetches every dashboard that belongs to the current user. */
  async list(): Promise<Dashboard[]> {
    if (USE_PLACEHOLDER_DATA) {
      return placeholderDashboards.map(dashboard => ({...dashboard}));
    }
    return await apiService.get<Dashboard[]>(this.endpoint);
  }

  /** Creates a dashboard and returns it with its newly assigned id. */
  async create(payload: DashboardPayload): Promise<Dashboard> {
    if (USE_PLACEHOLDER_DATA) {
      const highestId = Math.max(0, ...placeholderDashboards.map(d => d.id));
      const dashboard: Dashboard = {...payload, id: highestId + 1};
      placeholderDashboards.push(dashboard);
      return {...dashboard};
    }
    return await apiService.post<Dashboard>(this.endpoint, payload);
  }

  /** Replaces the editable fields of an existing dashboard. */
  async update(id: number, payload: DashboardPayload): Promise<Dashboard> {
    if (USE_PLACEHOLDER_DATA) {
      const index = placeholderDashboards.findIndex(d => d.id === id);
      if (index === -1) {
        throw new Error(`Dashboard ${id} does not exist.`);
      }
      const dashboard: Dashboard = {...payload, id};
      placeholderDashboards[index] = dashboard;
      return {...dashboard};
    }
    return await apiService.put<Dashboard>(`${this.endpoint}/${id}`, payload);
  }
}

export const dashboardApi = new DashboardApi();

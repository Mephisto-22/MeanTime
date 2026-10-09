import {apiService} from '~/services/ApiService';

/** A kanban board owned by the current user. */
export interface Dashboard {
  id: number;
  name: string;
  description?: string;
}

// TODO: Set to false once the backend exposes GET /api/dashboards.
const USE_PLACEHOLDER_DATA = true;

const PLACEHOLDER_DASHBOARDS: readonly Dashboard[] = [
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
      return PLACEHOLDER_DASHBOARDS.map(dashboard => ({...dashboard}));
    }
    return await apiService.get<Dashboard[]>(this.endpoint);
  }
}

export const dashboardApi = new DashboardApi();

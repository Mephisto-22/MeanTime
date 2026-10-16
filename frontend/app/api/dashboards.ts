import {apiService} from '~/services/ApiService';

// TODO: Match the backend Board schemas (BoardOut and BoardIn in
// backend/kanban/schemas.py, being built on feature/kanban-board-api). They
// call the name field `title`, always send `description` as a string (empty
// when unset), and also return `columns`, `created_at` and `updated_at`.
// Either rename the fields here and in the components, or map them inside
// DashboardApi. KanbanBoardDto in api/kanban.ts describes the same board, so
// consider sharing one type.

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

// TODO: Set to false once the board endpoints are merged into dev, then
// delete placeholderDashboards and the placeholder branches below.
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

// TODO: Send the user's access token (useAuthStore().accessToken) as an
// `Authorization: Bearer` header on every request; the backend rejects
// requests without one. Adding it once in ApiService would cover every API
// class, instead of passing headers per call the way AuthApi.me() does.

/** Client for the dashboard endpoints of the backend API. */
export class DashboardApi {
  // TODO: Change to '/api/kanban/boards', where the board router is mounted.
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
    // TODO: The backend updates boards with PATCH, not PUT. Add a patch()
    // method to ApiService and use it here.
    return await apiService.put<Dashboard>(`${this.endpoint}/${id}`, payload);
  }
}

export const dashboardApi = new DashboardApi();

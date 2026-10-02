import { apiService } from '~/services/ApiService'

export interface HealthRequest {
  timestamp?: number
}

export interface HealthResponse {
  status: 'ok' | 'error'
  database: 'connected' | 'unhealthy' | string
}

export class HealthApi {
  readonly endpoint = '/api/health'

  /**
   * Asynchronously calls GET /api/health to retrieve API and database health status.
   */
  async checkHealth(params?: HealthRequest): Promise<HealthResponse> {
    return await apiService.get<HealthResponse>(this.endpoint, params)
  }
}

export const healthApi = new HealthApi()

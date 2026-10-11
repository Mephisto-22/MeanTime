import { apiService } from '~/services/ApiService'

export interface LoginRequest {
  username: string
  password: string
}

export interface RegistrationRequest extends LoginRequest {
  email: string
}

export interface AuthTokens {
  access: string
  refresh: string
}

// Provisional contract: align these routes and token keys with the backend auth API.
export class AuthApi {
  readonly endpoint = '/api/auth'

  login(credentials: LoginRequest): Promise<AuthTokens> {
    return apiService.post<AuthTokens>(`${this.endpoint}/login`, credentials)
  }

  async register(details: RegistrationRequest): Promise<void> {
    await apiService.post(`${this.endpoint}/register`, details)
  }
}

export const authApi = new AuthApi()

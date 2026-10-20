import { apiService } from '~/services/ApiService'
import type { User } from '~/stores/auth'

export interface LoginRequest {
  email: string
  password: string
}

export interface RegistrationRequest extends LoginRequest {
  display_name: string
  timezone?: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
}

export interface LoginResponse extends AuthTokens {
  token_type: string
  expires_in: number
}

export interface RefreshResponse {
  access_token: string
  token_type: string
  expires_in: number
}

// Matches backend/users/schemas.py; user profiles are fetched separately via /me.
export class AuthApi {
  readonly endpoint = '/api/auth'

  login(credentials: LoginRequest): Promise<LoginResponse> {
    return apiService.post<LoginResponse>(`${this.endpoint}/login`, credentials, { auth: false })
  }

  register(details: RegistrationRequest): Promise<User> {
    return apiService.post<User>(`${this.endpoint}/register`, details, { auth: false })
  }

  refresh(refreshToken: string): Promise<RefreshResponse> {
    return apiService.post<RefreshResponse>(`${this.endpoint}/refresh`, { refresh_token: refreshToken }, { auth: false })
  }

  me(accessToken: string): Promise<User> {
    return apiService.get<User>(`${this.endpoint}/me`, undefined)
  }
}

export const authApi = new AuthApi()

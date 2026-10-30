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

export interface PasswordResetLink {
  uid: string
  token: string
}

export interface PasswordResetConfirmation extends PasswordResetLink {
  password: string
  password_confirm: string
}

export interface AuthMessage {
  detail: string
}

export interface SignInProviders {
  providers: string[]
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

  requestPasswordReset(email: string): Promise<AuthMessage> {
    return apiService.post<AuthMessage>(`${this.endpoint}/password-reset`, { email }, { auth: false })
  }

  validatePasswordReset(link: PasswordResetLink): Promise<AuthMessage> {
    return apiService.post<AuthMessage>(`${this.endpoint}/password-reset/validate`, link, { auth: false })
  }

  confirmPasswordReset(details: PasswordResetConfirmation): Promise<AuthMessage> {
    return apiService.post<AuthMessage>(`${this.endpoint}/password-reset/confirm`, details, { auth: false })
  }

  // Google sign-in is a full-page navigation, not a request: the backend
  // redirects the browser to Google, which sends it back to /oauth/callback.
  readonly googleSignInUrl = `${this.endpoint}/oauth/google/start`

  /** Sign-in providers the backend has credentials for. */
  providers(): Promise<SignInProviders> {
    return apiService.get<SignInProviders>(`${this.endpoint}/oauth/providers`, undefined, { auth: false })
  }
}

export const authApi = new AuthApi()

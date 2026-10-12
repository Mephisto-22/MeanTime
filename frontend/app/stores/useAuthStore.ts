import { defineStore } from 'pinia'
import { authApi, type AuthTokens, type LoginRequest, type LoginResponse, type RegistrationRequest } from '~/api/auth'

export interface User {
  id: number
  email: string
  username: string // Display name; email is the login identifier.
}

export interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
}

export const AUTH_STORAGE_KEY = 'meantime.auth'

function validTokens(tokens: AuthTokens): boolean {
  return typeof tokens?.access === 'string' && !!tokens.access &&
    typeof tokens?.refresh === 'string' && !!tokens.refresh
}

function validUser(user: User): boolean {
  return typeof user?.id === 'number' && Number.isFinite(user.id) &&
    typeof user?.email === 'string' && !!user.email && typeof user?.username === 'string'
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({ accessToken: null, refreshToken: null, user: null }),
  getters: {
    // Indicates a stored session; protected endpoints still validate token validity.
    isAuthenticated: (state): boolean => !!(state.accessToken && state.refreshToken && state.user),
  },
  actions: {
    persist() {
      if (!import.meta.client) return
      try {
        if (this.isAuthenticated) {
          const state: AuthState = {
            accessToken: this.accessToken, refreshToken: this.refreshToken, user: this.user,
          }
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state))
        } else {
          localStorage.removeItem(AUTH_STORAGE_KEY)
        }
      } catch {
        // Storage may be unavailable; the in-memory session still works.
      }
    },
    restoreSession() {
      if (!import.meta.client) return
      try {
        const saved = localStorage.getItem(AUTH_STORAGE_KEY)
        if (!saved) return
        const state = JSON.parse(saved)
        const tokens = { access: state?.accessToken, refresh: state?.refreshToken }
        if (!validTokens(tokens) || !validUser(state?.user)) {
          this.clearTokens()
          return
        }
        this.$patch({ accessToken: tokens.access, refreshToken: tokens.refresh, user: state.user })
      } catch {
        this.clearTokens()
      }
    },
    setTokens(tokens: AuthTokens) {
      if (!validTokens(tokens)) throw new Error('The authentication response did not include valid tokens.')
      this.$patch({ accessToken: tokens.access, refreshToken: tokens.refresh })
      this.persist()
    },
    setSession(response: LoginResponse) {
      if (!validTokens(response) || !validUser(response?.user)) {
        throw new Error('The authentication response did not include valid tokens and user details.')
      }
      this.$patch({ accessToken: response.access, refreshToken: response.refresh, user: response.user })
      this.persist()
    },
    clearTokens() {
      this.$reset()
      this.persist()
    },
    async login(credentials: LoginRequest) {
      this.setSession(await authApi.login(credentials))
    },
    async register(details: RegistrationRequest) {
      await authApi.register(details)
    },
  },
})

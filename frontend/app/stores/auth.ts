import { defineStore } from 'pinia'
import { authApi, type AuthTokens, type LoginRequest, type RegistrationRequest } from '~/api/auth'

export interface User {
  id: number
  email: string
  display_name: string
  timezone: string
  created_at: string
}

export interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
}

export const AUTH_STORAGE_KEY = 'meantime.auth'

function validTokens(tokens: AuthTokens): boolean {
  return typeof tokens?.access_token === 'string' && !!tokens.access_token &&
    typeof tokens?.refresh_token === 'string' && !!tokens.refresh_token
}

function invalidCredentials(error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode
  return status === 401 || status === 403
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({ accessToken: null, refreshToken: null, user: null }),
  getters: {
    isAuthenticated: (state): boolean => !!(state.accessToken && state.refreshToken && state.user),
  },
  actions: {
    persist() {
      if (!import.meta.client) return
      try {
        if (this.accessToken && this.refreshToken) {
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
            accessToken: this.accessToken, refreshToken: this.refreshToken,
          }))
        } else {
          localStorage.removeItem(AUTH_STORAGE_KEY)
        }
      } catch {
        // Storage may be unavailable; the in-memory session still works.
      }
    },
    async restoreSession() {
      if (!import.meta.client) return
      try {
        const saved = localStorage.getItem(AUTH_STORAGE_KEY)
        if (!saved) return
        const state = JSON.parse(saved)
        this.setTokens({ access_token: state?.accessToken, refresh_token: state?.refreshToken })
        this.user = null
      } catch {
        this.clearTokens()
        return
      }
      try {
        await this.fetchUser()
      } catch {
        // Invalid credentials are cleared by fetchUser. Network failures retain
        // tokens for a later retry, but no user is trusted from local storage.
      }
    },
    setTokens(tokens: AuthTokens) {
      if (!validTokens(tokens)) throw new Error('The authentication response did not include valid tokens.')
      this.$patch({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token })
      this.persist()
    },
    setUser(user: User) {
      if (typeof user?.id !== 'number' || !Number.isFinite(user.id) ||
          typeof user.email !== 'string' || !user.email ||
          typeof user.display_name !== 'string' || typeof user.timezone !== 'string' ||
          typeof user.created_at !== 'string') {
        throw new Error('The profile response did not include valid user details.')
      }
      this.user = user
    },
    clearTokens() {
      this.$reset()
      this.persist()
    },
    async refresh() {
      if (!this.refreshToken) throw new Error('No refresh token is available.')
      try {
        const response = await authApi.refresh(this.refreshToken)
        this.setTokens({ access_token: response.access_token, refresh_token: this.refreshToken })
      } catch (error) {
        if (invalidCredentials(error)) this.clearTokens()
        throw error
      }
    },
    async fetchUser() {
      if (!this.accessToken) throw new Error('No access token is available.')
      this.user = null
      try {
        let user: User
        try {
          user = await authApi.me(this.accessToken)
        } catch (error) {
          if ((error as { statusCode?: number } | null)?.statusCode !== 401) throw error
          await this.refresh()
          user = await authApi.me(this.accessToken!)
        }
        this.setUser(user)
        return user
      } catch (error) {
        if (invalidCredentials(error)) this.clearTokens()
        throw error
      }
    },
    async login(credentials: LoginRequest) {
      this.clearTokens()
      try {
        this.setTokens(await authApi.login(credentials))
        await this.fetchUser()
      } catch (error) {
        this.clearTokens()
        throw error
      }
    },
    async register(details: RegistrationRequest) {
      return await authApi.register(details)
    },
  },
})

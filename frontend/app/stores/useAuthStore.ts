import { defineStore } from 'pinia'
import { authApi, type AuthTokens, type LoginRequest, type RegistrationRequest } from '~/api/auth'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)

  function setTokens(tokens: AuthTokens) {
    if (typeof tokens?.access !== 'string' || !tokens.access ||
        typeof tokens?.refresh !== 'string' || !tokens.refresh) {
      throw new Error('The authentication response did not include valid tokens.')
    }
    accessToken.value = tokens.access
    refreshToken.value = tokens.refresh
  }

  function clearTokens() {
    accessToken.value = null
    refreshToken.value = null
  }

  async function login(credentials: LoginRequest) {
    const tokens = await authApi.login(credentials)
    setTokens(tokens)
  }

  async function register(details: RegistrationRequest) {
    await authApi.register(details)
  }

  return { accessToken, refreshToken, setTokens, clearTokens, login, register }
})

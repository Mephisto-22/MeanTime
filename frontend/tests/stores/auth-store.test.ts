import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '~/api/auth'
import { apiService } from '~/services/ApiService'
import { AUTH_STORAGE_KEY, useAuthStore, type User } from '~/stores/auth'

const mockUser: User = {
  id: 1,
  email: 'user@example.com',
  display_name: 'Display name',
  timezone: 'UTC',
  created_at: '2026-10-14T12:00:00Z',
}

const mockTokens = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
}

const unauthorizedError = () => Object.assign(new Error('Unauthorized'), { statusCode: 401 })

describe('Auth Store & AuthApi Contracts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('login fetches me, persists only tokens, and clearing removes the session', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue({
      ...mockTokens,
      token_type: 'Bearer',
      expires_in: 3600,
    })
    const meSpy = vi.spyOn(authApi, 'me').mockResolvedValue(mockUser)

    const store = useAuthStore()
    await store.login({ email: mockUser.email, password: 'test-password' })

    expect(meSpy).toHaveBeenCalledWith(mockTokens.access_token)
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.display_name).toBe(mockUser.display_name)
    expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)!)).toEqual({
      accessToken: mockTokens.access_token,
      refreshToken: mockTokens.refresh_token,
    })

    store.clearTokens()
    expect(store.user).toBeNull()
    expect(store.accessToken).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('reload discards saved profile, refreshes expired access, and reauthenticates via me', async () => {
    let meCount = 0
    vi.spyOn(authApi, 'me').mockImplementation(async (token) => {
      meCount++
      if (token === 'expired') throw unauthorizedError()
      return mockUser
    })
    vi.spyOn(authApi, 'refresh').mockResolvedValue({
      access_token: 'new-access',
      token_type: 'Bearer',
      expires_in: 3600,
    })

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      accessToken: 'expired',
      refreshToken: mockTokens.refresh_token,
      user: { email: 'untrusted' },
    }))

    const store = useAuthStore()
    await store.restoreSession()

    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.email).toBe(mockUser.email)
    expect(meCount).toBe(2)
    expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)!)).toEqual({
      accessToken: 'new-access',
      refreshToken: mockTokens.refresh_token,
    })
  })

  it('rejected refresh clears restored tokens and user', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValue(unauthorizedError())
    vi.spyOn(authApi, 'refresh').mockRejectedValue(unauthorizedError())

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      accessToken: 'expired',
      refreshToken: 'invalid',
    }))

    const store = useAuthStore()
    await store.restoreSession()

    expect(store.isAuthenticated).toBe(false)
    expect(store.accessToken).toBeNull()
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('transient network failure retains tokens but never trusts persisted user', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValue(new Error('Network unavailable'))

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      accessToken: 'saved-access',
      refreshToken: 'saved-refresh',
      user: mockUser,
    }))

    const store = useAuthStore()
    await store.restoreSession()

    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.accessToken).toBe('saved-access')
    expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)!).user).toBeUndefined()
  })

  it('malformed stored tokens are discarded', async () => {
    for (const saved of ['bad-json', 'null', '{}', '{"accessToken":"a"}']) {
      localStorage.setItem(AUTH_STORAGE_KEY, saved)
      const store = useAuthStore()
      await store.restoreSession()
      expect(store.isAuthenticated).toBe(false)
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    }
  })

  it('failed login, invalid tokens, and failed profile calls leave no session', async () => {
    const store = useAuthStore()

    // 1. Invalid credentials
    vi.spyOn(authApi, 'login').mockRejectedValueOnce(new Error('Invalid credentials'))
    await expect(store.login({ email: mockUser.email, password: 'bad' })).rejects.toThrow()
    expect(store.isAuthenticated).toBe(false)
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()

    // 2. Empty access token
    vi.spyOn(authApi, 'login').mockResolvedValueOnce({
      access_token: '',
      refresh_token: 'r',
      token_type: 'Bearer',
      expires_in: 3600,
    })
    await expect(store.login({ email: mockUser.email, password: 'bad' })).rejects.toThrow()
    expect(store.isAuthenticated).toBe(false)
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()

    // 3. Network failure on me()
    vi.spyOn(authApi, 'login').mockResolvedValueOnce({
      ...mockTokens,
      token_type: 'Bearer',
      expires_in: 3600,
    })
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new Error('Network unavailable'))
    await expect(store.login({ email: mockUser.email, password: 'bad' })).rejects.toThrow()
    expect(store.isAuthenticated).toBe(false)
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('registration uses the backend display_name payload without authenticating', async () => {
    const registerSpy = vi.spyOn(authApi, 'register').mockResolvedValue(mockUser)
    const store = useAuthStore()

    const payload = {
      email: mockUser.email,
      password: 'test-password',
      display_name: mockUser.display_name,
    }

    const registered = await store.register(payload)
    expect(registered.display_name).toBe(mockUser.display_name)
    expect(registerSpy).toHaveBeenCalledWith(payload)
    expect(store.isAuthenticated).toBe(false)
  })

  it('auth API uses backend paths, payloads, and bearer authentication (fixes me signature desync)', async () => {
    const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue({} as any)
    const getSpy = vi.spyOn(apiService, 'get').mockResolvedValue({} as any)

    await authApi.login({ email: mockUser.email, password: 'password' })
    expect(postSpy).toHaveBeenNthCalledWith(
      1,
      '/api/auth/login',
      { email: mockUser.email, password: 'password' },
      { auth: false },
    )

    await authApi.register({ email: mockUser.email, password: 'password', display_name: mockUser.display_name })
    expect(postSpy).toHaveBeenNthCalledWith(
      2,
      '/api/auth/register',
      { email: mockUser.email, password: 'password', display_name: mockUser.display_name },
      { auth: false },
    )

    await authApi.refresh('refresh-token')
    expect(postSpy).toHaveBeenNthCalledWith(
      3,
      '/api/auth/refresh',
      { refresh_token: 'refresh-token' },
      { auth: false },
    )

    // Note: me() routes to /api/auth/me with undefined query parameters
    await authApi.me('access-token')
    expect(getSpy).toHaveBeenNthCalledWith(1, '/api/auth/me', undefined)
  })

  it('concurrent initialization restores and validates only once', async () => {
    const meSpy = vi.spyOn(authApi, 'me').mockResolvedValue(mockUser)
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      accessToken: 'a',
      refreshToken: 'r',
    }))

    const store = useAuthStore()
    await Promise.all([store.initializeSession(), store.initializeSession()])
    await store.initializeSession()

    expect(meSpy).toHaveBeenCalledTimes(1)
    expect(store.sessionInitialized).toBe(true)
    expect(store.isAuthenticated).toBe(true)
  })

  it('concurrent refreshes share one request and persist the new access token', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const refreshSpy = vi.spyOn(authApi, 'refresh').mockImplementation(async () => {
      await gate
      return {
        access_token: 'new-access',
        token_type: 'Bearer',
        expires_in: 3600,
      }
    })

    const store = useAuthStore()
    store.setTokens(mockTokens)

    const first = store.refresh()
    const second = store.refresh()
    release()
    await Promise.all([first, second])

    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)!).accessToken).toBe('new-access')
    expect(store.refreshToken).toBe(mockTokens.refresh_token)
  })

  it('transient refresh errors do not clear tokens or redirect', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new Error('Network unavailable'))

    const store = useAuthStore()
    store.setTokens(mockTokens)
    store.sessionInitialized = true

    await expect(store.refresh()).rejects.toThrow()
    expect(store.accessToken).toBe(mockTokens.access_token)
  })

  it('late refresh response cannot resurrect a cleared session', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    vi.spyOn(authApi, 'refresh').mockImplementation(async () => {
      await gate
      return {
        access_token: 'new-access',
        token_type: 'Bearer',
        expires_in: 3600,
      }
    })

    const store = useAuthStore()
    store.setTokens(mockTokens)

    const pending = store.refresh()
    store.clearTokens()
    release()

    await expect(pending).rejects.toThrow()
    expect(store.accessToken).toBeNull()
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })
})

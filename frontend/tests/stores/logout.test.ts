import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '~/api/auth'
import { AUTH_STORAGE_KEY, useAuthStore, type User } from '~/stores/auth'

const mocks = vi.hoisted(() => ({ navigate: vi.fn().mockResolvedValue(undefined), clear: vi.fn() }))
mockNuxtImport('navigateTo', () => mocks.navigate)
mockNuxtImport('clearNuxtData', () => mocks.clear)
const tokens = { access_token: 'access', refresh_token: 'refresh' }
const user: User = { id: 1, email: 'logout@example.com', display_name: 'Logout User', timezone: 'UTC', created_at: '2026-11-01T12:00:00Z' }

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

function session() {
  const store = useAuthStore()
  store.setTokens(tokens)
  store.setUser(user)
  store.sessionInitialized = true
  return store
}

describe('Clean logout', () => {
  it('starts revocation, clears storage/cache immediately, and redirects before it completes', async () => {
    let resolve!: () => void
    const pending = new Promise<void>(done => { resolve = done })
    const logout = vi.spyOn(authApi, 'logout').mockImplementation(async () => { await pending; return { detail: 'Logged out' } })
    const store = session()
    const result = store.logout()
    expect(logout).toHaveBeenCalledWith('refresh', 'access')
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    expect(mocks.clear).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).toHaveBeenCalledWith('/login', { replace: true })
    expect(store.loggingOut).toBe(true)
    await store.logout()
    expect(logout).toHaveBeenCalledTimes(1)
    resolve()
    expect(await result).toBe(true)
    expect(store.loggingOut).toBe(false)
  })

  it('clears locally and reports unconfirmed revocation on network failure', async () => {
    vi.spyOn(authApi, 'logout').mockRejectedValue(new Error('Offline'))
    const store = session()
    expect(await store.logout()).toBe(false)
    expect(store.accessToken).toBeNull()
    expect(store.user).toBeNull()
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    expect(mocks.navigate).toHaveBeenLastCalledWith('/login?logout=unconfirmed', { replace: true })
  })

  it('does not restore tokens from a refresh that finishes after logout', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(authApi, 'refresh').mockImplementation(async () => { await gate; return { access_token: 'late', token_type: 'bearer', expires_in: 900 } })
    vi.spyOn(authApi, 'logout').mockResolvedValue({ detail: 'Logged out' })
    const store = session()
    const refresh = store.refresh()
    const rejected = expect(refresh).rejects.toThrow('session changed')
    await store.logout()
    release()
    await rejected
    expect(store.accessToken).toBeNull()
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('does not restore a profile that finishes after logout', async () => {
    let release!: (value: User) => void
    vi.spyOn(authApi, 'me').mockImplementation(() => new Promise(resolve => { release = resolve }))
    vi.spyOn(authApi, 'logout').mockResolvedValue({ detail: 'Logged out' })
    const store = session()
    const profile = store.fetchUser()
    const rejected = expect(profile).rejects.toThrow('session changed')
    await store.logout()
    release(user)
    await rejected
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('does not restore a pending login response after logout', async () => {
    let release!: (value: typeof tokens & { token_type: string; expires_in: number }) => void
    vi.spyOn(authApi, 'login').mockImplementation(() => new Promise(resolve => { release = resolve }))
    const store = useAuthStore()
    const login = store.login({ email: user.email, password: 'password' })
    const rejected = expect(login).rejects.toThrow('session changed')
    await store.logout()
    release({ ...tokens, token_type: 'bearer', expires_in: 900 })
    await rejected
    expect(store.accessToken).toBeNull()
  })

  it('does not make a revocation request when there are no tokens', async () => {
    const logout = vi.spyOn(authApi, 'logout')
    expect(await useAuthStore().logout()).toBe(true)
    expect(logout).not.toHaveBeenCalled()
  })
})

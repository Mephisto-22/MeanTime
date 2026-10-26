import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ApiService } from '~/services/ApiService'

const mockFetch = vi.fn()

vi.mock('#build/fetch.mjs', () => ({
  $fetch: (...args: any[]) => mockFetch(...args),
}))

const mockAuth = {
  sessionInitialized: false,
  isAuthenticated: false,
  async initializeSession() {
    this.sessionInitialized = true
  },
}

vi.mock('~/stores/auth', () => ({
  useAuthStore: () => mockAuth,
}))

const unauthorizedError = () => Object.assign(new Error('Unauthorized'), { statusCode: 401 })

describe('ApiService & Auth Access', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('protected API retries once with the refreshed token, preserving request data and headers', async () => {
    const calls: Array<{ url: string; options: any }> = []
    let access = 'old'
    let refreshes = 0

    mockFetch.mockImplementation(async (url: string, options: any) => {
      calls.push({ url, options })
      if (options.headers.Authorization === 'Bearer old') throw unauthorizedError()
      return { ok: true }
    })

    const api = new ApiService()
    api.setAuthHandler({
      getAccessToken: () => access,
      async refresh() {
        refreshes++
        access = 'new'
      },
      async expireSession() {
        throw new Error('Valid refresh must not expire the session')
      },
    })

    await api.post('/api/tasks', { title: 'Task' }, { headers: { 'X-Request-ID': 'request-123' } })

    expect(refreshes).toBe(1)
    expect(calls).toHaveLength(2)
    expect(calls[0].options.headers.Authorization).toBe('Bearer old')
    expect(calls[1].options.headers.Authorization).toBe('Bearer new')
    expect(calls[1].options.headers['Content-Type']).toBe('application/json')
    expect(calls[1].options.headers['X-Request-ID']).toBe('request-123')
    expect(calls[1].options.body).toEqual({ title: 'Task' })
    expect(calls[1].options.retry).toBe(0)
  })

  it('a second 401 expires the session without a retry loop', async () => {
    let requests = 0
    let refreshes = 0
    let expirations = 0
    let access: string | null = 'old'

    mockFetch.mockImplementation(async () => {
      requests++
      throw unauthorizedError()
    })

    const api = new ApiService()
    api.setAuthHandler({
      getAccessToken: () => access,
      async refresh() {
        refreshes++
        access = 'new'
      },
      async expireSession() {
        expirations++
        access = null
      },
    })

    await expect(api.get('/api/tasks')).rejects.toThrow()
    expect(requests).toBe(2)
    expect(refreshes).toBe(1)
    expect(expirations).toBe(1)
  })

  it('public endpoints, external URLs, and permission failures do not refresh', async () => {
    const sent: any[] = []
    let refreshes = 0

    mockFetch.mockImplementation(async (url: string, options: any) => {
      sent.push(options)
      throw Object.assign(new Error('Denied'), { statusCode: url === '/api/admin' ? 403 : 401 })
    })

    const api = new ApiService()
    api.setAuthHandler({
      getAccessToken: () => 'secret',
      async refresh() {
        refreshes++
      },
      async expireSession() {
        throw new Error('Public/permission failure must not expire session')
      },
    })

    await expect(api.post('/api/auth/login', {}, { auth: false })).rejects.toThrow()
    await expect(api.get('https://example.com/api/tasks')).rejects.toThrow()
    await expect(api.get('/api/admin')).rejects.toThrow()

    expect(sent[0].headers.Authorization).toBeUndefined()
    expect(sent[1].headers.Authorization).toBeUndefined()
    expect(refreshes).toBe(0)
  })

  it('network failure during refresh surfaces without replaying the request', async () => {
    let requests = 0

    mockFetch.mockImplementation(async () => {
      requests++
      throw unauthorizedError()
    })

    const api = new ApiService()
    api.setAuthHandler({
      getAccessToken: () => 'old',
      async refresh() {
        throw new Error('Offline')
      },
      async expireSession() {
        throw new Error('Offline is not a rejected credential')
      },
    })

    await expect(api.get('/api/tasks')).rejects.toThrow(/Offline/)
    expect(requests).toBe(1)
  })

  it('ApiService.patch sends PATCH method with serialized body, json header, and bearer auth', async () => {
    const calls: Array<{ url: string; options: any }> = []

    mockFetch.mockImplementation(async (url: string, options: any) => {
      calls.push({ url, options })
      return { id: 1, title: 'Updated' }
    })

    const api = new ApiService()
    api.setAuthHandler({
      getAccessToken: () => 'valid-token',
      async refresh() {},
      async expireSession() {},
    })

    const result = await api.patch('/api/kanban/boards/1', { title: 'Updated' }, { headers: { 'X-Custom': 'value' } })
    expect(result).toEqual({ id: 1, title: 'Updated' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/kanban/boards/1')
    expect(calls[0].options.method).toBe('PATCH')
    expect(calls[0].options.headers.Authorization).toBe('Bearer valid-token')
    expect(calls[0].options.headers['Content-Type']).toBe('application/json')
    expect(calls[0].options.headers['X-Custom']).toBe('value')
    expect(calls[0].options.body).toEqual({ title: 'Updated' })
    expect(calls[0].options.query).toBeUndefined()
  })

  it('ApiService.patch retries once on 401 with refreshed token and preserves body and headers', async () => {
    const calls: Array<{ url: string; options: any }> = []
    let access = 'old-token'
    let refreshes = 0

    mockFetch.mockImplementation(async (url: string, options: any) => {
      calls.push({ url, options })
      if (options.headers.Authorization === 'Bearer old-token') throw unauthorizedError()
      return { id: 2, title: 'Patched' }
    })

    const api = new ApiService()
    api.setAuthHandler({
      getAccessToken: () => access,
      async refresh() {
        refreshes++
        access = 'new-token'
      },
      async expireSession() {
        throw new Error('Valid refresh should not expire session')
      },
    })

    const result = await api.patch('/api/kanban/columns/2', { title: 'Patched', position: 1 })
    expect(result).toEqual({ id: 2, title: 'Patched' })
    expect(refreshes).toBe(1)
    expect(calls).toHaveLength(2)
    expect(calls[0].options.method).toBe('PATCH')
    expect(calls[1].options.method).toBe('PATCH')
    expect(calls[1].options.headers.Authorization).toBe('Bearer new-token')
    expect(calls[1].options.body).toEqual({ title: 'Patched', position: 1 })
  })

  it('ApiService.patch normalizes error responses into ApiError instances', async () => {
    mockFetch.mockImplementation(async () => {
      const err: any = new Error('Validation failed')
      err.statusCode = 400
      err.data = { detail: 'Validation failed' }
      throw err
    })

    const api = new ApiService()
    await expect(api.patch('/api/kanban/tasks/3', { title: '' })).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 400,
      message: 'Validation failed',
      data: { detail: 'Validation failed' },
    })
  })
})

describe('Route Guard Middleware', () => {
  beforeEach(() => {
    mockAuth.sessionInitialized = false
    mockAuth.isAuthenticated = false
  })

  it('route guard awaits restoration, permits public/authenticated routes, and redirects guests', async () => {
    let initialized = false
    mockAuth.initializeSession = async function () {
      initialized = true
      this.sessionInitialized = true
    }

    const router = useRouter()
    const guardModule = await import('~/middleware/auth.global')
    const guard = guardModule.default

    // Guest visiting protected route
    await guard({ meta: {}, fullPath: '/board?view=mine' } as any)
    expect(initialized).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/board?view=mine')

    // Public route
    const publicResult = await guard({ meta: { public: true }, fullPath: '/login' } as any)
    expect(publicResult).toBeUndefined()

    // Authenticated user visiting protected route
    mockAuth.isAuthenticated = true
    const authResult = await guard({ meta: {}, fullPath: '/' } as any)
    expect(authResult).toBeUndefined()
  })
})

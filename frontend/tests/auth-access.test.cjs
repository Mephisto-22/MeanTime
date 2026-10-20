const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')

function compile(file, globals = {}, replacements = {}) {
  let source = readFileSync(resolve(__dirname, file), 'utf8')
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to)
  const exports = {}
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(compiled, { exports, ...globals })
  return exports
}

const unauthorized = () => Object.assign(new Error('Unauthorized'), { statusCode: 401 })

test('protected API retries once with the refreshed token, preserving request data and headers', async () => {
  const calls = []
  let access = 'old'
  let refreshes = 0
  const { ApiService } = compile('../app/services/ApiService.ts', {
    async $fetch(url, options) {
      calls.push({ url, options })
      if (options.headers.Authorization === 'Bearer old') throw unauthorized()
      return { ok: true }
    },
  })
  const api = new ApiService()
  api.setAuthHandler({
    getAccessToken: () => access,
    async refresh() { refreshes++; access = 'new' },
    async expireSession() { assert.fail('Valid refresh must not expire the session') },
  })
  await api.post('/api/tasks', { title: 'Task' }, { headers: { 'X-Request-ID': 'request' } })
  assert.equal(refreshes, 1)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].options.headers.Authorization, 'Bearer new')
  assert.equal(calls[1].options.headers['Content-Type'], 'application/json')
  assert.equal(calls[1].options.headers['X-Request-ID'], 'request')
  assert.equal(calls[1].options.body.title, 'Task')
  assert.equal(calls[1].options.retry, 0)
})

test('a second 401 expires the session without a retry loop', async () => {
  let requests = 0
  let refreshes = 0
  let expirations = 0
  let access = 'old'
  const { ApiService } = compile('../app/services/ApiService.ts', {
    async $fetch() { requests++; throw unauthorized() },
  })
  const api = new ApiService()
  api.setAuthHandler({
    getAccessToken: () => access,
    async refresh() { refreshes++; access = 'new' },
    async expireSession() { expirations++; access = null },
  })
  await assert.rejects(api.get('/api/tasks'), error => error.statusCode === 401)
  assert.equal(requests, 2)
  assert.equal(refreshes, 1)
  assert.equal(expirations, 1)
})

test('public endpoints, external URLs, and permission failures do not refresh', async () => {
  const sent = []
  let refreshes = 0
  const { ApiService } = compile('../app/services/ApiService.ts', {
    async $fetch(url, options) {
      sent.push(options)
      throw Object.assign(new Error('Denied'), { statusCode: url === '/api/admin' ? 403 : 401 })
    },
  })
  const api = new ApiService()
  api.setAuthHandler({
    getAccessToken: () => 'secret',
    async refresh() { refreshes++ },
    async expireSession() { assert.fail('Public/permission failure must not expire session') },
  })
  await assert.rejects(api.post('/api/auth/login', {}, { auth: false }))
  await assert.rejects(api.get('https://example.com/api/tasks'))
  await assert.rejects(api.get('/api/admin'))
  assert.equal(sent[0].headers.Authorization, undefined)
  assert.equal(sent[1].headers.Authorization, undefined)
  assert.equal(refreshes, 0)
})

test('network failure during refresh surfaces without replaying the request', async () => {
  let requests = 0
  const { ApiService } = compile('../app/services/ApiService.ts', {
    async $fetch() { requests++; throw unauthorized() },
  })
  const api = new ApiService()
  api.setAuthHandler({
    getAccessToken: () => 'old',
    async refresh() { throw new Error('Offline') },
    async expireSession() { assert.fail('Offline is not a rejected credential') },
  })
  await assert.rejects(api.get('/api/tasks'), /Offline/)
  assert.equal(requests, 1)
})

test('route guard awaits restoration, permits public/authenticated routes, and redirects guests', async () => {
  let initialized = false
  const auth = {
    isAuthenticated: false,
    async initializeSession() { await Promise.resolve(); initialized = true },
  }
  const { default: guard } = compile('../app/middleware/auth.global.ts', {
    require() { return { useAuthStore: () => auth } },
    defineNuxtRouteMiddleware: fn => fn,
    navigateTo: target => { assert.equal(initialized, true); return target },
  }, { 'import.meta.server': 'false' })
  const redirect = await guard({ meta: {}, fullPath: '/board?view=mine' })
  assert.equal(redirect.path, '/login')
  assert.equal(redirect.query.redirect, '/board?view=mine')
  assert.equal(await guard({ meta: { public: true }, fullPath: '/login' }), undefined)
  auth.isAuthenticated = true
  assert.equal(await guard({ meta: {}, fullPath: '/' }), undefined)
})

test('server middleware does not read browser storage', async () => {
  const { default: guard } = compile('../app/middleware/auth.global.ts', {
    require() { return { useAuthStore: () => { assert.fail('Server must not restore browser storage') } } },
    defineNuxtRouteMiddleware: fn => fn,
  }, { 'import.meta.server': 'true' })
  assert.equal(await guard({ meta: {}, fullPath: '/' }), undefined)
})

test('ApiService.patch sends PATCH method with serialized body, json header, and bearer auth', async () => {
  const calls = []
  const { ApiService } = compile('../app/services/ApiService.ts', {
    async $fetch(url, options) {
      calls.push({ url, options })
      return { id: 1, title: 'Updated' }
    },
  })
  const api = new ApiService()
  api.setAuthHandler({
    getAccessToken: () => 'valid-token',
    async refresh() {},
    async expireSession() {},
  })
  const result = await api.patch('/api/kanban/boards/1', { title: 'Updated' }, { headers: { 'X-Custom': 'value' } })
  assert.deepEqual(result, { id: 1, title: 'Updated' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/kanban/boards/1')
  assert.equal(calls[0].options.method, 'PATCH')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer valid-token')
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json')
  assert.equal(calls[0].options.headers['X-Custom'], 'value')
  assert.deepEqual(calls[0].options.body, { title: 'Updated' })
  assert.equal(calls[0].options.query, undefined)
})

test('ApiService.patch retries once on 401 with refreshed token and preserves body and headers', async () => {
  const calls = []
  let access = 'old-token'
  let refreshes = 0
  const { ApiService } = compile('../app/services/ApiService.ts', {
    async $fetch(url, options) {
      calls.push({ url, options })
      if (options.headers.Authorization === 'Bearer old-token') throw unauthorized()
      return { id: 2, title: 'Patched' }
    },
  })
  const api = new ApiService()
  api.setAuthHandler({
    getAccessToken: () => access,
    async refresh() { refreshes++; access = 'new-token' },
    async expireSession() { assert.fail('Valid refresh should not expire session') },
  })
  const result = await api.patch('/api/kanban/columns/2', { title: 'Patched', position: 1 })
  assert.deepEqual(result, { id: 2, title: 'Patched' })
  assert.equal(refreshes, 1)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].options.method, 'PATCH')
  assert.equal(calls[1].options.method, 'PATCH')
  assert.equal(calls[1].options.headers.Authorization, 'Bearer new-token')
  assert.deepEqual(calls[1].options.body, { title: 'Patched', position: 1 })
})

test('ApiService.patch normalizes error responses into ApiError instances', async () => {
  const { ApiService, ApiError } = compile('../app/services/ApiService.ts', {
    async $fetch() {
      const err = new Error('Bad Request')
      err.statusCode = 400
      err.data = { detail: 'Validation failed' }
      throw err
    },
  })
  const api = new ApiService()
  await assert.rejects(
    api.patch('/api/kanban/tasks/3', { title: '' }),
    (error) => {
      assert.equal(error.name, 'ApiError')
      assert.equal(error.statusCode, 400)
      assert.equal(error.message, 'Validation failed')
      assert.deepEqual(error.data, { detail: 'Validation failed' })
      return true
    },
  )
})


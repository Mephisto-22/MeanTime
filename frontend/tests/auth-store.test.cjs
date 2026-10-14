const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const { createPinia, setActivePinia } = require('pinia')

function setup({ client = true, unavailable = false, response, meError, refreshError, unavailableMe = false } = {}) {
  const values = new Map()
  const storage = {
    getItem(key) { if (unavailable) throw new Error('Storage unavailable'); return values.get(key) ?? null },
    setItem(key, value) { if (unavailable) throw new Error('Storage unavailable'); values.set(key, value) },
    removeItem(key) { if (unavailable) throw new Error('Storage unavailable'); values.delete(key) },
  }
  const source = readFileSync(resolve(__dirname, '../app/stores/auth.ts'), 'utf8')
    .replaceAll('import.meta.client', String(client))
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const calls = []
  const exports = {}
  runInNewContext(compiled, {
    exports, localStorage: storage,
    require(name) {
      if (name === '~/api/auth') return { authApi: {
        async login(payload) { calls.push(payload); if (response instanceof Error) throw response; return response },
        async register(payload) { calls.push(['register', payload]); return profile },
        async me(token) { calls.push(['me', token]); if (unavailableMe) throw new Error('Network unavailable'); if (meError && token !== 'new-access') throw meError; return profile },
        async refresh(token) { calls.push(['refresh', token]); if (refreshError) throw refreshError; return { access_token: 'new-access' } },
      } }
      return require(name)
    },
  })
  setActivePinia(createPinia())
  return { store: exports.useAuthStore(), values, key: exports.AUTH_STORAGE_KEY, calls }
}

const profile = { id: 1, email: 'user@example.com', display_name: 'Display name', timezone: 'UTC', created_at: '2026-10-14T12:00:00Z' }
const tokens = { access_token: 'access-token', refresh_token: 'refresh-token' }
const unauthorized = Object.assign(new Error('Unauthorized'), { statusCode: 401 })

test('login fetches me, persists only tokens, and clearing removes the session', async () => {
  const { store, values, key, calls } = setup({ response: tokens })
  await store.login({ email: profile.email, password: 'test-password' })
  assert.equal(calls[0].email, profile.email)
  assert.deepEqual(calls[1], ['me', tokens.access_token])
  assert.equal(store.isAuthenticated, true)
  assert.equal(store.user.display_name, profile.display_name)
  assert.deepEqual(JSON.parse(values.get(key)), { accessToken: tokens.access_token, refreshToken: tokens.refresh_token })
  store.clearTokens()
  assert.equal(store.user, null)
  assert.equal(store.accessToken, null)
  assert.equal(store.refreshToken, null)
  assert.equal(store.isAuthenticated, false)
  assert.equal(values.has(key), false)
})

test('reload discards saved profile, refreshes expired access, and reauthenticates via me', async () => {
  const { store, values, key, calls } = setup({ meError: unauthorized })
  values.set(key, JSON.stringify({ accessToken: 'expired', refreshToken: tokens.refresh_token, user: { email: 'untrusted' } }))
  await store.restoreSession()
  assert.equal(store.isAuthenticated, true)
  assert.equal(store.user.email, profile.email)
  assert.deepEqual(calls, [['me', 'expired'], ['refresh', tokens.refresh_token], ['me', 'new-access']])
  assert.deepEqual(JSON.parse(values.get(key)), { accessToken: 'new-access', refreshToken: tokens.refresh_token })
})

test('rejected refresh clears restored tokens and user', async () => {
  const { store, values, key } = setup({ meError: unauthorized, refreshError: unauthorized })
  values.set(key, JSON.stringify({ accessToken: 'expired', refreshToken: 'invalid' }))
  await store.restoreSession()
  assert.equal(store.isAuthenticated, false)
  assert.equal(store.accessToken, null)
  assert.equal(values.has(key), false)
})

test('transient network failure retains tokens but never trusts persisted user', async () => {
  const { store, values, key } = setup({ unavailableMe: true })
  values.set(key, JSON.stringify({ accessToken: 'a', refreshToken: 'r', user: profile }))
  await store.restoreSession()
  assert.equal(store.isAuthenticated, false)
  assert.equal(store.user, null)
  assert.equal(store.accessToken, 'a')
  assert.equal(JSON.parse(values.get(key)).user, undefined)
})

test('malformed stored tokens are discarded', async () => {
  for (const saved of ['bad-json', 'null', '{}', '{"accessToken":"a"}']) {
    const { store, values, key } = setup()
    values.set(key, saved)
    await store.restoreSession()
    assert.equal(store.isAuthenticated, false)
    assert.equal(values.has(key), false)
  }
})

test('failed login, invalid tokens, and failed profile calls leave no session', async () => {
  for (const options of [{ response: new Error('Invalid credentials') }, { response: { ...tokens, access_token: '' } }, { response: tokens, unavailableMe: true }]) {
    const { store, values } = setup(options)
    await assert.rejects(store.login({ email: profile.email, password: 'bad' }))
    assert.equal(store.isAuthenticated, false)
    assert.equal(values.size, 0)
  }
})

test('SSR avoids storage; blocked storage still supports an in-memory session', async () => {
  for (const options of [{ client: false, unavailable: true }, { unavailable: true }]) {
    const { store } = setup({ ...options, response: tokens })
    await store.restoreSession()
    await store.login({ email: profile.email, password: 'test-password' })
    assert.equal(store.isAuthenticated, true)
  }
})

test('registration uses the backend display_name payload without authenticating', async () => {
  const { store, calls } = setup()
  const payload = { email: profile.email, password: 'test-password', display_name: profile.display_name }
  assert.equal((await store.register(payload)).display_name, profile.display_name)
  assert.deepEqual(calls, [['register', payload]])
  assert.equal(store.isAuthenticated, false)
})

test('auth API uses backend paths, payloads, and bearer authentication', async () => {
  const calls = []
  const exports = {}
  const source = readFileSync(resolve(__dirname, '../app/api/auth.ts'), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(compiled, {
    exports,
    require() { return { apiService: {
      post(...args) { calls.push(['POST', ...args]); return Promise.resolve(tokens) },
      get(...args) { calls.push(['GET', ...args]); return Promise.resolve(profile) },
    } } },
  })
  const { authApi } = exports
  await authApi.login({ email: profile.email, password: 'password' })
  await authApi.register({ email: profile.email, password: 'password', display_name: profile.display_name })
  await authApi.refresh('refresh-token')
  await authApi.me('access-token')
  // JSON normalizes objects created in the VM's separate realm.
  const recorded = JSON.parse(JSON.stringify(calls))
  assert.deepEqual(recorded, [
    ['POST', '/api/auth/login', { email: profile.email, password: 'password' }],
    ['POST', '/api/auth/register', { email: profile.email, password: 'password', display_name: profile.display_name }],
    ['POST', '/api/auth/refresh', { refresh_token: 'refresh-token' }],
    ['GET', '/api/auth/me', null, { headers: { Authorization: 'Bearer access-token' } }],
  ])
})

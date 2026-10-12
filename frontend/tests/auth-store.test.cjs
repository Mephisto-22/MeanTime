const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const { createPinia, setActivePinia } = require('pinia')

function setup({ client = true, unavailable = false, response } = {}) {
  const values = new Map()
  const storage = {
    getItem(key) { if (unavailable) throw new Error('Storage unavailable'); return values.get(key) ?? null },
    setItem(key, value) { if (unavailable) throw new Error('Storage unavailable'); values.set(key, value) },
    removeItem(key) { if (unavailable) throw new Error('Storage unavailable'); values.delete(key) },
  }
  const source = readFileSync(resolve(__dirname, '../app/stores/useAuthStore.ts'), 'utf8')
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
        async register(payload) { calls.push(payload) },
      } }
      return require(name)
    },
  })
  setActivePinia(createPinia())
  return { store: exports.useAuthStore(), values, key: exports.AUTH_STORAGE_KEY, calls }
}

const session = { access: 'access-token', refresh: 'refresh-token', user: { id: 1, email: 'user@example.com', username: 'Display name' } }

test('login uses email and persists tokens and user; clear removes all session data', async () => {
  const { store, values, key, calls } = setup({ response: session })
  assert.equal(store.isAuthenticated, false)
  await store.login({ email: session.user.email, password: 'test-password' })
  assert.equal(calls[0].email, session.user.email)
  assert.equal(store.isAuthenticated, true)
  const saved = JSON.parse(values.get(key))
  assert.equal(saved.user.username, 'Display name')
  assert.equal(saved.accessToken, session.access)
  assert.equal(JSON.stringify(saved).includes('test-password'), false)
  store.clearTokens()
  assert.equal(store.user, null)
  assert.equal(store.accessToken, null)
  assert.equal(store.refreshToken, null)
  assert.equal(store.isAuthenticated, false)
  assert.equal(values.has(key), false)
})

test('restores a saved session and persists replacement tokens', () => {
  const { store, values, key } = setup()
  values.set(key, JSON.stringify({ accessToken: session.access, refreshToken: session.refresh, user: session.user }))
  store.restoreSession()
  assert.equal(store.isAuthenticated, true)
  store.setTokens({ access: 'new-access', refresh: 'new-refresh' })
  assert.equal(JSON.parse(values.get(key)).accessToken, 'new-access')
  assert.equal(store.user.email, session.user.email)
})

test('malformed or incomplete stored sessions are discarded', () => {
  for (const saved of ['bad-json', 'null', '{}', JSON.stringify({ accessToken: 'a', refreshToken: 'r', user: {} })]) {
    const { store, values, key } = setup()
    values.set(key, saved)
    store.restoreSession()
    assert.equal(store.isAuthenticated, false)
    assert.equal(values.has(key), false)
  }
})

test('failed login and invalid responses never create a session', async () => {
  for (const response of [new Error('Invalid credentials'), { access: 'a', refresh: 'r' }, { ...session, access: '' }]) {
    const { store, values } = setup({ response })
    await assert.rejects(store.login({ email: 'user@example.com', password: 'bad' }))
    assert.equal(store.isAuthenticated, false)
    assert.equal(values.size, 0)
  }
})

test('SSR does not access local storage and blocked storage retains memory session', () => {
  for (const options of [{ client: false, unavailable: true }, { unavailable: true }]) {
    const { store } = setup(options)
    store.restoreSession()
    store.setSession(session)
    assert.equal(store.isAuthenticated, true)
    store.clearTokens()
    assert.equal(store.isAuthenticated, false)
  }
})

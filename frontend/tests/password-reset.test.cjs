const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { runInNewContext } = require('node:vm')
const { parse, compileScript } = require('vue/compiler-sfc')
const vue = require('vue')
const ts = require('typescript')

function setup(file, { props = {}, api = {}, hash = '#uid=MQ&token=test-token' } = {}) {
  const source = readFileSync(resolve(__dirname, '../app', file), 'utf8')
  const { descriptor } = parse(source)
  const script = compileScript(descriptor, { id: 'password-reset-test' }).content
  const js = ts.transpileModule(script, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  const mounted = []
  const events = []
  const history = []
  let clears = 0
  let meta
  runInNewContext(js, {
    exports, ref: vue.ref, URLSearchParams, Error,
    definePageMeta(value) { meta = value },
    useHead() {},
    onMounted(fn) { mounted.push(fn) },
    window: { location: { hash, pathname: '/reset-password' }, history: { replaceState(...args) { history.push(args) } } },
    require(name) {
      if (name === 'vue') return vue
      if (name === '~/api/auth') return { authApi: api }
      if (name === '~/stores/auth') return { useAuthStore: () => ({ clearTokens() { clears++ } }) }
      return require(name)
    },
  })
  const state = exports.default.setup(vue.reactive(props), {
    emit: (...args) => events.push(args), expose() {},
  })
  return { state, events, mounted, history, get clears() { return clears }, get meta() { return meta } }
}

test('reset form prevents mismatches and duplicate submissions while busy', () => {
  const { state, events } = setup('components/PasswordResetForm.vue')
  state.password.value = 'NewPassword982!'
  state.passwordConfirm.value = 'DifferentPassword982!'
  state.submit()
  assert.equal(state.mismatch.value, true)
  assert.equal(events.length, 0)
  state.passwordConfirm.value = state.password.value
  state.submit()
  assert.equal(events[0][1].password_confirm, 'NewPassword982!')
  const busy = setup('components/PasswordResetForm.vue', { props: { loading: true } })
  busy.state.submit()
  assert.equal(busy.events.length, 0)
})

test('request page is public and displays the generic response or API error', async () => {
  const page = setup('pages/forgot-password.vue', { api: {
    async requestPasswordReset(email) {
      assert.equal(email, 'user@example.com')
      return { detail: 'If an account exists, instructions will be sent.' }
    },
  } })
  await page.state.requestReset('user@example.com')
  assert.equal(page.meta.public, true)
  assert.match(page.state.message.value, /If an account exists/)
  assert.equal(page.state.loading.value, false)
  const failed = setup('pages/forgot-password.vue', { api: {
    async requestPasswordReset() { throw new Error('Network unavailable') },
  } })
  await failed.state.requestReset('user@example.com')
  assert.equal(failed.state.error.value, 'Network unavailable')
  assert.equal(failed.state.loading.value, false)
})

test('valid fragment activates reset; success clears session and removes link secret', async () => {
  let confirmed
  const page = setup('pages/reset-password.vue', { api: {
    async validatePasswordReset(link) { assert.equal(link.token, 'test-token') },
    async confirmPasswordReset(payload) { confirmed = payload; return { detail: 'Password updated.' } },
  } })
  assert.equal(page.meta.public, true)
  await page.mounted[0]()
  assert.equal(page.state.valid.value, true)
  assert.equal(page.clears, 1)
  await page.state.resetPassword({ password: 'NewPassword982!', password_confirm: 'NewPassword982!' })
  assert.equal(confirmed.uid, 'MQ')
  assert.equal(confirmed.token, 'test-token')
  assert.equal(confirmed.password, 'NewPassword982!')
  assert.equal(page.state.success.value, 'Password updated.')
  assert.equal(page.state.valid.value, false)
  assert.equal(page.clears, 2)
  assert.equal(page.history[0][2], '/reset-password')
})

test('missing or expired links never enable the password form', async () => {
  const missing = setup('pages/reset-password.vue', { hash: '' })
  await missing.mounted[0]()
  assert.equal(missing.state.valid.value, false)
  assert.match(missing.state.error.value, /incomplete/)
  const expired = setup('pages/reset-password.vue', { api: {
    async validatePasswordReset() { throw new Error('Link expired') },
  } })
  await expired.mounted[0]()
  assert.equal(expired.state.valid.value, false)
  assert.equal(expired.state.error.value, 'Link expired')
  assert.equal(expired.clears, 0)
})

test('failed confirmation retains the form for correction and hides success', async () => {
  const page = setup('pages/reset-password.vue', { api: {
    async validatePasswordReset() {},
    async confirmPasswordReset() { throw new Error('Password is too common') },
  } })
  await page.mounted[0]()
  await page.state.resetPassword({ password: 'password', password_confirm: 'password' })
  assert.equal(page.state.valid.value, true)
  assert.equal(page.state.success.value, '')
  assert.equal(page.state.error.value, 'Password is too common')
  assert.equal(page.history.length, 0)
})

test('reset API methods use public endpoints and exact backend payloads', async () => {
  const source = readFileSync(resolve(__dirname, '../app/api/auth.ts'), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const calls = []
  const exports = {}
  runInNewContext(js, { exports, require: () => ({ apiService: {
    async post(...args) { calls.push(args); return { detail: 'OK' } },
  } }) })
  const link = { uid: 'MQ', token: 'test-token' }
  await exports.authApi.requestPasswordReset('user@example.com')
  await exports.authApi.validatePasswordReset(link)
  await exports.authApi.confirmPasswordReset({ ...link, password: 'new', password_confirm: 'new' })
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['/api/auth/password-reset', { email: 'user@example.com' }, { auth: false }],
    ['/api/auth/password-reset/validate', link, { auth: false }],
    ['/api/auth/password-reset/confirm', { ...link, password: 'new', password_confirm: 'new' }, { auth: false }],
  ])
})

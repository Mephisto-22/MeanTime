import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { useNuxtApp, useRouter } from '#app'
import type { Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '~/api/auth'
import GoogleSignInButton from '~/components/GoogleSignInButton.vue'
import Login from '~/pages/login.vue'
import OAuthCallback from '~/pages/oauth/callback.vue'
import Register from '~/pages/register.vue'
import { AUTH_STORAGE_KEY, useAuthStore, type User } from '~/stores/auth'

const user: User = {
  id: 1,
  email: 'person@example.com',
  display_name: 'Pat Person',
  timezone: 'UTC',
  created_at: '2026-10-30T12:00:00Z',
}
const callbackPath = '/oauth/callback#access_token=access-token&refresh_token=refresh-token'
let wrappers: VueWrapper[] = []

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers = []
  useAuthStore(useNuxtApp().$pinia as Pinia).clearTokens()
  window.history.replaceState({}, '', '/')
  localStorage.clear()
  vi.restoreAllMocks()
})

async function mount(component: any, route: string) {
  window.history.replaceState({}, '', route)
  const wrapper = await mountSuspended(component, { route })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('Continue with Google button', () => {
  it('links to the backend\'s Google sign-in when Google is set up', async () => {
    vi.spyOn(authApi, 'providers').mockResolvedValue({ providers: ['google'] })
    const wrapper = await mount(GoogleSignInButton, '/login')
    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('/api/auth/oauth/google/start')
    expect(link.text()).toBe('Continue with Google')
  })

  it('stays hidden when Google isn\'t set up', async () => {
    vi.spyOn(authApi, 'providers').mockResolvedValue({ providers: [] })
    const wrapper = await mount(GoogleSignInButton, '/login')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('stays hidden when the provider list can\'t be loaded', async () => {
    vi.spyOn(authApi, 'providers').mockRejectedValue(new Error('Network unavailable'))
    const wrapper = await mount(GoogleSignInButton, '/login')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('appears on the login and register pages', async () => {
    vi.spyOn(authApi, 'providers').mockResolvedValue({ providers: ['google'] })
    for (const [page, route] of [[Login, '/login'], [Register, '/register']] as const) {
      const wrapper = await mount(page, route)
      expect(wrapper.find('a[href="/api/auth/oauth/google/start"]').exists()).toBe(true)
    }
  })
})

describe('Google sign-in errors on the login page', () => {
  beforeEach(() => {
    vi.spyOn(authApi, 'providers').mockResolvedValue({ providers: ['google'] })
  })

  it('explains an email that already has an account', async () => {
    const wrapper = await mount(Login, '/login?oauth_error=email_in_use')
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'An account with this email already exists. Log in with your email and password.',
    )
  })

  it('shows a general message for reasons it doesn\'t know', async () => {
    const wrapper = await mount(Login, '/login?oauth_error=failed')
    expect(wrapper.get('[role="alert"]').text()).toBe('Google sign-in failed. Please try again.')
  })

  it('shows no error without one', async () => {
    const wrapper = await mount(Login, '/login')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('Google sign-in callback page', () => {
  it('signs in with the tokens, clears them from the address and opens the boards', async () => {
    const me = vi.spyOn(authApi, 'me').mockResolvedValue(user)
    await mount(OAuthCallback, callbackPath)
    const auth = useAuthStore(useNuxtApp().$pinia as Pinia)

    expect(me).toHaveBeenCalledWith('access-token')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.user?.email).toBe('person@example.com')
    expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)!)).toEqual({
      accessToken: 'access-token', refreshToken: 'refresh-token',
    })
    expect(window.location.hash).toBe('')
    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe('/'))
  })

  it('rejects an incomplete link without calling the backend', async () => {
    const me = vi.spyOn(authApi, 'me')
    const wrapper = await mount(OAuthCallback, '/oauth/callback#access_token=only-one')
    expect(me).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('incomplete')
    expect(wrapper.find('a[href="/login"]').exists()).toBe(true)
    expect(window.location.hash).toBe('')
  })

  it('shows the error and keeps no session when the backend rejects the tokens', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValue(new Error('This account is inactive.'))
    const wrapper = await mount(OAuthCallback, callbackPath)
    const auth = useAuthStore(useNuxtApp().$pinia as Pinia)

    expect(wrapper.get('[role="alert"]').text()).toBe('This account is inactive.')
    expect(auth.isAuthenticated).toBe(false)
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })
})

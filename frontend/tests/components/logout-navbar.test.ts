import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { useNuxtApp } from '#app'
import type { Pinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Layout from '~/layouts/default.vue'
import Login from '~/pages/login.vue'
import { useAuthStore } from '~/stores/auth'

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); localStorage.clear() })

describe('Navbar logout', () => {
  it('shows logout for authenticated users and calls the store action', async () => {
    const store = useAuthStore(useNuxtApp().$pinia as Pinia)
    store.setTokens({ access_token: 'access', refresh_token: 'refresh' })
    store.setUser({ id: 1, email: 'user@example.com', display_name: 'User', timezone: 'UTC', created_at: '2026-11-01T12:00:00Z' })
    const logout = vi.spyOn(store, 'logout').mockResolvedValue(true)
    wrapper = await mountSuspended(Layout)
    expect(wrapper.get('[data-testid="logout-button"]').text()).toContain('Log out')
    await wrapper.get('[data-testid="logout-button"]').trigger('click')
    await flushPromises()
    expect(logout).toHaveBeenCalledTimes(1)
    store.loggingOut = true
    await flushPromises()
    expect(wrapper.get('[data-testid="logout-button"]').attributes('disabled')).toBeDefined()
    store.loggingOut = false
    store.clearTokens()
  })

  it('hides logout for guests', async () => {
    useAuthStore(useNuxtApp().$pinia as Pinia).clearTokens()
    wrapper = await mountSuspended(Layout)
    expect(wrapper.find('[data-testid="logout-button"]').exists()).toBe(false)
  })

  it('explains when server revocation could not be confirmed', async () => {
    wrapper = await mountSuspended(Login, { route: '/login?logout=unconfirmed' })
    expect(wrapper.get('[role="alert"]').text()).toContain('server token revocation could not be confirmed')
  })
})

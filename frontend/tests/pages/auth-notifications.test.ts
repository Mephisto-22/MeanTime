import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { useNuxtApp } from '#app'
import type { Pinia } from 'pinia'
import ToastEventBus from 'primevue/toasteventbus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Login from '~/pages/login.vue'
import Register from '~/pages/register.vue'
import { useAuthStore } from '~/stores/auth'

let wrapper: VueWrapper | undefined
beforeEach(() => vi.restoreAllMocks())
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

describe('Authentication notifications', () => {
  it('shows one toast for rejected login, retains input, and enables retry', async () => {
    const auth = useAuthStore(useNuxtApp().$pinia as Pinia)
    const login = vi.spyOn(auth, 'login').mockRejectedValue(new Error('Invalid email or password.'))
    const toast = vi.spyOn(ToastEventBus, 'emit')
    wrapper = await mountSuspended(Login, { route: '/login' })
    await wrapper.get('input[name="email"]').setValue('user@example.com')
    await wrapper.get('input[name="password"]').setValue('password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(login).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'error', summary: 'Unable to log in', detail: 'Invalid email or password.' }))
    expect(toast.mock.calls.filter(([event]) => event === 'add')).toHaveLength(1)
    expect(wrapper.get('input[name="email"]').element.value).toBe('user@example.com')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('formats registration validation details as a toast', async () => {
    const auth = useAuthStore(useNuxtApp().$pinia as Pinia)
    vi.spyOn(auth, 'register').mockRejectedValue({ statusCode: 422, data: { detail: [
      { loc: ['body', 'payload', 'password'], msg: 'Choose a stronger password.', input: 'do-not-show-this' },
    ] } })
    const toast = vi.spyOn(ToastEventBus, 'emit')
    wrapper = await mountSuspended(Register, { route: '/register' })
    await wrapper.get('input[name="display_name"]').setValue('Name')
    await wrapper.get('input[name="email"]').setValue('user@example.com')
    await wrapper.get('input[name="password"]').setValue('Password982!')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(toast).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'error', summary: 'Unable to register', detail: 'password: Choose a stronger password.' }))
  })
})

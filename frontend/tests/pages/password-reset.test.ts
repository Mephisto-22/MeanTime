import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { useNuxtApp } from '#app'
import type { Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '~/api/auth'
import ForgotPassword from '~/pages/forgot-password.vue'
import ResetPassword from '~/pages/reset-password.vue'
import { useAuthStore } from '~/stores/auth'

const resetPath = '/reset-password#uid=MQ&token=test-token'
let wrappers: VueWrapper[] = []

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers = []
  window.history.replaceState({}, '', '/')
  localStorage.clear()
  vi.restoreAllMocks()
})

async function mountReset(path = resetPath) {
  window.history.replaceState({}, '', path)
  const wrapper = await mountSuspended(ResetPassword, { route: path })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('Password reset pages', () => {
  it('displays the generic request response without exposing account existence', async () => {
    const request = vi.spyOn(authApi, 'requestPasswordReset').mockResolvedValue({ detail: 'If an account exists, instructions will be sent.' })
    const wrapper = await mountSuspended(ForgotPassword, { route: '/forgot-password' })
    wrappers.push(wrapper)
    await wrapper.get('input[name="email"]').setValue('user@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(request).toHaveBeenCalledWith('user@example.com')
    expect(wrapper.get('[role="status"]').text()).toContain('If an account exists')
  })

  it('shows request errors and enables retry', async () => {
    vi.spyOn(authApi, 'requestPasswordReset').mockRejectedValue(new Error('Network unavailable'))
    const wrapper = await mountSuspended(ForgotPassword, { route: '/forgot-password' })
    wrappers.push(wrapper)
    await wrapper.get('input[name="email"]').setValue('user@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Network unavailable')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('reads the real browser fragment and completes a verified reset', async () => {
    const validate = vi.spyOn(authApi, 'validatePasswordReset').mockResolvedValue({ detail: 'Verified' })
    const confirm = vi.spyOn(authApi, 'confirmPasswordReset').mockResolvedValue({ detail: 'Password updated.' })
    const auth = useAuthStore(useNuxtApp().$pinia as Pinia)
    const clear = vi.spyOn(auth, 'clearTokens')
    const wrapper = await mountReset()
    expect(validate).toHaveBeenCalledWith({ uid: 'MQ', token: 'test-token' })
    expect(clear).toHaveBeenCalled()
    await wrapper.get('input[name="password"]').setValue('NewPassword982!')
    await wrapper.get('input[name="password_confirm"]').setValue('NewPassword982!')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith({ uid: 'MQ', token: 'test-token', password: 'NewPassword982!', password_confirm: 'NewPassword982!' })
    expect(wrapper.text()).toContain('Password updated.')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(window.location.hash).toBe('')
  })

  it('rejects an incomplete link without calling the backend', async () => {
    const validate = vi.spyOn(authApi, 'validatePasswordReset')
    const wrapper = await mountReset('/reset-password')
    expect(validate).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('incomplete')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('shows expired-link errors and a way to request another link', async () => {
    vi.spyOn(authApi, 'validatePasswordReset').mockRejectedValue(new Error('Link expired'))
    const wrapper = await mountReset()
    expect(wrapper.get('[role="alert"]').text()).toBe('Link expired')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.get('a[href="/forgot-password"]').exists()).toBe(true)
  })

  it('retains the form for correction after backend password validation fails', async () => {
    vi.spyOn(authApi, 'validatePasswordReset').mockResolvedValue({ detail: 'Verified' })
    vi.spyOn(authApi, 'confirmPasswordReset').mockRejectedValue(new Error('Password is too common'))
    const wrapper = await mountReset()
    await wrapper.get('input[name="password"]').setValue('password')
    await wrapper.get('input[name="password_confirm"]').setValue('password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Password is too common')
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Password updated.')
  })
})

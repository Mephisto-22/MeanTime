import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { useNuxtApp, useRouter, useState } from '#app'
import type { Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ToastEventBus from 'primevue/toasteventbus'
import Confirm from '~/pages/confirm-email.vue'
import Register from '~/pages/register.vue'
import Notice from '~/components/EmailVerificationNotice.vue'
import RegistrationForm from '~/components/RegistrationForm.vue'
import { authApi } from '~/api/auth'
import { apiService } from '~/services/ApiService'
import { useAuthStore } from '~/stores/auth'

let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.restoreAllMocks()
  useState('verification-email', () => '').value = ''
  localStorage.clear()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  useAuthStore(useNuxtApp().$pinia as Pinia).clearTokens()
  window.history.replaceState({}, '', '/')
})

describe('Email confirmation', () => {
  it('sends registration to the inbox card without creating a session', async () => {
    const auth = useAuthStore(useNuxtApp().$pinia as Pinia)
    vi.spyOn(auth, 'register').mockResolvedValue({ id: 1, email: 'new@example.com', display_name: 'New', timezone: 'UTC', created_at: '', is_verified: false })
    wrapper = await mountSuspended(Register, { route: '/register' })
    wrapper.findComponent(RegistrationForm).vm.$emit('submit', { email: 'new@example.com', password: 'Cedar!Orbit72', display_name: 'New' })
    await flushPromises()
    await vi.waitFor(() => expect(useRouter().currentRoute.value.path).toBe('/check-email'))
    expect(useState('verification-email').value).toBe('new@example.com')
    expect(auth.isAuthenticated).toBe(false)
    expect(localStorage.getItem('meantime.auth')).toBeNull()
  })

  it('confirms a fragment token, removes it from history, and offers login', async () => {
    const confirm = vi.spyOn(authApi, 'confirmEmail').mockResolvedValue({ detail: 'Your email is confirmed.' })
    window.history.replaceState({}, '', '/confirm-email#token=valid-token')
    wrapper = await mountSuspended(Confirm, { route: '/confirm-email#token=valid-token' })
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith('valid-token')
    expect(window.location.hash).toBe('')
    expect(wrapper.text()).toContain('Your email is confirmed.')
    expect(wrapper.get('a[href="/login"]').exists()).toBe(true)
  })

  it('shows recovery for expired links', async () => {
    vi.spyOn(authApi, 'confirmEmail').mockRejectedValue(new Error('This confirmation link is invalid or expired.'))
    window.history.replaceState({}, '', '/confirm-email#token=expired')
    wrapper = await mountSuspended(Confirm, { route: '/confirm-email#token=expired' })
    await flushPromises()
    expect(wrapper.text()).toContain('invalid or expired')
    expect(wrapper.get('a[href="/check-email"]').exists()).toBe(true)
  })

  it('does not submit incomplete links', async () => {
    const confirm = vi.spyOn(authApi, 'confirmEmail')
    window.history.replaceState({}, '', '/confirm-email')
    wrapper = await mountSuspended(Confirm, { route: '/confirm-email' })
    expect(confirm).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('incomplete')
  })

  it('validates resend input and prevents duplicate or immediate repeated requests', async () => {
    const resend = vi.spyOn(authApi, 'resendConfirmation').mockResolvedValue({ detail: 'Check your inbox.' })
    wrapper = await mountSuspended(Notice)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('input').setValue('new@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    expect(resend).toHaveBeenCalledTimes(1)
    expect(resend).toHaveBeenCalledWith('new@example.com')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Check your inbox.')
  })

  it('shows delivery failures as toasts and enables retry', async () => {
    vi.spyOn(authApi, 'resendConfirmation').mockRejectedValue(new Error('Delivery unavailable'))
    const toast = vi.spyOn(ToastEventBus, 'emit')
    wrapper = await mountSuspended(Notice, { props: { initialEmail: 'new@example.com' } })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(toast).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'error', summary: 'Unable to send confirmation email' }))
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('uses public POST endpoints and keeps secrets out of URLs', async () => {
    const post = vi.spyOn(apiService, 'post').mockResolvedValue({ detail: 'OK' })
    await authApi.confirmEmail('secret-token')
    await authApi.resendConfirmation('new@example.com')
    expect(post).toHaveBeenNthCalledWith(1, '/api/auth/email-verification/confirm', { token: 'secret-token' }, { auth: false })
    expect(post).toHaveBeenNthCalledWith(2, '/api/auth/email-verification/resend', { email: 'new@example.com' }, { auth: false })
  })
})

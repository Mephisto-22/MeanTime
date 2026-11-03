import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RegistrationForm from '~/components/RegistrationForm.vue'
import { authApi, type PasswordRequirementsResponse } from '~/api/auth'

const results = (met = true): PasswordRequirementsResponse => ({ requirements: [
  { id: 'MinimumLengthValidator', description: 'Use at least 8 characters.', met },
  { id: 'CommonPasswordValidator', description: 'Avoid common passwords.', met },
  { id: 'MaximumLength', description: 'Use no more than 128 characters.', met },
] })
let wrappers: ReturnType<typeof mount>[] = []
function form() {
  const wrapper = mount(RegistrationForm, { global: { plugins: [PrimeVue] } })
  wrappers.push(wrapper)
  return wrapper
}
async function fill(wrapper: ReturnType<typeof form>) {
  await wrapper.get('input[name="display_name"]').setValue('Name')
  await wrapper.get('input[name="email"]').setValue('user@example.com')
  await wrapper.get('input[name="password"]').setValue('StrongPass!746xyz')
}
async function settle() { await vi.advanceTimersByTimeAsync(300); await flushPromises() }

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(authApi, 'passwordRequirements').mockResolvedValue(results())
})
afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount())
  wrappers = []
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Live registration requirements and confirmation', () => {
  it('shows unmet requirements and a labelled confirmation field before input', () => {
    const wrapper = form()
    expect(wrapper.text()).toContain('Password requirements')
    expect(wrapper.findAll('[data-met="true"]')).toHaveLength(0)
    expect(wrapper.get('label[for="register-password-confirm"]').text()).toBe('Confirm password')
    expect(wrapper.get('input[name="password_confirm"]').attributes('type')).toBe('password')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('debounces checks and marks fulfilled requirements without sending confirmation', async () => {
    const wrapper = form()
    await fill(wrapper)
    expect(authApi.passwordRequirements).not.toHaveBeenCalled()
    await settle()
    expect(authApi.passwordRequirements).toHaveBeenCalledTimes(1)
    expect(authApi.passwordRequirements).toHaveBeenCalledWith({ password: 'StrongPass!746xyz', email: 'user@example.com', display_name: 'Name' })
    expect(wrapper.findAll('[data-met="true"]')).toHaveLength(3)
    await wrapper.get('input[name="password_confirm"]').setValue('StrongPass!746xyz')
    expect(wrapper.text()).toContain('Passwords match.')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([[{ display_name: 'Name', email: 'user@example.com', password: 'StrongPass!746xyz' }]])
  })

  it('blocks mismatches and recomputes confirmation when the original password changes', async () => {
    const wrapper = form()
    await fill(wrapper)
    await settle()
    await wrapper.get('input[name="password_confirm"]').setValue('DifferentPassword982!')
    expect(wrapper.get('input[name="password_confirm"]').attributes('aria-invalid')).toBe('true')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    await wrapper.get('input[name="password_confirm"]').setValue('StrongPass!746xyz')
    await wrapper.get('input[name="password"]').setValue('ChangedPassword982!')
    expect(wrapper.text()).toContain('Passwords do not match.')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('clears old green checks and ignores an outdated response', async () => {
    let release!: (value: PasswordRequirementsResponse) => void
    vi.mocked(authApi.passwordRequirements).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const wrapper = form()
    await fill(wrapper)
    await settle()
    await wrapper.get('input[name="password"]').setValue('short')
    release(results())
    await flushPromises()
    expect(wrapper.findAll('[data-met="true"]')).toHaveLength(0)
    vi.mocked(authApi.passwordRequirements).mockResolvedValue(results(false))
    await settle()
    expect(wrapper.findAll('[data-met="true"]')).toHaveLength(0)
  })

  it('rechecks similarity when the email changes and clears checks when password is erased', async () => {
    const wrapper = form()
    await fill(wrapper)
    await settle()
    await wrapper.get('input[name="email"]').setValue('new@example.com')
    expect(wrapper.findAll('[data-met="true"]')).toHaveLength(0)
    await settle()
    expect(authApi.passwordRequirements).toHaveBeenLastCalledWith(expect.objectContaining({ email: 'new@example.com' }))
    await wrapper.get('input[name="password"]').setValue('')
    expect(wrapper.findAll('[data-met="true"]')).toHaveLength(0)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('shows a retry action and stays disabled if checks fail', async () => {
    vi.mocked(authApi.passwordRequirements).mockRejectedValueOnce(new Error('Offline'))
    const wrapper = form()
    await fill(wrapper)
    await settle()
    expect(wrapper.get('[role="alert"]').text()).toContain('Unable to check')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('button[type="button"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-met="true"]')).toHaveLength(3)
  })

  it('prevents submission while saving even after every requirement is met', async () => {
    const wrapper = form()
    await fill(wrapper)
    await wrapper.get('input[name="password_confirm"]').setValue('StrongPass!746xyz')
    await settle()
    await wrapper.setProps({ loading: true })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })
})

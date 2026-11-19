import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ToastEventBus from 'primevue/toasteventbus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginForm from '~/components/LoginForm.vue'
import RegistrationForm from '~/components/RegistrationForm.vue'
import EmailVerificationNotice from '~/components/EmailVerificationNotice.vue'
import PasswordResetRequestForm from '~/components/PasswordResetRequestForm.vue'
import BoardFormDialog from '~/components/kanban/BoardFormDialog.vue'
import ColumnFormDialog from '~/components/kanban/ColumnFormDialog.vue'
import { authApi } from '~/api/auth'
import { kanbanApi } from '~/api/kanban'

afterEach(() => vi.restoreAllMocks())
const global = { plugins: [PrimeVue, ToastService] }

describe('Consistent required fields', () => {
  it('keeps empty login neutral before interaction and marks invalid fields red after edit and blur', async () => {
    const wrapper = mount(LoginForm, { global })
    const email = wrapper.get('input[name="email"]')
    const password = wrapper.get('input[name="password"]')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(email.attributes('aria-invalid')).toBe('false')
    expect(email.classes()).not.toContain('p-invalid')
    expect(password.attributes('aria-invalid')).toBe('false')
    expect(password.classes()).not.toContain('p-invalid')
    expect(wrapper.find('.field-error-text').exists()).toBe(false)

    // Focusing and blurring without typing does not trigger premature errors.
    await email.trigger('blur')
    expect(email.attributes('aria-invalid')).toBe('false')
    expect(wrapper.find('.field-error-text').exists()).toBe(false)

    // Typing before blur does not prematurely turn red.
    await email.setValue('invalid-email')
    expect(email.attributes('aria-invalid')).toBe('false')
    expect(wrapper.find('#login-email-error').exists()).toBe(false)

    // Blurring an invalid modified value marks only that field invalid.
    await email.trigger('blur')
    expect(email.attributes('aria-invalid')).toBe('true')
    expect(email.classes()).toContain('p-invalid')
    expect(wrapper.find('#login-email-error').exists()).toBe(true)
    expect(password.attributes('aria-invalid')).toBe('false')

    await password.setValue('password')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()

    await email.setValue('user@example.com')
    expect(email.attributes('aria-invalid')).toBe('false')
    expect(wrapper.find('#login-email-error').exists()).toBe(false)
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([[{ email: 'user@example.com', password: 'password' }]])
  })

  it('keeps registration fields neutral initially and rejects whitespace-only display names and short passwords', async () => {
    vi.spyOn(authApi, 'passwordRequirements').mockResolvedValue({ requirements: [{ id: 'checked', description: 'All checks passed', met: true }] })
    const wrapper = mount(RegistrationForm, { global })
    const displayName = wrapper.get('input[name="display_name"]')
    const email = wrapper.get('input[name="email"]')
    const password = wrapper.get('input[name="password"]')
    const confirm = wrapper.get('input[name="password_confirm"]')

    expect(displayName.attributes('aria-invalid')).toBe('false')
    expect(email.attributes('aria-invalid')).toBe('false')
    expect(password.attributes('aria-invalid')).toBe('false')
    expect(confirm.attributes('aria-invalid')).toBe('false')
    expect(wrapper.findAll('.field-error-text')).toHaveLength(0)

    await displayName.setValue('   ')
    await displayName.trigger('blur')
    expect(displayName.attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#register-display-name-error').exists()).toBe(true)

    await email.setValue('user@example.com')
    await password.setValue('short')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await displayName.setValue(' Name ')
    await password.setValue('StrongPassword982!')
    await confirm.setValue('StrongPassword982!')
    await vi.waitFor(() => expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined())
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]).toEqual([{
      display_name: 'Name',
      email: 'user@example.com',
      password: 'StrongPassword982!',
      timezone: expect.any(String),
    }])
    wrapper.unmount()
  })

  it('never submits a busy auth form even with valid fields', async () => {
    const wrapper = mount(LoginForm, { props: { loading: true }, global })
    await wrapper.get('input[name="email"]').setValue('user@example.com')
    await wrapper.get('input[name="password"]').setValue('password')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('keeps board dialog clean before input, shows errors after interaction/submit, and keeps failed saves open', async () => {
    const emit = vi.spyOn(ToastEventBus, 'emit')
    const save = vi.spyOn(kanbanApi, 'createBoard').mockRejectedValue(new Error('Save failed'))
    const wrapper = mount(BoardFormDialog, {
      props: { board: null, visible: true },
      global: { ...global, stubs: { Dialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
    })
    const input = wrapper.get('input')
    expect(wrapper.get('[data-testid="board-save-button"]').attributes('disabled')).toBeDefined()
    expect(input.attributes('aria-invalid')).toBe('false')
    expect(input.classes()).not.toContain('p-invalid')
    expect(wrapper.find('[data-testid="board-title-error"]').exists()).toBe(false)

    // Autofocus blur without typing does not trigger error.
    await input.trigger('blur')
    expect(input.attributes('aria-invalid')).toBe('false')
    expect(wrapper.find('[data-testid="board-title-error"]').exists()).toBe(false)

    // Submitting empty marks the field invalid and reveals the inline message.
    await wrapper.get('form').trigger('submit')
    expect(save).not.toHaveBeenCalled()
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('[data-testid="board-title-error"]').exists()).toBe(true)

    await input.setValue('My board')
    expect(input.attributes('aria-invalid')).toBe('false')
    expect(wrapper.find('[data-testid="board-title-error"]').exists()).toBe(false)

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(emit).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'error', summary: 'Unable to save board', detail: 'Save failed' }))
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:visible')).toBeUndefined()
    expect(wrapper.get('input').element.value).toBe('My board')
  })

  it('defers invalid styling on email verification, password reset request, and column forms until blur or submit', async () => {
    const notice = mount(EmailVerificationNotice, { global })
    const noticeInput = notice.get('input[name="email"]')
    expect(noticeInput.attributes('aria-invalid')).toBe('false')
    expect(notice.find('#confirmation-email-error').exists()).toBe(false)
    await noticeInput.setValue('bad')
    expect(noticeInput.attributes('aria-invalid')).toBe('false')
    await noticeInput.trigger('blur')
    expect(noticeInput.attributes('aria-invalid')).toBe('true')
    expect(notice.find('#confirmation-email-error').exists()).toBe(true)

    const resetReq = mount(PasswordResetRequestForm, { global })
    const resetInput = resetReq.get('input[name="email"]')
    expect(resetInput.attributes('aria-invalid')).toBe('false')
    await resetInput.setValue('bad')
    expect(resetInput.attributes('aria-invalid')).toBe('false')
    await resetInput.trigger('blur')
    expect(resetInput.attributes('aria-invalid')).toBe('true')
    expect(resetReq.find('#reset-email-error').exists()).toBe(true)

    const colDialog = mount(ColumnFormDialog, {
      props: { visible: true, boardId: 'b-1', column: null },
      global: { ...global, stubs: { Dialog: { template: '<div><slot /></div>' } } },
    })
    const colInput = colDialog.get('#column-title')
    expect(colInput.attributes('aria-invalid')).toBe('false')
    expect(colDialog.find('#column-title-error').exists()).toBe(false)
    await colDialog.get('form').trigger('submit')
    expect(colInput.attributes('aria-invalid')).toBe('true')
    expect(colDialog.find('#column-title-error').exists()).toBe(true)
  })
})

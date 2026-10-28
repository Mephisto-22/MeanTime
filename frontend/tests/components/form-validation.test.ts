import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ToastEventBus from 'primevue/toasteventbus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginForm from '~/components/LoginForm.vue'
import RegistrationForm from '~/components/RegistrationForm.vue'
import BoardFormDialog from '~/components/kanban/BoardFormDialog.vue'
import { kanbanApi } from '~/api/kanban'

afterEach(() => vi.restoreAllMocks())
const global = { plugins: [PrimeVue, ToastService] }

describe('Consistent required fields', () => {
  it('disables empty login and marks missing fields red and accessible', async () => {
    const wrapper = mount(LoginForm, { global })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('input[name="email"]').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('input[name="password"]').classes()).toContain('p-invalid')
    await wrapper.get('input[name="email"]').setValue('invalid-email')
    await wrapper.get('input[name="password"]').setValue('password')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    await wrapper.get('input[name="email"]').setValue('user@example.com')
    expect(wrapper.get('input[name="email"]').attributes('aria-invalid')).toBe('false')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([[{ email: 'user@example.com', password: 'password' }]])
  })

  it('rejects whitespace-only display names and short passwords in registration', async () => {
    const wrapper = mount(RegistrationForm, { global })
    await wrapper.get('input[name="display_name"]').setValue('   ')
    await wrapper.get('input[name="email"]').setValue('user@example.com')
    await wrapper.get('input[name="password"]').setValue('short')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('input[name="display_name"]').setValue(' Name ')
    await wrapper.get('input[name="password"]').setValue('StrongPassword982!')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]).toEqual([{ display_name: 'Name', email: 'user@example.com', password: 'StrongPassword982!' }])
  })

  it('never submits a busy auth form even with valid fields', async () => {
    const wrapper = mount(LoginForm, { props: { loading: true }, global })
    await wrapper.get('input[name="email"]').setValue('user@example.com')
    await wrapper.get('input[name="password"]').setValue('password')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('blocks blank boards and keeps failed saves open with a toast', async () => {
    const emit = vi.spyOn(ToastEventBus, 'emit')
    const save = vi.spyOn(kanbanApi, 'createBoard').mockRejectedValue(new Error('Save failed'))
    const wrapper = mount(BoardFormDialog, {
      props: { board: null, visible: true },
      global: { ...global, stubs: { Dialog: { template: '<div><slot /></div>' } } },
    })
    expect(wrapper.get('[data-testid="board-save-button"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    await wrapper.get('form').trigger('submit')
    expect(save).not.toHaveBeenCalled()
    await wrapper.get('input').setValue('My board')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(emit).toHaveBeenCalledWith('add', expect.objectContaining({ severity: 'error', summary: 'Unable to save board', detail: 'Save failed' }))
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:visible')).toBeUndefined()
    expect(wrapper.get('input').element.value).toBe('My board')
  })
})

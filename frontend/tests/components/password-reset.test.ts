import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it } from 'vitest'
import PasswordResetForm from '~/components/PasswordResetForm.vue'
import PasswordResetRequestForm from '~/components/PasswordResetRequestForm.vue'

const global = { plugins: [PrimeVue] }

describe('Password reset forms', () => {
  it('submits the email from its labelled email input', async () => {
    const wrapper = mount(PasswordResetRequestForm, { global })
    const input = wrapper.get('input[name="email"]')
    expect(input.attributes('type')).toBe('email')
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
    await input.setValue('user@example.com')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([['user@example.com']])
  })

  it('shows a mismatch and submits only matching passwords', async () => {
    const wrapper = mount(PasswordResetForm, { global })
    await wrapper.get('input[name="password"]').setValue('NewPassword982!')
    await wrapper.get('input[name="password_confirm"]').setValue('DifferentPassword982!')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('Passwords do not match.')
    expect(wrapper.emitted('submit')).toBeUndefined()
    await wrapper.get('input[name="password_confirm"]').setValue('NewPassword982!')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([[{
      password: 'NewPassword982!', password_confirm: 'NewPassword982!',
    }]])
  })

  it('disables submission while either form is loading', async () => {
    for (const component of [PasswordResetForm, PasswordResetRequestForm]) {
      const wrapper = mount(component, { props: { loading: true }, global })
      expect(wrapper.get('button').attributes('disabled')).toBeDefined()
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('submit')).toBeUndefined()
    }
  })
})

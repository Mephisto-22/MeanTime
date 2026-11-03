import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HeadlessLayout from '~/layouts/headless.vue'

describe('Headless Layout Suite', () => {
  it('renders slot content inside main element', () => {
    const wrapper = mount(HeadlessLayout, {
      slots: {
        default: '<div data-testid="auth-page-content">Login Form Content</div>',
      },
    })

    const slotContent = wrapper.find('[data-testid="auth-page-content"]')
    expect(slotContent.exists()).toBe(true)
    expect(slotContent.text()).toBe('Login Form Content')

    const main = wrapper.find('main')
    expect(main.exists()).toBe(true)
    expect(main.find('[data-testid="auth-page-content"]').exists()).toBe(true)
  })

  it('omits top application header bar and header navigation elements', () => {
    const wrapper = mount(HeadlessLayout, {
      slots: {
        default: '<div>Content</div>',
      },
    })

    expect(wrapper.find('header').exists()).toBe(false)
    expect(wrapper.find('[data-testid="logout-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="user-profile-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="friends-nav-link"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="boards-nav-link"]').exists()).toBe(false)
  })

  it('renders footer with copyright and environment information', () => {
    const wrapper = mount(HeadlessLayout, {
      slots: {
        default: '<div>Content</div>',
      },
    })

    const footer = wrapper.find('footer')
    expect(footer.exists()).toBe(true)
    expect(footer.text()).toContain('MeanTime')
    expect(footer.text()).toContain('2026')
  })
})

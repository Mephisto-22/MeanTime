import { enableAutoUnmount, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UserAvatar from '~/components/UserAvatar.vue'

enableAutoUnmount(afterEach)

afterEach(() => {
  document.body.querySelectorAll('.p-tooltip').forEach(el => el.remove())
})

function mountAvatar(props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) {
  return mount(UserAvatar, {
    props,
    attrs,
    attachTo: document.body,
    global: {
      plugins: [PrimeVue],
    },
  })
}

describe('UserAvatar Component Suite', () => {
  it('renders initials from multi-word and single-word display_name', () => {
    const multi = mountAvatar({ user: { display_name: 'Sarah Connor', email: 'sarah@example.com' } })
    expect(multi.text()).toBe('SC')
    expect(multi.attributes('role')).toBe('img')
    expect(multi.attributes('aria-label')).toBe('Sarah Connor')

    const single = mountAvatar({ user: { display_name: 'Eve', email: 'eve@example.com' } })
    expect(single.text()).toBe('E')
    expect(single.attributes('aria-label')).toBe('Eve')
  })

  it('supports camelCase displayName and email fallback when display name is empty', () => {
    const camel = mountAvatar({ user: { displayName: 'Alice Walker' } })
    expect(camel.text()).toBe('AW')
    expect(camel.attributes('aria-label')).toBe('Alice Walker')

    const emailOnly = mountAvatar({ user: { display_name: '  ', email: 'anonymous@example.com' } })
    expect(emailOnly.text()).toBe('A')
    expect(emailOnly.attributes('aria-label')).toBe('anonymous@example.com')
  })

  it('renders generic user icon and secondary styling when user or identity is missing', () => {
    const missing = mountAvatar({ user: null })
    expect(missing.find('.pi-user').exists()).toBe(true)
    expect(missing.classes()).toContain('user-avatar-secondary')
    expect(missing.attributes('aria-label')).toBe('Unknown user')

    const blank = mountAvatar({ user: { display_name: '', email: '' } })
    expect(blank.find('.pi-user').exists()).toBe(true)
    expect(blank.classes()).toContain('user-avatar-secondary')
    expect(blank.attributes('aria-label')).toBe('Unknown user')
  })

  it('shows a PrimeVue hover tooltip with the user full name without duplicating native title', async () => {
    const wrapper = mountAvatar({
      user: { display_name: 'Sarah Connor', email: 'sarah@example.com' },
    })

    expect(wrapper.attributes('title')).toBeUndefined()

    await wrapper.trigger('mouseenter')
    await vi.waitFor(() => {
      expect(document.body.querySelector('.p-tooltip-text')?.textContent).toBe('Sarah Connor')
    })

    await wrapper.trigger('mouseleave')
    await vi.waitFor(() => {
      expect(document.body.querySelector('.p-tooltip-text')).toBeNull()
    })
  })

  it('supports custom tooltip text, variant, size, and fallthrough attributes', async () => {
    const secondary = mountAvatar(
      {
        user: { display_name: 'Bob Dylan' },
        variant: 'secondary',
        size: 'small',
        tooltip: 'Custom Name',
      },
      { 'data-testid': 'custom-avatar', class: 'border-2' },
    )

    expect(secondary.attributes('data-testid')).toBe('custom-avatar')
    expect(secondary.classes()).toContain('user-avatar-secondary')
    expect(secondary.classes()).toContain('w-5')
    expect(secondary.classes()).toContain('h-5')
    expect(secondary.classes()).toContain('border-2')
    expect(secondary.attributes('aria-label')).toBe('Custom Name')

    await secondary.trigger('mouseenter')
    await vi.waitFor(() => {
      expect(document.body.querySelector('.p-tooltip-text')?.textContent).toBe('Custom Name')
    })
    await secondary.trigger('mouseleave')
    await vi.waitFor(() => {
      expect(document.body.querySelector('.p-tooltip-text')).toBeNull()
    })

    const large = mountAvatar({ user: { display_name: 'Bob Dylan' }, size: 'large' })
    expect(large.classes()).toContain('user-avatar-primary')
    expect(large.classes()).toContain('p-avatar-lg')
  })
})

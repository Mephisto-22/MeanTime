import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DefaultLayout from '~/layouts/default.vue'
import { friendsApi } from '~/api/friends'

const mockAuthStore = {
  sessionInitialized: true,
  isAuthenticated: true,
  initializeSession: vi.fn(),
  user: {
    id: 42,
    email: 'alex@example.com',
    display_name: 'Alex Engineer',
    timezone: 'UTC',
    created_at: '2026-01-01T00:00:00Z',
  },
}

vi.mock('~/stores/auth', () => ({
  useAuthStore: () => mockAuthStore,
}))

function mountLayout(options: { slots?: Record<string, string> } = {}) {
  return mount(DefaultLayout, {
    global: {
      plugins: [PrimeVue],
      stubs: {
        NuxtLink: {
          props: ['to'],
          template: '<a :href="to"><slot /></a>',
        },
      },
    },
    slots: options.slots,
  })
}

describe('Default Layout Header Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(friendsApi, 'getRequests').mockResolvedValue({ incoming: [], outgoing: [] })
    mockAuthStore.sessionInitialized = true
    mockAuthStore.isAuthenticated = true
    mockAuthStore.user = {
      id: 42,
      email: 'alex@example.com',
      display_name: 'Alex Engineer',
      timezone: 'UTC',
      created_at: '2026-01-01T00:00:00Z',
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authenticated state', () => {
    it('renders display name button in top right when authenticated', async () => {
      const wrapper = mountLayout({
        slots: {
          default: '<div>Content</div>',
        },
      })
      await flushPromises()

      const button = wrapper.find('[data-testid="user-profile-button"]')
      expect(button.exists()).toBe(true)
      expect(button.text()).toContain('Alex Engineer')
    })

    it('renders navigation link pointing to /friends with users icon and label', async () => {
      const wrapper = mountLayout()
      await flushPromises()

      const link = wrapper.find('[data-testid="friends-nav-link"]')
      expect(link.exists()).toBe(true)
      expect(link.attributes('href') || link.attributes('to')).toBe('/friends')
      expect(link.text()).toContain('Friends')
      expect(link.find('.pi-users').exists()).toBe(true)
    })

    it('fetches requests from friendsApi.getRequests on mount', async () => {
      const getRequestsSpy = vi.spyOn(friendsApi, 'getRequests').mockResolvedValue({ incoming: [], outgoing: [] })

      mountLayout()
      await flushPromises()

      expect(getRequestsSpy).toHaveBeenCalledTimes(1)
    })

    it('renders pending count badge when incoming requests exist', async () => {
      vi.spyOn(friendsApi, 'getRequests').mockResolvedValue({
        incoming: [
          {
            id: 1,
            user: {
              id: 10,
              email: 'jane@example.com',
              display_name: 'Jane Doe',
              timezone: 'UTC',
              created_at: '2026-01-01T00:00:00Z',
            },
            created_at: '2026-01-02T00:00:00Z',
          },
          {
            id: 2,
            user: {
              id: 11,
              email: 'john@example.com',
              display_name: 'John Smith',
              timezone: 'UTC',
              created_at: '2026-01-01T00:00:00Z',
            },
            created_at: '2026-01-02T00:00:00Z',
          },
        ],
        outgoing: [],
      })

      const wrapper = mountLayout()
      await flushPromises()

      const badge = wrapper.find('[data-testid="friends-pending-badge"]')
      expect(badge.exists()).toBe(true)
      expect(badge.text()).toContain('2')
    })

    it('does not render pending badge when incoming requests list is empty', async () => {
      vi.spyOn(friendsApi, 'getRequests').mockResolvedValue({ incoming: [], outgoing: [] })

      const wrapper = mountLayout()
      await flushPromises()

      expect(wrapper.find('[data-testid="friends-pending-badge"]').exists()).toBe(false)
    })

    it('handles getRequests API error safely without crashing', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(friendsApi, 'getRequests').mockRejectedValue(new Error('Network error'))

      const wrapper = mountLayout()
      await flushPromises()

      expect(wrapper.find('[data-testid="friends-nav-link"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="user-profile-button"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="friends-pending-badge"]').exists()).toBe(false)
      consoleErrorSpy.mockRestore()
    })
  })

  describe('Unauthenticated state', () => {
    it('does not render profile button when unauthenticated', async () => {
      mockAuthStore.isAuthenticated = false
      mockAuthStore.user = null as any

      const wrapper = mountLayout()
      await flushPromises()

      expect(wrapper.find('[data-testid="user-profile-button"]').exists()).toBe(false)
    })

    it('does not render friends nav link when unauthenticated', async () => {
      mockAuthStore.isAuthenticated = false
      mockAuthStore.user = null as any

      const wrapper = mountLayout()
      await flushPromises()

      expect(wrapper.find('[data-testid="friends-nav-link"]').exists()).toBe(false)
    })

    it('does not fetch friend requests when unauthenticated', async () => {
      mockAuthStore.isAuthenticated = false
      mockAuthStore.user = null as any
      const getRequestsSpy = vi.spyOn(friendsApi, 'getRequests')

      mountLayout()
      await flushPromises()

      expect(getRequestsSpy).not.toHaveBeenCalled()
    })
  })
})

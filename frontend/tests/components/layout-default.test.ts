import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { defineComponent, h } from 'vue'
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

function mountLayout(options: { slots?: Record<string, string>; route?: string } = {}) {
  const router = useRouter()
  if (options.route) {
    router.push(options.route)
  }
  return mount(DefaultLayout, {
    global: {
      plugins: [PrimeVue, router],
      stubs: {
        NuxtLink: defineComponent({
          props: {
            to: {
              type: [String, Object],
              required: true,
            },
          },
          setup(props, { slots }) {
            const router = useRouter()
            return () =>
              h(
                'a',
                {
                  href: props.to,
                  onClick: (e: MouseEvent) => {
                    e.preventDefault()
                    router.push(props.to as string)
                  },
                },
                slots.default ? slots.default() : []
              )
          },
        }),
      },
    },
    slots: options.slots,
  })
}

describe('Default Layout Header Suite', () => {
  beforeEach(async () => {
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
    const router = useRouter()
    await router.push('/')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authenticated state', () => {
    it('does not render v0.1.0-dev tag', async () => {
      const wrapper = mountLayout()
      await flushPromises()

      expect(wrapper.text()).not.toContain('v0.1.0-dev')
      expect(wrapper.find('.p-tag').exists()).toBe(false)
    })

    it('renders navigation within a PrimeVue Menubar component', async () => {
      const wrapper = mountLayout()
      await flushPromises()

      expect(wrapper.find('.p-menubar').exists()).toBe(true)
      expect(wrapper.find('nav').exists()).toBe(false)
    })

    it('renders static, non-clickable MeanTime brand in header', async () => {
      const wrapper = mountLayout()
      await flushPromises()

      const clockIcon = wrapper.find('.pi-clock')
      expect(clockIcon.exists()).toBe(true)
      expect(wrapper.text()).toContain('MeanTime')

      expect(clockIcon.element.closest('a')).toBeNull()
      expect(clockIcon.element.closest('button')).toBeNull()
    })

    it('renders boards navigation button when authenticated pointing to /', async () => {
      const wrapper = mountLayout()
      await flushPromises()

      const boardsLink = wrapper.find('[data-testid="boards-nav-link"]')
      expect(boardsLink.exists()).toBe(true)
      expect(boardsLink.attributes('href') || boardsLink.attributes('to')).toBe('/')
      expect(boardsLink.text()).toContain('Boards')
    })

    it('navigates to / when boards navigation button is clicked', async () => {
      const router = useRouter()
      await router.push('/friends')
      const wrapper = mountLayout()
      await flushPromises()

      const boardsLink = wrapper.find('[data-testid="boards-nav-link"]')
      expect(boardsLink.exists()).toBe(true)
      expect(boardsLink.attributes('href') || boardsLink.attributes('to')).toBe('/')

      await boardsLink.trigger('click')
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
    })

    it('displays active visual highlight on boards navigation button when route is / or /boards/*', async () => {
      const router = useRouter()
      await router.push('/')
      const wrapperRoot = mountLayout()
      await flushPromises()

      const rootBoardsLink = wrapperRoot.find('[data-testid="boards-nav-link"]')
      expect(rootBoardsLink.classes()).toContain('bg-surface-100')
      expect(rootBoardsLink.classes()).toContain('text-primary')

      await router.push('/boards/123')
      const wrapperBoard = mountLayout()
      await flushPromises()

      const boardLink = wrapperBoard.find('[data-testid="boards-nav-link"]')
      expect(boardLink.classes()).toContain('bg-surface-100')
      expect(boardLink.classes()).toContain('text-primary')

      await router.push('/friends')
      const wrapperFriends = mountLayout()
      await flushPromises()

      const inactiveBoardsLink = wrapperFriends.find('[data-testid="boards-nav-link"]')
      expect(inactiveBoardsLink.classes()).not.toContain('bg-surface-100')
      expect(inactiveBoardsLink.classes()).toContain('text-surface-700')
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

    it('displays active visual highlight on friends navigation link when route is /friends*', async () => {
      const router = useRouter()
      await router.push('/friends')
      const wrapper = mountLayout()
      await flushPromises()

      const activeFriendsLink = wrapper.find('[data-testid="friends-nav-link"]')
      expect(activeFriendsLink.classes()).toContain('bg-surface-100')
      expect(activeFriendsLink.classes()).toContain('text-primary')

      await router.push('/')
      const wrapperRoot = mountLayout()
      await flushPromises()

      const inactiveFriendsLink = wrapperRoot.find('[data-testid="friends-nav-link"]')
      expect(inactiveFriendsLink.classes()).not.toContain('bg-surface-100')
      expect(inactiveFriendsLink.classes()).toContain('text-surface-700')
    })

    it('renders profile button with user display name', async () => {
      const wrapper = mountLayout()
      await flushPromises()

      const button = wrapper.find('[data-testid="user-profile-button"]')
      expect(button.exists()).toBe(true)
      expect(button.text()).toContain('Alex Engineer')
    })

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

    it('orders header elements correctly: brand & nav cluster on left, profile and logout on right', async () => {
      const wrapper = mountLayout()
      await flushPromises()

      const header = wrapper.find('header')
      const brandIcon = header.find('.pi-clock').element
      const boardsLink = header.find('[data-testid="boards-nav-link"]').element
      const friendsLink = header.find('[data-testid="friends-nav-link"]').element
      const profileBtn = header.find('[data-testid="user-profile-button"]').element
      const logoutBtn = header.find('[data-testid="logout-button"]').element

      expect(brandIcon.compareDocumentPosition(boardsLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(boardsLink.compareDocumentPosition(friendsLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(friendsLink.compareDocumentPosition(profileBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(profileBtn.compareDocumentPosition(logoutBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

      const buttons = header.findAll('button')
      expect(buttons[buttons.length - 1].attributes('data-testid')).toBe('logout-button')
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
    it('does not render boards nav link when unauthenticated', async () => {
      mockAuthStore.isAuthenticated = false
      mockAuthStore.user = null as any

      const wrapper = mountLayout()
      await flushPromises()

      expect(wrapper.find('[data-testid="boards-nav-link"]').exists()).toBe(false)
    })

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

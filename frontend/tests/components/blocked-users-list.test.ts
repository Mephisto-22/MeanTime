import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it } from 'vitest'
import BlockedUsersList from '~/components/friends/BlockedUsersList.vue'
import type { UserOut } from '~/api/friends'

const mockBlockedUsers: UserOut[] = [
  {
    id: 1,
    display_name: 'Mallory Malicious',
    email: 'mallory@example.com',
    timezone: 'America/New_York',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    display_name: 'Eve',
    email: 'eve@example.com',
    timezone: 'UTC',
    created_at: '2026-01-02T00:00:00Z',
  },
]

function mountBlockedUsersList(props?: { blockedUsers?: UserOut[]; loading?: boolean }) {
  return mount(BlockedUsersList, {
    props,
    global: {
      plugins: [PrimeVue],
    },
  })
}

describe('BlockedUsersList Component Suite', () => {
  describe('Loading and Empty states', () => {
    it('renders skeleton loading when loading is true', () => {
      const wrapper = mountBlockedUsersList({ loading: true, blockedUsers: [] })

      expect(wrapper.find('[data-testid="blocked-users-loading-skeleton"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="blocked-users-empty-state"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-testid="blocked-user-card"]').length).toBe(0)
    })

    it('renders empty state "No blocked users" when blockedUsers list is empty and loading is false', () => {
      const wrapper = mountBlockedUsersList({ loading: false, blockedUsers: [] })

      expect(wrapper.find('[data-testid="blocked-users-loading-skeleton"]').exists()).toBe(false)
      const emptyState = wrapper.find('[data-testid="blocked-users-empty-state"]')
      expect(emptyState.exists()).toBe(true)
      expect(emptyState.text()).toContain('No blocked users')
      expect(wrapper.findAll('[data-testid="blocked-user-card"]').length).toBe(0)
    })

    it('defaults to empty state when no props are provided', () => {
      const wrapper = mountBlockedUsersList()

      expect(wrapper.find('[data-testid="blocked-users-loading-skeleton"]').exists()).toBe(false)
      const emptyState = wrapper.find('[data-testid="blocked-users-empty-state"]')
      expect(emptyState.exists()).toBe(true)
      expect(emptyState.text()).toContain('No blocked users')
    })
  })

  describe('Blocked users list rendering', () => {
    it('renders list of blocked users showing display name, email, and avatar initials', () => {
      const wrapper = mountBlockedUsersList({ loading: false, blockedUsers: mockBlockedUsers })

      const cards = wrapper.findAll('[data-testid="blocked-user-card"]')
      expect(cards.length).toBe(2)

      // First user: Mallory Malicious
      const firstCard = cards[0]
      expect(firstCard.find('[data-testid="blocked-user-name"]').text()).toBe('Mallory Malicious')
      expect(firstCard.find('[data-testid="blocked-user-email"]').text()).toBe('mallory@example.com')
      expect(firstCard.find('[data-testid="blocked-user-avatar"]').text()).toBe('MM')

      // Second user: Eve
      const secondCard = cards[1]
      expect(secondCard.find('[data-testid="blocked-user-name"]').text()).toBe('Eve')
      expect(secondCard.find('[data-testid="blocked-user-email"]').text()).toBe('eve@example.com')
      expect(secondCard.find('[data-testid="blocked-user-avatar"]').text()).toBe('E')
    })

    it('renders avatar initial from email when display_name is empty', () => {
      const userWithoutName: UserOut[] = [
        {
          id: 3,
          display_name: '',
          email: 'anonymous@example.com',
          timezone: 'UTC',
          created_at: '2026-01-03T00:00:00Z',
        },
      ]
      const wrapper = mountBlockedUsersList({ loading: false, blockedUsers: userWithoutName })

      const card = wrapper.find('[data-testid="blocked-user-card"]')
      expect(card.find('[data-testid="blocked-user-avatar"]').text()).toBe('A')
    })

    it('renders an Unblock action button for each blocked user', () => {
      const wrapper = mountBlockedUsersList({ loading: false, blockedUsers: mockBlockedUsers })

      const button1 = wrapper.find('[data-testid="unblock-button-1"]')
      expect(button1.exists()).toBe(true)
      expect(button1.text()).toBe('Unblock')

      const button2 = wrapper.find('[data-testid="unblock-button-2"]')
      expect(button2.exists()).toBe(true)
      expect(button2.text()).toBe('Unblock')
    })
  })

  describe('Unblock action flow', () => {
    it('clicking Unblock emits unblock with userId', async () => {
      const wrapper = mountBlockedUsersList({ loading: false, blockedUsers: mockBlockedUsers })

      const button1 = wrapper.find('[data-testid="unblock-button-1"]')
      await button1.trigger('click')

      expect(wrapper.emitted('unblock')).toBeTruthy()
      expect(wrapper.emitted('unblock')![0]).toEqual([1])
    })

    it('clicking Unblock for second user emits unblock with second userId', async () => {
      const wrapper = mountBlockedUsersList({ loading: false, blockedUsers: mockBlockedUsers })

      const button2 = wrapper.find('[data-testid="unblock-button-2"]')
      await button2.trigger('click')

      expect(wrapper.emitted('unblock')).toBeTruthy()
      expect(wrapper.emitted('unblock')![0]).toEqual([2])
    })
  })
})

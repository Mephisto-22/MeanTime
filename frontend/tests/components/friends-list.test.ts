import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it } from 'vitest'
import FriendsList from '~/components/friends/FriendsList.vue'
import type { UserOut } from '~/api/friends'

const DialogStub = {
  name: 'Dialog',
  props: ['visible', 'header'],
  template: `
    <div v-if="visible" class="p-dialog" :data-header="header">
      <slot />
      <slot name="footer" />
    </div>
  `,
}

const mockFriends: UserOut[] = [
  {
    id: 1,
    display_name: 'Alice Walker',
    email: 'alice@example.com',
    timezone: 'America/New_York',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    display_name: 'Bob',
    email: 'bob@example.com',
    timezone: 'UTC',
    created_at: '2026-01-02T00:00:00Z',
  },
]

function mountFriendsList(props: { friends?: UserOut[]; loading?: boolean } = {}) {
  return mount(FriendsList, {
    props: {
      friends: props.friends ?? [],
      loading: props.loading ?? false,
    },
    global: {
      plugins: [PrimeVue],
      stubs: {
        Dialog: DialogStub,
      },
    },
  })
}

describe('FriendsList Component Suite', () => {
  describe('Loading and Empty states', () => {
    it('renders skeleton loaders when loading is true', () => {
      const wrapper = mountFriendsList({ loading: true, friends: [] })

      expect(wrapper.find('[data-testid="friends-loading-skeleton"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="friends-empty-state"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-testid="friend-card"]').length).toBe(0)
    })

    it('renders empty state message when friends list is empty and not loading', () => {
      const wrapper = mountFriendsList({ loading: false, friends: [] })

      expect(wrapper.find('[data-testid="friends-loading-skeleton"]').exists()).toBe(false)
      const emptyState = wrapper.find('[data-testid="friends-empty-state"]')
      expect(emptyState.exists()).toBe(true)
      expect(emptyState.text()).toContain('No friends yet')
      expect(wrapper.findAll('[data-testid="friend-card"]').length).toBe(0)
    })
  })

  describe('Friends rendering', () => {
    it('renders friend cards displaying display_name, email, timezone, and avatar initials', () => {
      const wrapper = mountFriendsList({ loading: false, friends: mockFriends })

      const cards = wrapper.findAll('[data-testid="friend-card"]')
      expect(cards.length).toBe(2)

      // First friend: Alice Walker
      const firstCard = cards[0]
      expect(firstCard.find('[data-testid="friend-name"]').text()).toBe('Alice Walker')
      expect(firstCard.find('[data-testid="friend-email"]').text()).toBe('alice@example.com')
      expect(firstCard.find('[data-testid="friend-timezone"]').text()).toContain('America/New_York')
      expect(firstCard.find('[data-testid="friend-avatar"]').text()).toBe('AW')

      // Second friend: Bob
      const secondCard = cards[1]
      expect(secondCard.find('[data-testid="friend-name"]').text()).toBe('Bob')
      expect(secondCard.find('[data-testid="friend-email"]').text()).toBe('bob@example.com')
      expect(secondCard.find('[data-testid="friend-timezone"]').text()).toContain('UTC')
      expect(secondCard.find('[data-testid="friend-avatar"]').text()).toBe('B')
    })

    it('renders unfriend and block action buttons for each friend', () => {
      const wrapper = mountFriendsList({ loading: false, friends: mockFriends })

      expect(wrapper.find('[data-testid="unfriend-button-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="block-button-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="unfriend-button-2"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="block-button-2"]').exists()).toBe(true)
    })
  })

  describe('Unfriend confirmation and emit flow', () => {
    it('clicking Unfriend opens confirmation dialog, and cancel dismisses it without emitting', async () => {
      const wrapper = mountFriendsList({ loading: false, friends: mockFriends })

      expect(wrapper.find('[data-testid="unfriend-confirm-dialog"]').exists()).toBe(false)

      await wrapper.find('[data-testid="unfriend-button-1"]').trigger('click')
      expect(wrapper.find('[data-testid="unfriend-confirm-dialog"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="unfriend-confirm-dialog"]').text()).toContain('Alice Walker')

      await wrapper.find('[data-testid="cancel-unfriend-button"]').trigger('click')
      expect(wrapper.find('[data-testid="unfriend-confirm-dialog"]').exists()).toBe(false)
      expect(wrapper.emitted('unfriend')).toBeFalsy()
    })

    it('confirming Unfriend emits unfriend event with userId and closes dialog', async () => {
      const wrapper = mountFriendsList({ loading: false, friends: mockFriends })

      await wrapper.find('[data-testid="unfriend-button-1"]').trigger('click')
      expect(wrapper.find('[data-testid="unfriend-confirm-dialog"]').exists()).toBe(true)

      await wrapper.find('[data-testid="confirm-unfriend-button"]').trigger('click')
      expect(wrapper.emitted('unfriend')).toBeTruthy()
      expect(wrapper.emitted('unfriend')![0]).toEqual([1])
      expect(wrapper.find('[data-testid="unfriend-confirm-dialog"]').exists()).toBe(false)
    })
  })

  describe('Block confirmation and emit flow', () => {
    it('clicking Block opens confirmation dialog, and cancel dismisses it without emitting', async () => {
      const wrapper = mountFriendsList({ loading: false, friends: mockFriends })

      expect(wrapper.find('[data-testid="block-confirm-dialog"]').exists()).toBe(false)

      await wrapper.find('[data-testid="block-button-2"]').trigger('click')
      expect(wrapper.find('[data-testid="block-confirm-dialog"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="block-confirm-dialog"]').text()).toContain('Bob')

      await wrapper.find('[data-testid="cancel-block-button"]').trigger('click')
      expect(wrapper.find('[data-testid="block-confirm-dialog"]').exists()).toBe(false)
      expect(wrapper.emitted('block')).toBeFalsy()
    })

    it('confirming Block emits block event with userId and closes dialog', async () => {
      const wrapper = mountFriendsList({ loading: false, friends: mockFriends })

      await wrapper.find('[data-testid="block-button-2"]').trigger('click')
      expect(wrapper.find('[data-testid="block-confirm-dialog"]').exists()).toBe(true)

      await wrapper.find('[data-testid="confirm-block-button"]').trigger('click')
      expect(wrapper.emitted('block')).toBeTruthy()
      expect(wrapper.emitted('block')![0]).toEqual([2])
      expect(wrapper.find('[data-testid="block-confirm-dialog"]').exists()).toBe(false)
    })
  })
})

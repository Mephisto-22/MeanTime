import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it } from 'vitest'
import FriendRequestsList from '~/components/friends/FriendRequestsList.vue'
import type { FriendRequestOut } from '~/api/friends'

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

const mockIncoming: FriendRequestOut[] = [
  {
    id: 101,
    user: {
      id: 11,
      display_name: 'Charlie Brown',
      email: 'charlie@example.com',
      timezone: 'America/Chicago',
      created_at: '2026-01-01T00:00:00Z',
    },
    created_at: '2026-02-01T10:00:00Z',
  },
  {
    id: 102,
    user: {
      id: 12,
      display_name: 'Diana Prince',
      email: 'diana@example.com',
      timezone: 'Europe/London',
      created_at: '2026-01-02T00:00:00Z',
    },
    created_at: '2026-02-02T15:30:00Z',
  },
]

const mockOutgoing: FriendRequestOut[] = [
  {
    id: 201,
    user: {
      id: 21,
      display_name: 'Evan Wright',
      email: 'evan@example.com',
      timezone: 'America/Los_Angeles',
      created_at: '2026-01-03T00:00:00Z',
    },
    created_at: '2026-02-03T12:00:00Z',
  },
]

function mountFriendRequestsList(
  props: {
    incoming?: FriendRequestOut[]
    outgoing?: FriendRequestOut[]
    loading?: boolean
  } = {}
) {
  return mount(FriendRequestsList, {
    props: {
      incoming: props.incoming ?? [],
      outgoing: props.outgoing ?? [],
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

describe('FriendRequestsList Component Suite', () => {
  describe('Loading and Empty states', () => {
    it('renders skeleton loaders when loading is true', () => {
      const wrapper = mountFriendRequestsList({
        loading: true,
        incoming: [],
        outgoing: [],
      })

      expect(wrapper.find('[data-testid="requests-loading-skeleton"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="requests-empty-state"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-testid="incoming-request-card"]').length).toBe(0)
      expect(wrapper.findAll('[data-testid="outgoing-request-card"]').length).toBe(0)
    })

    it('renders empty state when both incoming and outgoing are empty and loading is false', () => {
      const wrapper = mountFriendRequestsList({
        loading: false,
        incoming: [],
        outgoing: [],
      })

      expect(wrapper.find('[data-testid="requests-loading-skeleton"]').exists()).toBe(false)
      const emptyState = wrapper.find('[data-testid="requests-empty-state"]')
      expect(emptyState.exists()).toBe(true)
      expect(emptyState.text()).toContain('No pending friend requests')
    })
  })

  describe('Incoming Requests Section', () => {
    it('renders incoming requests section with user info, avatar initials, and formatted date', () => {
      const wrapper = mountFriendRequestsList({
        loading: false,
        incoming: mockIncoming,
        outgoing: [],
      })

      const section = wrapper.find('[data-testid="incoming-requests-section"]')
      expect(section.exists()).toBe(true)

      const cards = wrapper.findAll('[data-testid="incoming-request-card"]')
      expect(cards.length).toBe(2)

      // First incoming: Charlie Brown
      const first = cards[0]
      expect(first.find('[data-testid="incoming-user-name"]').text()).toBe('Charlie Brown')
      expect(first.find('[data-testid="incoming-user-email"]').text()).toBe('charlie@example.com')
      expect(first.find('[data-testid="incoming-user-timezone"]').text()).toContain('America/Chicago')
      expect(first.find('[data-testid="incoming-user-avatar"]').text()).toBe('CB')
      expect(first.find('[data-testid="incoming-request-date"]').text()).toBeTruthy()

      // Second incoming: Diana Prince
      const second = cards[1]
      expect(second.find('[data-testid="incoming-user-name"]').text()).toBe('Diana Prince')
      expect(second.find('[data-testid="incoming-user-email"]').text()).toBe('diana@example.com')
      expect(second.find('[data-testid="incoming-user-timezone"]').text()).toContain('Europe/London')
      expect(second.find('[data-testid="incoming-user-avatar"]').text()).toBe('DP')
    })

    it('renders Accept, Decline, and Block buttons for each incoming request', () => {
      const wrapper = mountFriendRequestsList({
        loading: false,
        incoming: mockIncoming,
      })

      expect(wrapper.find('[data-testid="accept-request-button-11"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="decline-request-button-11"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="block-request-button-11"]').exists()).toBe(true)

      expect(wrapper.find('[data-testid="accept-request-button-12"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="decline-request-button-12"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="block-request-button-12"]').exists()).toBe(true)
    })

    it('clicking Accept emits accept event with requester userId', async () => {
      const wrapper = mountFriendRequestsList({
        loading: false,
        incoming: mockIncoming,
      })

      await wrapper.find('[data-testid="accept-request-button-11"]').trigger('click')
      expect(wrapper.emitted('accept')).toBeTruthy()
      expect(wrapper.emitted('accept')![0]).toEqual([11])
    })

    it('clicking Decline emits decline event with requester userId', async () => {
      const wrapper = mountFriendRequestsList({
        loading: false,
        incoming: mockIncoming,
      })

      await wrapper.find('[data-testid="decline-request-button-11"]').trigger('click')
      expect(wrapper.emitted('decline')).toBeTruthy()
      expect(wrapper.emitted('decline')![0]).toEqual([11])
    })

    it('clicking Block opens confirmation dialog, and cancel dismisses it without emitting', async () => {
      const wrapper = mountFriendRequestsList({
        loading: false,
        incoming: mockIncoming,
      })

      expect(wrapper.find('[data-testid="block-confirm-dialog"]').exists()).toBe(false)

      await wrapper.find('[data-testid="block-request-button-11"]').trigger('click')
      expect(wrapper.find('[data-testid="block-confirm-dialog"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="block-confirm-dialog"]').text()).toContain('Charlie Brown')

      await wrapper.find('[data-testid="cancel-block-button"]').trigger('click')
      expect(wrapper.find('[data-testid="block-confirm-dialog"]').exists()).toBe(false)
      expect(wrapper.emitted('block')).toBeFalsy()
    })

    it('confirming Block emits block event with requester userId and closes dialog', async () => {
      const wrapper = mountFriendRequestsList({
        loading: false,
        incoming: mockIncoming,
      })

      await wrapper.find('[data-testid="block-request-button-11"]').trigger('click')
      expect(wrapper.find('[data-testid="block-confirm-dialog"]').exists()).toBe(true)

      await wrapper.find('[data-testid="confirm-block-button"]').trigger('click')
      expect(wrapper.emitted('block')).toBeTruthy()
      expect(wrapper.emitted('block')![0]).toEqual([11])
      expect(wrapper.find('[data-testid="block-confirm-dialog"]').exists()).toBe(false)
    })
  })

  describe('Outgoing Requests Section', () => {
    it('renders outgoing requests section with user info, avatar initials, and formatted date', () => {
      const wrapper = mountFriendRequestsList({
        loading: false,
        incoming: [],
        outgoing: mockOutgoing,
      })

      const section = wrapper.find('[data-testid="outgoing-requests-section"]')
      expect(section.exists()).toBe(true)

      const cards = wrapper.findAll('[data-testid="outgoing-request-card"]')
      expect(cards.length).toBe(1)

      const first = cards[0]
      expect(first.find('[data-testid="outgoing-user-name"]').text()).toBe('Evan Wright')
      expect(first.find('[data-testid="outgoing-user-email"]').text()).toBe('evan@example.com')
      expect(first.find('[data-testid="outgoing-user-timezone"]').text()).toContain('America/Los_Angeles')
      expect(first.find('[data-testid="outgoing-user-avatar"]').text()).toBe('EW')
      expect(first.find('[data-testid="outgoing-request-date"]').text()).toBeTruthy()
    })

    it('renders Cancel Request button and clicking it emits cancel with recipient userId', async () => {
      const wrapper = mountFriendRequestsList({
        loading: false,
        outgoing: mockOutgoing,
      })

      const cancelBtn = wrapper.find('[data-testid="cancel-request-button-21"]')
      expect(cancelBtn.exists()).toBe(true)

      await cancelBtn.trigger('click')
      expect(wrapper.emitted('cancel')).toBeTruthy()
      expect(wrapper.emitted('cancel')![0]).toEqual([21])
    })
  })
})

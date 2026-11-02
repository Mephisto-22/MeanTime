import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FriendsPage from '~/pages/friends.vue'
import FriendsList from '~/components/friends/FriendsList.vue'
import FriendRequestsList from '~/components/friends/FriendRequestsList.vue'
import UserSearch from '~/components/friends/UserSearch.vue'
import BlockedUsersList from '~/components/friends/BlockedUsersList.vue'
import {
  friendsApi,
  type FriendRequestsListOut,
  type FriendRequestOut,
  type UserOut,
} from '~/api/friends'

const mockToast = {
  add: vi.fn(),
  remove: vi.fn(),
}

vi.mock('primevue/usetoast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('primevue/usetoast')>()
  return {
    ...actual,
    useToast: () => mockToast,
  }
})

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

const mockRequests: FriendRequestsListOut = {
  incoming: [
    {
      id: 101,
      user: {
        id: 3,
        display_name: 'Charlie Chaplin',
        email: 'charlie@example.com',
        timezone: 'Europe/London',
        created_at: '2026-01-03T00:00:00Z',
      },
      created_at: '2026-02-01T10:00:00Z',
    },
  ],
  outgoing: [
    {
      id: 102,
      user: {
        id: 4,
        display_name: 'Dana Scully',
        email: 'dana@example.com',
        timezone: 'America/Chicago',
        created_at: '2026-01-04T00:00:00Z',
      },
      created_at: '2026-02-02T12:00:00Z',
    },
  ],
}

const mockBlocked: UserOut[] = [
  {
    id: 5,
    display_name: 'Eve Evil',
    email: 'eve@example.com',
    timezone: 'UTC',
    created_at: '2026-01-05T00:00:00Z',
  },
]

let wrappers: VueWrapper[] = []

async function mountPage() {
  const wrapper = await mountSuspended(FriendsPage, {
    route: '/friends',
    global: {
      plugins: [PrimeVue, ToastService],
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('Friends Page (/friends)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockToast.add.mockClear()
    mockToast.remove.mockClear()

    vi.spyOn(friendsApi, 'getFriends').mockResolvedValue([...mockFriends])
    vi.spyOn(friendsApi, 'getRequests').mockResolvedValue({
      incoming: [...mockRequests.incoming],
      outgoing: [...mockRequests.outgoing],
    })
    vi.spyOn(friendsApi, 'getBlocked').mockResolvedValue([...mockBlocked])
  })

  afterEach(() => {
    for (const wrapper of wrappers) {
      wrapper.unmount()
    }
    wrappers = []
    vi.restoreAllMocks()
  })

  describe('Initial Data Loading & Tabs Rendering', () => {
    it('calls getFriends, getRequests, and getBlocked on mount and passes data to child components', async () => {
      const wrapper = await mountPage()

      expect(friendsApi.getFriends).toHaveBeenCalledTimes(1)
      expect(friendsApi.getRequests).toHaveBeenCalledTimes(1)
      expect(friendsApi.getBlocked).toHaveBeenCalledTimes(1)

      const friendsList = wrapper.findComponent(FriendsList)
      expect(friendsList.exists()).toBe(true)
      expect(friendsList.props('friends')).toEqual(mockFriends)
      expect(friendsList.props('loading')).toBe(false)

      const requestsList = wrapper.findComponent(FriendRequestsList)
      expect(requestsList.exists()).toBe(true)
      expect(requestsList.props('incoming')).toEqual(mockRequests.incoming)
      expect(requestsList.props('outgoing')).toEqual(mockRequests.outgoing)
      expect(requestsList.props('loading')).toBe(false)

      const blockedList = wrapper.findComponent(BlockedUsersList)
      expect(blockedList.exists()).toBe(true)
      expect(blockedList.props('blockedUsers')).toEqual(mockBlocked)
      expect(blockedList.props('loading')).toBe(false)

      const userSearch = wrapper.findComponent(UserSearch)
      expect(userSearch.exists()).toBe(true)
    })

    it('renders PrimeVue Tabs with 4 tabs and count badges', async () => {
      const wrapper = await mountPage()

      // Tabs container
      expect(wrapper.find('[data-testid="friends-tabs"]').exists()).toBe(true)

      // 4 Tabs: Friends, Requests, Add Friend, Blocked
      const friendsTab = wrapper.find('[data-testid="tab-friends"]')
      expect(friendsTab.exists()).toBe(true)
      expect(friendsTab.text()).toContain('Friends')
      expect(wrapper.find('[data-testid="friends-count-badge"]').text()).toBe('2')

      const requestsTab = wrapper.find('[data-testid="tab-requests"]')
      expect(requestsTab.exists()).toBe(true)
      expect(requestsTab.text()).toContain('Requests')
      expect(wrapper.find('[data-testid="incoming-requests-badge"]').text()).toBe('1')

      const addTab = wrapper.find('[data-testid="tab-search"]')
      expect(addTab.exists()).toBe(true)
      expect(addTab.text()).toContain('Add Friend')

      const blockedTab = wrapper.find('[data-testid="tab-blocked"]')
      expect(blockedTab.exists()).toBe(true)
      expect(blockedTab.text()).toContain('Blocked')
      expect(wrapper.find('[data-testid="blocked-count-badge"]').text()).toBe('1')
    })

    it('triggers error toast when initial data loading fails', async () => {
      vi.spyOn(friendsApi, 'getFriends').mockRejectedValue(new Error('Network Error'))

      await mountPage()

      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          summary: 'Error',
        }),
      )
    })
  })

  describe('Unfriend Flow', () => {
    it('handles unfriend: calls friendsApi.unfriend, removes from friends array, triggers toast', async () => {
      const unfriendSpy = vi.spyOn(friendsApi, 'unfriend').mockResolvedValue()
      const wrapper = await mountPage()

      const friendsList = wrapper.findComponent(FriendsList)
      expect(friendsList.props('friends').length).toBe(2)

      // Emit unfriend event for user id 1
      await friendsList.vm.$emit('unfriend', 1)
      await flushPromises()

      expect(unfriendSpy).toHaveBeenCalledWith(1)
      expect(friendsList.props('friends')).toEqual([mockFriends[1]])
      expect(wrapper.find('[data-testid="friends-count-badge"]').text()).toBe('1')
      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'success',
        }),
      )
    })

    it('shows error toast when unfriend fails', async () => {
      vi.spyOn(friendsApi, 'unfriend').mockRejectedValue(new Error('Failed to unfriend'))
      const wrapper = await mountPage()

      const friendsList = wrapper.findComponent(FriendsList)
      await friendsList.vm.$emit('unfriend', 1)
      await flushPromises()

      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'Failed to unfriend',
        }),
      )
      // Friends list remains unchanged
      expect(friendsList.props('friends').length).toBe(2)
    })
  })

  describe('Block Flow', () => {
    it('handles block from friends list: calls friendsApi.blockUser, removes from friends, adds to blocked, triggers toast', async () => {
      const blockSpy = vi.spyOn(friendsApi, 'blockUser').mockResolvedValue()
      const wrapper = await mountPage()

      const friendsList = wrapper.findComponent(FriendsList)
      const blockedList = wrapper.findComponent(BlockedUsersList)

      expect(friendsList.props('friends').length).toBe(2)
      expect(blockedList.props('blockedUsers').length).toBe(1)

      // Emit block event for Alice (id 1)
      await friendsList.vm.$emit('block', 1)
      await flushPromises()

      expect(blockSpy).toHaveBeenCalledWith(1)
      expect(friendsList.props('friends')).toEqual([mockFriends[1]])
      expect(blockedList.props('blockedUsers')).toContainEqual(mockFriends[0])
      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'success',
        }),
      )
    })

    it('handles block from requests list: calls friendsApi.blockUser, removes from requests, adds to blocked, triggers toast', async () => {
      const blockSpy = vi.spyOn(friendsApi, 'blockUser').mockResolvedValue()
      const wrapper = await mountPage()

      const requestsList = wrapper.findComponent(FriendRequestsList)
      const blockedList = wrapper.findComponent(BlockedUsersList)

      expect(requestsList.props('incoming').length).toBe(1)

      // Emit block event for Charlie (id 3)
      await requestsList.vm.$emit('block', 3)
      await flushPromises()

      expect(blockSpy).toHaveBeenCalledWith(3)
      expect(requestsList.props('incoming').length).toBe(0)
      expect(blockedList.props('blockedUsers')).toContainEqual(mockRequests.incoming[0].user)
      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'success',
        }),
      )
    })

    it('shows error toast when block fails', async () => {
      vi.spyOn(friendsApi, 'blockUser').mockRejectedValue(new Error('Failed to block'))
      const wrapper = await mountPage()

      const friendsList = wrapper.findComponent(FriendsList)
      await friendsList.vm.$emit('block', 1)
      await flushPromises()

      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'Failed to block',
        }),
      )
      expect(friendsList.props('friends').length).toBe(2)
    })
  })

  describe('Accept Friend Request Flow', () => {
    it('handles accept: calls friendsApi.acceptRequest, removes from incoming, adds to friends, triggers toast', async () => {
      const acceptSpy = vi.spyOn(friendsApi, 'acceptRequest').mockResolvedValue()
      const wrapper = await mountPage()

      const requestsList = wrapper.findComponent(FriendRequestsList)
      const friendsList = wrapper.findComponent(FriendsList)

      expect(requestsList.props('incoming').length).toBe(1)
      expect(friendsList.props('friends').length).toBe(2)

      // Emit accept for Charlie (id 3)
      await requestsList.vm.$emit('accept', 3)
      await flushPromises()

      expect(acceptSpy).toHaveBeenCalledWith(3)
      expect(requestsList.props('incoming').length).toBe(0)
      expect(friendsList.props('friends')).toContainEqual(mockRequests.incoming[0].user)
      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'success',
        }),
      )
    })

    it('shows error toast when accept fails', async () => {
      vi.spyOn(friendsApi, 'acceptRequest').mockRejectedValue(new Error('Failed to accept'))
      const wrapper = await mountPage()

      const requestsList = wrapper.findComponent(FriendRequestsList)
      await requestsList.vm.$emit('accept', 3)
      await flushPromises()

      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'Failed to accept',
        }),
      )
      expect(requestsList.props('incoming').length).toBe(1)
    })
  })

  describe('Decline Friend Request Flow', () => {
    it('handles decline: calls friendsApi.declineRequest, removes from incoming, triggers toast', async () => {
      const declineSpy = vi.spyOn(friendsApi, 'declineRequest').mockResolvedValue()
      const wrapper = await mountPage()

      const requestsList = wrapper.findComponent(FriendRequestsList)
      expect(requestsList.props('incoming').length).toBe(1)

      // Emit decline for Charlie (id 3)
      await requestsList.vm.$emit('decline', 3)
      await flushPromises()

      expect(declineSpy).toHaveBeenCalledWith(3)
      expect(requestsList.props('incoming').length).toBe(0)
      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'success',
        }),
      )
    })

    it('shows error toast when decline fails', async () => {
      vi.spyOn(friendsApi, 'declineRequest').mockRejectedValue(new Error('Failed to decline'))
      const wrapper = await mountPage()

      const requestsList = wrapper.findComponent(FriendRequestsList)
      await requestsList.vm.$emit('decline', 3)
      await flushPromises()

      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'Failed to decline',
        }),
      )
      expect(requestsList.props('incoming').length).toBe(1)
    })
  })

  describe('Cancel Outgoing Request Flow', () => {
    it('handles cancel: calls friendsApi.cancelRequest, removes from outgoing, triggers toast', async () => {
      const cancelSpy = vi.spyOn(friendsApi, 'cancelRequest').mockResolvedValue()
      const wrapper = await mountPage()

      const requestsList = wrapper.findComponent(FriendRequestsList)
      expect(requestsList.props('outgoing').length).toBe(1)

      // Emit cancel for Dana (id 4)
      await requestsList.vm.$emit('cancel', 4)
      await flushPromises()

      expect(cancelSpy).toHaveBeenCalledWith(4)
      expect(requestsList.props('outgoing').length).toBe(0)
      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'success',
        }),
      )
    })

    it('shows error toast when cancel fails', async () => {
      vi.spyOn(friendsApi, 'cancelRequest').mockRejectedValue(new Error('Failed to cancel'))
      const wrapper = await mountPage()

      const requestsList = wrapper.findComponent(FriendRequestsList)
      await requestsList.vm.$emit('cancel', 4)
      await flushPromises()

      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'Failed to cancel',
        }),
      )
      expect(requestsList.props('outgoing').length).toBe(1)
    })
  })

  describe('Unblock User Flow', () => {
    it('handles unblock: calls friendsApi.unblockUser, removes from blocked array, triggers toast', async () => {
      const unblockSpy = vi.spyOn(friendsApi, 'unblockUser').mockResolvedValue()
      const wrapper = await mountPage()

      const blockedList = wrapper.findComponent(BlockedUsersList)
      expect(blockedList.props('blockedUsers').length).toBe(1)

      // Emit unblock for Eve (id 5)
      await blockedList.vm.$emit('unblock', 5)
      await flushPromises()

      expect(unblockSpy).toHaveBeenCalledWith(5)
      expect(blockedList.props('blockedUsers').length).toBe(0)
      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'success',
        }),
      )
    })

    it('shows error toast when unblock fails', async () => {
      vi.spyOn(friendsApi, 'unblockUser').mockRejectedValue(new Error('Failed to unblock'))
      const wrapper = await mountPage()

      const blockedList = wrapper.findComponent(BlockedUsersList)
      await blockedList.vm.$emit('unblock', 5)
      await flushPromises()

      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'Failed to unblock',
        }),
      )
      expect(blockedList.props('blockedUsers').length).toBe(1)
    })
  })

  describe('UserSearch Tab Event Forwarding', () => {
    it('handles send-request from UserSearch: calls sendRequest, adds to outgoing requests, triggers toast', async () => {
      const newRequest: FriendRequestOut = {
        id: 103,
        user: {
          id: 6,
          display_name: 'Frank Ocean',
          email: 'frank@example.com',
          timezone: 'America/Los_Angeles',
          created_at: '2026-01-06T00:00:00Z',
        },
        created_at: '2026-02-03T00:00:00Z',
      }
      const sendSpy = vi.spyOn(friendsApi, 'sendRequest').mockResolvedValue(newRequest)
      const wrapper = await mountPage()

      const userSearch = wrapper.findComponent(UserSearch)
      const requestsList = wrapper.findComponent(FriendRequestsList)

      expect(requestsList.props('outgoing').length).toBe(1)

      await userSearch.vm.$emit('send-request', 6)
      await flushPromises()

      expect(sendSpy).toHaveBeenCalledWith(6)
      expect(requestsList.props('outgoing')).toContainEqual(newRequest)
      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'success',
        }),
      )
    })

    it('shows error toast when sendRequest from UserSearch fails', async () => {
      vi.spyOn(friendsApi, 'sendRequest').mockRejectedValue(new Error('Failed to send request'))
      const wrapper = await mountPage()

      const userSearch = wrapper.findComponent(UserSearch)
      await userSearch.vm.$emit('send-request', 6)
      await flushPromises()

      expect(mockToast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'Failed to send request',
        }),
      )
    })
  })
})

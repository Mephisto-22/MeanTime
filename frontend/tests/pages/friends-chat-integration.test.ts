import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FriendsPage from '~/pages/friends.vue'
import FriendsList from '~/components/friends/FriendsList.vue'
import ChatSidebar from '~/components/chat/ChatSidebar.vue'
import { friendsApi, type UserOut, type FriendRequestsListOut } from '~/api/friends'
import { chatApi, type ConversationListResponse } from '~/api/chat'
import { useChatStore } from '~/stores/chat'

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
    display_name: 'Bob Ross',
    email: 'bob@example.com',
    timezone: 'UTC',
    created_at: '2026-01-02T00:00:00Z',
  },
]

const mockRequests: FriendRequestsListOut = {
  incoming: [],
  outgoing: [],
}

const mockConversationsResponse: ConversationListResponse = {
  conversations: [
    {
      id: 101,
      type: 'DIRECT',
      title: 'Direct Chat',
      updated_at: '2026-11-10T12:00:00Z',
      other_participants: [
        {
          id: 1,
          user_id: 1,
          display_name: 'Alice Walker',
          email: 'alice@example.com',
          status: 'ACCEPTED',
        },
      ],
      last_message: {
        content: 'Hey there!',
        sender_name: 'Alice Walker',
        created_at: '2026-11-10T12:00:00Z',
      },
      unread_count: 1,
    },
  ],
  pending_invites: [],
}

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

describe('Friends Page & Chat Integration Suite', () => {
  let chatStore: ReturnType<typeof useChatStore>

  beforeEach(() => {
    vi.restoreAllMocks()
    mockToast.add.mockClear()
    mockToast.remove.mockClear()

    vi.spyOn(friendsApi, 'getFriends').mockResolvedValue([...mockFriends])
    vi.spyOn(friendsApi, 'getRequests').mockResolvedValue({
      incoming: [...mockRequests.incoming],
      outgoing: [...mockRequests.outgoing],
    })
    vi.spyOn(friendsApi, 'getBlocked').mockResolvedValue([])
    vi.spyOn(chatApi, 'getConversations').mockResolvedValue({ ...mockConversationsResponse })

    chatStore = useChatStore()
  })

  afterEach(() => {
    for (const wrapper of wrappers) {
      wrapper.unmount()
    }
    wrappers = []
    vi.restoreAllMocks()
  })

  it('mounts ChatSidebar and passes friends list to it', async () => {
    const wrapper = await mountPage()

    const sidebar = wrapper.findComponent(ChatSidebar)
    expect(sidebar.exists()).toBe(true)
    expect(sidebar.props('friends')).toEqual(mockFriends)
  })

  it('loads chat conversations on page load to initialize badges and invites', async () => {
    const loadSpy = vi.spyOn(chatStore, 'loadConversations')

    await mountPage()

    expect(loadSpy).toHaveBeenCalled()
  })

  it('renders Chat buttons on friend cards in FriendsList', async () => {
    const wrapper = await mountPage()

    const friendsList = wrapper.findComponent(FriendsList)
    expect(friendsList.exists()).toBe(true)

    const chatBtn1 = wrapper.find('[data-testid="chat-button-1"]')
    expect(chatBtn1.exists()).toBe(true)
    expect(chatBtn1.text()).toContain('Chat')

    const chatBtn2 = wrapper.find('[data-testid="chat-button-2"]')
    expect(chatBtn2.exists()).toBe(true)
    expect(chatBtn2.text()).toContain('Chat')
  })

  it('clicking Chat button on a friend card calls chatStore.openDirectChat with friend ID', async () => {
    const openChatSpy = vi.spyOn(chatStore, 'openDirectChat').mockResolvedValue(undefined)
    const wrapper = await mountPage()

    const chatBtn1 = wrapper.find('[data-testid="chat-button-1"]')
    await chatBtn1.trigger('click')
    await flushPromises()

    expect(openChatSpy).toHaveBeenCalledWith(1)
  })

  it('handles error gracefully when openDirectChat fails', async () => {
    vi.spyOn(chatStore, 'openDirectChat').mockRejectedValue(new Error('Failed to open chat'))
    const wrapper = await mountPage()

    const chatBtn2 = wrapper.find('[data-testid="chat-button-2"]')
    await chatBtn2.trigger('click')
    await flushPromises()

    expect(mockToast.add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
      }),
    )
  })

  it('closes chat sidebar and cleans up polling when page is unmounted', async () => {
    const closeSpy = vi.spyOn(chatStore, 'closeSidebar')
    const wrapper = await mountPage()

    wrapper.unmount()
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})

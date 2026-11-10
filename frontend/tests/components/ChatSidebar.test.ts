import { mount, flushPromises } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatSidebar from '~/components/chat/ChatSidebar.vue'
import CreateChatDialog from '~/components/chat/CreateChatDialog.vue'
import { useChatStore } from '~/stores/chat'
import { useAuthStore } from '~/stores/auth'
import type { UserOut } from '~/api/friends'
import type { ConversationDetailOut, ConversationOut, MessageOut, PendingInviteOut } from '~/api/chat'

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

const DrawerStub = {
  name: 'Drawer',
  props: ['visible', 'position'],
  template: `
    <div v-if="visible" class="p-drawer" :data-position="position">
      <slot name="header" />
      <slot />
      <slot name="footer" />
    </div>
  `,
}

const ScrollPanelStub = {
  name: 'ScrollPanel',
  template: '<div class="p-scrollpanel"><slot /></div>',
}

const mockFriends: UserOut[] = [
  {
    id: 10,
    email: 'bob@example.com',
    display_name: 'Bob Ross',
    timezone: 'UTC',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 11,
    email: 'charlie@example.com',
    display_name: 'Charlie Brown',
    timezone: 'UTC',
    created_at: '2026-01-01T00:00:00Z',
  },
]

const mockConversations: ConversationOut[] = [
  {
    id: 101,
    type: 'DIRECT',
    title: 'Direct Chat',
    updated_at: '2026-11-10T12:00:00Z',
    other_participants: [
      {
        id: 1,
        user_id: 10,
        display_name: 'Bob Ross',
        email: 'bob@example.com',
        status: 'ACCEPTED',
      },
    ],
    last_message: {
      content: 'Hello Bob!',
      sender_name: 'Bob Ross',
      created_at: '2026-11-10T12:00:00Z',
    },
    unread_count: 2,
  },
  {
    id: 102,
    type: 'GROUP',
    title: 'Weekend Crew',
    updated_at: '2026-11-10T12:30:00Z',
    other_participants: [
      {
        id: 2,
        user_id: 10,
        display_name: 'Bob Ross',
        email: 'bob@example.com',
        status: 'ACCEPTED',
      },
      {
        id: 3,
        user_id: 11,
        display_name: 'Charlie Brown',
        email: 'charlie@example.com',
        status: 'ACCEPTED',
      },
    ],
    last_message: null,
    unread_count: 0,
  },
]

const mockPendingInvites: PendingInviteOut[] = [
  {
    id: 201,
    conversation_id: 103,
    conversation_type: 'GROUP',
    conversation_title: 'Secret Project',
    invited_by_name: 'Alice Wonder',
    created_at: '2026-11-10T11:00:00Z',
  },
]

const mockActiveConversation: ConversationDetailOut = {
  id: 101,
  type: 'DIRECT',
  title: 'Direct Chat',
  created_at: '2026-11-10T10:00:00Z',
  updated_at: '2026-11-10T12:00:00Z',
  is_active: true,
  participants: [
    {
      id: 99,
      user_id: 1,
      display_name: 'Current User',
      email: 'me@example.com',
      status: 'ACCEPTED',
    },
    {
      id: 1,
      user_id: 10,
      display_name: 'Bob Ross',
      email: 'bob@example.com',
      status: 'ACCEPTED',
    },
  ],
}

const mockMessages: MessageOut[] = [
  {
    id: 1,
    conversation_id: 101,
    sender_id: 10,
    sender_name: 'Bob Ross',
    content: 'Hi there!',
    created_at: '2026-11-10T12:00:00Z',
  },
  {
    id: 2,
    conversation_id: 101,
    sender_id: 1,
    sender_name: 'Current User',
    content: 'Hey Bob, what is up?',
    created_at: '2026-11-10T12:01:00Z',
  },
]

function mountChatSidebar(props: { friends?: UserOut[] } = {}) {
  return mount(ChatSidebar, {
    props: {
      friends: props.friends ?? mockFriends,
    },
    global: {
      plugins: [PrimeVue, ToastService],
      stubs: {
        Drawer: DrawerStub,
        Dialog: DialogStub,
        ScrollPanel: ScrollPanelStub,
      },
    },
  })
}

describe('ChatSidebar Component Suite', () => {
  let chatStore: ReturnType<typeof useChatStore>
  let authStore: ReturnType<typeof useAuthStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    chatStore = useChatStore()
    authStore = useAuthStore()
    authStore.user = {
      id: 1,
      email: 'me@example.com',
      display_name: 'Current User',
      timezone: 'UTC',
      created_at: '2026-01-01T00:00:00Z',
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Minimized Dock State', () => {
    it('renders dock button when minimized with correct badge count', () => {
      chatStore.isSidebarOpen = false
      chatStore.conversations = [...mockConversations]
      chatStore.pendingInvites = [...mockPendingInvites]

      const wrapper = mountChatSidebar()

      const dockBtn = wrapper.find('[data-testid="chat-dock-button"]')
      expect(dockBtn.exists()).toBe(true)
      expect(dockBtn.text()).toContain('Chat')

      const badge = wrapper.find('[data-testid="chat-dock-badge"]')
      expect(badge.exists()).toBe(true)
      // 2 unread + 1 invite = 3
      expect(badge.text()).toBe('3')
    })

    it('clicking dock button calls chatStore.openSidebar()', async () => {
      chatStore.isSidebarOpen = false
      const openSpy = vi.spyOn(chatStore, 'openSidebar')

      const wrapper = mountChatSidebar()
      const dockBtn = wrapper.find('[data-testid="chat-dock-button"]')
      await dockBtn.trigger('click')

      expect(openSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('Roster & Invites View (activeConversationId === null)', () => {
    beforeEach(() => {
      chatStore.isSidebarOpen = true
      chatStore.activeConversationId = null
    })

    it('renders pending invite cards with Accept and Decline buttons and dispatches actions', async () => {
      chatStore.pendingInvites = [...mockPendingInvites]
      const acceptSpy = vi.spyOn(chatStore, 'acceptInvite').mockResolvedValue(undefined)
      const declineSpy = vi.spyOn(chatStore, 'declineInvite').mockResolvedValue(undefined)

      const wrapper = mountChatSidebar()

      const inviteItem = wrapper.find('[data-testid="pending-invite-201"]')
      expect(inviteItem.exists()).toBe(true)
      expect(inviteItem.text()).toContain('Alice Wonder')
      expect(inviteItem.text()).toContain('Secret Project')

      const acceptBtn = wrapper.find('[data-testid="accept-invite-201"]')
      expect(acceptBtn.exists()).toBe(true)
      await acceptBtn.trigger('click')
      expect(acceptSpy).toHaveBeenCalledWith(201)

      const declineBtn = wrapper.find('[data-testid="decline-invite-201"]')
      expect(declineBtn.exists()).toBe(true)
      await declineBtn.trigger('click')
      expect(declineSpy).toHaveBeenCalledWith(201)
    })

    it('renders conversation items and clicking one calls chatStore.selectConversation', async () => {
      chatStore.conversations = [...mockConversations]
      const selectSpy = vi.spyOn(chatStore, 'selectConversation').mockResolvedValue(undefined)

      const wrapper = mountChatSidebar()

      const convItem = wrapper.find('[data-testid="conversation-item-101"]')
      expect(convItem.exists()).toBe(true)
      expect(convItem.text()).toContain('Bob Ross')
      expect(convItem.text()).toContain('Hello Bob!')

      // Group conversation item
      const groupConv = wrapper.find('[data-testid="conversation-item-102"]')
      expect(groupConv.exists()).toBe(true)
      expect(groupConv.text()).toContain('Weekend Crew')

      await convItem.trigger('click')
      expect(selectSpy).toHaveBeenCalledWith(101)
    })

    it('renders empty state when there are no conversations and no pending invites', () => {
      chatStore.conversations = []
      chatStore.pendingInvites = []

      const wrapper = mountChatSidebar()

      expect(wrapper.find('[data-testid="empty-conversations-message"]').exists()).toBe(true)
    })

    it('opens CreateChatDialog when clicking "+ New Chat" button', async () => {
      const wrapper = mountChatSidebar()

      const newChatBtn = wrapper.find('[data-testid="new-chat-button"]')
      expect(newChatBtn.exists()).toBe(true)
      await newChatBtn.trigger('click')

      const dialog = wrapper.findComponent(CreateChatDialog)
      expect(dialog.exists()).toBe(true)
      expect(dialog.props('visible')).toBe(true)
    })
  })

  describe('Active Chat View (activeConversationId !== null)', () => {
    beforeEach(() => {
      chatStore.isSidebarOpen = true
      chatStore.activeConversationId = 101
      chatStore.activeConversation = mockActiveConversation
      chatStore.activeMessages = [...mockMessages]
    })

    it('switches to active view when activeConversationId is set and displays header details', () => {
      const wrapper = mountChatSidebar()

      expect(wrapper.find('[data-testid="back-to-roster-button"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="active-chat-title"]').text()).toContain('Bob Ross')
      expect(wrapper.find('[data-testid="active-chat-member-count"]').text()).toContain('2 members')
    })

    it('back button resets activeConversationId to null', async () => {
      const wrapper = mountChatSidebar()

      const backBtn = wrapper.find('[data-testid="back-to-roster-button"]')
      await backBtn.trigger('click')

      expect(chatStore.activeConversationId).toBeNull()
    })

    it('renders message history with bubbles, senders, and timestamps', () => {
      const wrapper = mountChatSidebar()

      const msg1 = wrapper.find('[data-testid="message-item-1"]')
      expect(msg1.exists()).toBe(true)
      expect(msg1.text()).toContain('Bob Ross')
      expect(msg1.text()).toContain('Hi there!')

      const msg2 = wrapper.find('[data-testid="message-item-2"]')
      expect(msg2.exists()).toBe(true)
      expect(msg2.text()).toContain('Current User')
      expect(msg2.text()).toContain('Hey Bob, what is up?')
    })

    it('message input triggers chatStore.sendMessage on button click and clears input', async () => {
      const sendSpy = vi.spyOn(chatStore, 'sendMessage').mockResolvedValue(null)
      const wrapper = mountChatSidebar()

      const input = wrapper.find('[data-testid="message-input"]')
      await input.setValue('Testing message send')

      const sendBtn = wrapper.find('[data-testid="send-message-button"]')
      expect(sendBtn.attributes('disabled')).toBeUndefined()

      await sendBtn.trigger('click')
      await flushPromises()

      expect(sendSpy).toHaveBeenCalledWith('Testing message send')
      expect((input.element as HTMLInputElement).value).toBe('')
    })

    it('message input triggers chatStore.sendMessage on Enter key and clears input', async () => {
      const sendSpy = vi.spyOn(chatStore, 'sendMessage').mockResolvedValue(null)
      const wrapper = mountChatSidebar()

      const input = wrapper.find('[data-testid="message-input"]')
      await input.setValue('Testing Enter key')

      await input.trigger('keydown.enter')
      await flushPromises()

      expect(sendSpy).toHaveBeenCalledWith('Testing Enter key')
      expect((input.element as HTMLInputElement).value).toBe('')
    })

    it('disables send button when input is whitespace or empty', async () => {
      const wrapper = mountChatSidebar()

      const input = wrapper.find('[data-testid="message-input"]')
      await input.setValue('   ')

      const sendBtn = wrapper.find('[data-testid="send-message-button"]')
      expect(sendBtn.attributes('disabled')).toBeDefined()
    })

    it('clear history confirmation dialog dispatches chatStore.clearHistory', async () => {
      const clearSpy = vi.spyOn(chatStore, 'clearHistory').mockResolvedValue(undefined)
      const wrapper = mountChatSidebar()

      const clearBtn = wrapper.find('[data-testid="clear-history-button"]')
      expect(clearBtn.exists()).toBe(true)
      await clearBtn.trigger('click')

      // Confirmation dialog should now be visible
      const confirmDialog = wrapper.find('[data-testid="clear-history-dialog"]')
      expect(confirmDialog.exists()).toBe(true)

      const confirmBtn = wrapper.find('[data-testid="confirm-clear-button"]')
      expect(confirmBtn.exists()).toBe(true)
      await confirmBtn.trigger('click')
      await flushPromises()

      expect(clearSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('CreateChatDialog Component', () => {
    it('creates 1-on-1 direct message when selecting a friend', async () => {
      const createSpy = vi.spyOn(chatStore, 'createChat').mockResolvedValue(mockActiveConversation)

      const wrapper = mount(CreateChatDialog, {
        props: {
          visible: true,
          friends: mockFriends,
        },
        global: {
          plugins: [PrimeVue, ToastService],
          stubs: {
            Dialog: DialogStub,
            ScrollPanel: ScrollPanelStub,
          },
        },
      })

      // Radio button / row for Bob Ross
      const bobRadio = wrapper.find('[data-testid="friend-radio-10"]')
      expect(bobRadio.exists()).toBe(true)
      await bobRadio.trigger('click')
      await flushPromises()

      const confirmBtn = wrapper.find('[data-testid="confirm-create-chat-button"]')
      expect(confirmBtn.attributes('disabled')).toBeUndefined()
      await confirmBtn.trigger('click')
      await flushPromises()

      expect(createSpy).toHaveBeenCalledWith({
        type: 'DIRECT',
        participant_ids: [10],
      })
      expect(wrapper.emitted('created')).toBeTruthy()
    })

    it('creates group chat with title and selected friends', async () => {
      const createSpy = vi.spyOn(chatStore, 'createChat').mockResolvedValue(mockActiveConversation)

      const wrapper = mount(CreateChatDialog, {
        props: {
          visible: true,
          friends: mockFriends,
        },
        global: {
          plugins: [PrimeVue, ToastService],
          stubs: {
            Dialog: DialogStub,
            ScrollPanel: ScrollPanelStub,
          },
        },
      })

      // Switch to GROUP
      const groupRadio = wrapper.find('[data-testid="chat-type-group"]')
      await groupRadio.trigger('click')
      await flushPromises()

      // Set group title
      const titleInput = wrapper.find('[data-testid="group-title-input"]')
      expect(titleInput.exists()).toBe(true)
      await titleInput.setValue('Frontend Developers')

      // Select friends
      const bobCheckbox = wrapper.find('[data-testid="friend-checkbox-10"]')
      await bobCheckbox.trigger('click')

      const charlieCheckbox = wrapper.find('[data-testid="friend-checkbox-11"]')
      await charlieCheckbox.trigger('click')
      await flushPromises()

      const confirmBtn = wrapper.find('[data-testid="confirm-create-chat-button"]')
      await confirmBtn.trigger('click')
      await flushPromises()

      expect(createSpy).toHaveBeenCalledWith({
        type: 'GROUP',
        title: 'Frontend Developers',
        participant_ids: expect.arrayContaining([10, 11]),
      })
      expect(wrapper.emitted('created')).toBeTruthy()
    })
  })
})

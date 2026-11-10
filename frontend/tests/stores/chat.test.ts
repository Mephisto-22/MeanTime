import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatApi, type ConversationDetailOut, type ConversationOut, type MessageOut, type PendingInviteOut } from '~/api/chat'
import { apiService } from '~/services/ApiService'
import { useChatStore } from '~/stores/chat'

const mockParticipant = {
  id: 10,
  user_id: 2,
  display_name: 'Bob Ross',
  email: 'bob@example.com',
  status: 'ACCEPTED',
  invited_by_id: 1,
}

const mockConversationOut: ConversationOut = {
  id: 101,
  type: 'DIRECT',
  title: 'Direct Chat',
  updated_at: '2026-11-10T12:00:00Z',
  other_participants: [mockParticipant],
  last_message: {
    content: 'Hello there!',
    sender_name: 'Bob Ross',
    created_at: '2026-11-10T12:00:00Z',
  },
  unread_count: 2,
}

const mockGroupConversationOut: ConversationOut = {
  id: 102,
  type: 'GROUP',
  title: 'Weekend Project',
  updated_at: '2026-11-10T12:30:00Z',
  other_participants: [mockParticipant],
  last_message: null,
  unread_count: 3,
}

const mockPendingInvite: PendingInviteOut = {
  id: 201,
  conversation_id: 102,
  conversation_type: 'GROUP',
  conversation_title: 'Weekend Project',
  invited_by_name: 'Alice',
  created_at: '2026-11-10T11:00:00Z',
}

const mockConversationDetail: ConversationDetailOut = {
  id: 101,
  type: 'DIRECT',
  title: 'Direct Chat',
  created_at: '2026-11-10T10:00:00Z',
  updated_at: '2026-11-10T12:00:00Z',
  is_active: true,
  participants: [
    {
      id: 9,
      user_id: 1,
      display_name: 'Self',
      email: 'self@example.com',
      status: 'ACCEPTED',
    },
    mockParticipant,
  ],
}

const mockMessage1: MessageOut = {
  id: 1,
  conversation_id: 101,
  sender_id: 2,
  sender_name: 'Bob Ross',
  content: 'Hello there!',
  created_at: '2026-11-10T12:00:00Z',
}

const mockMessage2: MessageOut = {
  id: 2,
  conversation_id: 101,
  sender_id: 1,
  sender_name: 'Self',
  content: 'General Kenobi!',
  created_at: '2026-11-10T12:01:00Z',
}

describe('Chat Store & ChatApi Contracts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('Getters', () => {
    it('computes totalUnreadCount, totalInviteCount, and badgeCount properly', () => {
      const store = useChatStore()
      expect(store.totalUnreadCount).toBe(0)
      expect(store.totalInviteCount).toBe(0)
      expect(store.badgeCount).toBe(0)

      store.conversations = [mockConversationOut, mockGroupConversationOut]
      store.pendingInvites = [mockPendingInvite]

      expect(store.totalUnreadCount).toBe(5) // 2 + 3
      expect(store.totalInviteCount).toBe(1)
      expect(store.badgeCount).toBe(6) // 5 + 1
    })
  })

  describe('Conversations and Invites', () => {
    it('loadConversations fetches and sets conversations and pending invites', async () => {
      vi.spyOn(chatApi, 'getConversations').mockResolvedValue({
        conversations: [mockConversationOut],
        pending_invites: [mockPendingInvite],
      })

      const store = useChatStore()
      await store.loadConversations()

      expect(store.conversations).toEqual([mockConversationOut])
      expect(store.pendingInvites).toEqual([mockPendingInvite])
      expect(store.loading).toBe(false)
    })

    it('acceptInvite calls API, removes invite from list, and reloads conversations', async () => {
      const acceptSpy = vi.spyOn(chatApi, 'acceptInvite').mockResolvedValue(mockConversationDetail)
      const loadSpy = vi.spyOn(chatApi, 'getConversations').mockResolvedValue({
        conversations: [mockConversationOut, mockGroupConversationOut],
        pending_invites: [],
      })

      const store = useChatStore()
      store.pendingInvites = [mockPendingInvite]

      await store.acceptInvite(mockPendingInvite.id)

      expect(acceptSpy).toHaveBeenCalledWith(mockPendingInvite.id)
      expect(store.pendingInvites).toEqual([])
      expect(loadSpy).toHaveBeenCalled()
      expect(store.conversations.length).toBe(2)
    })

    it('declineInvite calls API and removes invite from pending list', async () => {
      const declineSpy = vi.spyOn(chatApi, 'declineInvite').mockResolvedValue({ success: true })

      const store = useChatStore()
      store.pendingInvites = [mockPendingInvite]

      await store.declineInvite(mockPendingInvite.id)

      expect(declineSpy).toHaveBeenCalledWith(mockPendingInvite.id)
      expect(store.pendingInvites).toEqual([])
    })
  })

  describe('Active Conversation & Messaging', () => {
    it('selectConversation loads details and messages, marks as read, and clears unread badge', async () => {
      const getConvSpy = vi.spyOn(chatApi, 'getConversation').mockResolvedValue(mockConversationDetail)
      const getMsgsSpy = vi.spyOn(chatApi, 'getMessages').mockResolvedValue([mockMessage1])
      const markReadSpy = vi.spyOn(chatApi, 'markAsRead').mockResolvedValue({
        success: true,
        last_read_at: '2026-11-10T12:05:00Z',
      })

      const store = useChatStore()
      store.conversations = [{ ...mockConversationOut, unread_count: 4 }]

      await store.selectConversation(101)

      expect(store.activeConversationId).toBe(101)
      expect(store.activeConversation).toEqual(mockConversationDetail)
      expect(store.activeMessages).toEqual([mockMessage1])
      expect(getConvSpy).toHaveBeenCalledWith(101)
      expect(getMsgsSpy).toHaveBeenCalledWith(101)
      expect(markReadSpy).toHaveBeenCalledWith(101)
      expect(store.conversations[0].unread_count).toBe(0)
    })

    it('sendMessage posts message and appends to activeMessages', async () => {
      const sendSpy = vi.spyOn(chatApi, 'sendMessage').mockResolvedValue(mockMessage2)

      const store = useChatStore()
      store.activeConversationId = 101
      store.activeMessages = [mockMessage1]
      store.conversations = [mockConversationOut]

      const result = await store.sendMessage('General Kenobi!')

      expect(sendSpy).toHaveBeenCalledWith(101, 'General Kenobi!')
      expect(result).toEqual(mockMessage2)
      expect(store.activeMessages).toEqual([mockMessage1, mockMessage2])
      expect(store.conversations[0].last_message?.content).toBe('General Kenobi!')
    })

    it('clearHistory calls API clear and empties activeMessages', async () => {
      const clearSpy = vi.spyOn(chatApi, 'clearHistory').mockResolvedValue({
        success: true,
        cleared_at: '2026-11-10T12:10:00Z',
      })

      const store = useChatStore()
      store.activeConversationId = 101
      store.activeMessages = [mockMessage1, mockMessage2]

      await store.clearHistory()

      expect(clearSpy).toHaveBeenCalledWith(101)
      expect(store.activeMessages).toEqual([])
    })
  })

  describe('Direct Chat & Group Creation', () => {
    it('openDirectChat selects existing direct conversation if one already exists', async () => {
      const store = useChatStore()
      store.conversations = [mockConversationOut] // Has participant with user_id: 2
      const selectSpy = vi.spyOn(store, 'selectConversation').mockResolvedValue(undefined)

      await store.openDirectChat(2)

      expect(store.isSidebarOpen).toBe(true)
      expect(selectSpy).toHaveBeenCalledWith(101)
    })

    it('openDirectChat creates direct conversation and selects it when none exists', async () => {
      const createSpy = vi.spyOn(chatApi, 'createConversation').mockResolvedValue(mockConversationDetail)
      vi.spyOn(chatApi, 'getConversations').mockResolvedValue({
        conversations: [mockConversationOut],
        pending_invites: [],
      })
      vi.spyOn(chatApi, 'getConversation').mockResolvedValue(mockConversationDetail)
      vi.spyOn(chatApi, 'getMessages').mockResolvedValue([])
      vi.spyOn(chatApi, 'markAsRead').mockResolvedValue({ success: true, last_read_at: '2026-11-10T12:00:00Z' })

      const store = useChatStore()
      store.conversations = []

      await store.openDirectChat(2)

      expect(store.isSidebarOpen).toBe(true)
      expect(createSpy).toHaveBeenCalledWith({
        type: 'DIRECT',
        participant_ids: [2],
      })
      expect(store.activeConversationId).toBe(101)
    })

    it('createChat creates conversation, reloads list, and selects new conversation', async () => {
      const createSpy = vi.spyOn(chatApi, 'createConversation').mockResolvedValue(mockConversationDetail)
      vi.spyOn(chatApi, 'getConversations').mockResolvedValue({
        conversations: [mockConversationOut],
        pending_invites: [],
      })
      const selectSpy = vi.spyOn(chatApi, 'getConversation').mockResolvedValue(mockConversationDetail)
      vi.spyOn(chatApi, 'getMessages').mockResolvedValue([])
      vi.spyOn(chatApi, 'markAsRead').mockResolvedValue({ success: true, last_read_at: '2026-11-10T12:00:00Z' })

      const store = useChatStore()
      await store.createChat({
        type: 'GROUP',
        participant_ids: [2, 3],
        title: 'New Group',
      })

      expect(createSpy).toHaveBeenCalledWith({
        type: 'GROUP',
        participant_ids: [2, 3],
        title: 'New Group',
      })
      expect(store.activeConversationId).toBe(101)
    })
  })

  describe('Sidebar & Smart Polling', () => {
    it('openSidebar, closeSidebar, and toggleSidebar control state and polling timer', () => {
      const store = useChatStore()
      expect(store.isSidebarOpen).toBe(false)
      expect(store.pollingTimer).toBeNull()

      store.openSidebar()
      expect(store.isSidebarOpen).toBe(true)
      expect(store.pollingTimer).not.toBeNull()

      store.closeSidebar()
      expect(store.isSidebarOpen).toBe(false)
      expect(store.pollingTimer).toBeNull()

      store.toggleSidebar()
      expect(store.isSidebarOpen).toBe(true)
      expect(store.pollingTimer).not.toBeNull()

      store.toggleSidebar()
      expect(store.isSidebarOpen).toBe(false)
      expect(store.pollingTimer).toBeNull()
    })

    it('smart polling polls messages with since_id every 2.5 seconds when active and open', async () => {
      const getMsgsSpy = vi.spyOn(chatApi, 'getMessages').mockResolvedValue([mockMessage2])
      vi.spyOn(chatApi, 'markAsRead').mockResolvedValue({ success: true, last_read_at: '2026-11-10T12:01:00Z' })

      const store = useChatStore()
      store.isSidebarOpen = true
      store.activeConversationId = 101
      store.activeMessages = [mockMessage1] // mockMessage1.id = 1
      store.startPolling()

      // Advance by 2500ms
      await vi.advanceTimersByTimeAsync(2500)

      expect(getMsgsSpy).toHaveBeenCalledWith(101, 1)
      expect(store.activeMessages).toEqual([mockMessage1, mockMessage2])

      store.stopPolling()
    })
  })

  describe('ChatApi Endpoint & Request Formats', () => {
    it('all ChatApi methods make expected requests to /api/chat endpoints', async () => {
      const getSpy = vi.spyOn(apiService, 'get').mockResolvedValue({} as any)
      const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue({} as any)
      const patchSpy = vi.spyOn(apiService, 'patch').mockResolvedValue({} as any)

      await chatApi.getConversations()
      expect(getSpy).toHaveBeenCalledWith('/api/chat/conversations')

      await chatApi.createConversation({ type: 'DIRECT', participant_ids: [2] })
      expect(postSpy).toHaveBeenCalledWith('/api/chat/conversations', { type: 'DIRECT', participant_ids: [2] })

      await chatApi.getConversation(101)
      expect(getSpy).toHaveBeenCalledWith('/api/chat/conversations/101')

      await chatApi.updateConversation(101, { title: 'New Title' })
      expect(patchSpy).toHaveBeenCalledWith('/api/chat/conversations/101', { title: 'New Title' })

      await chatApi.inviteFriends(101, [3, 4])
      expect(postSpy).toHaveBeenCalledWith('/api/chat/conversations/101/invites', { user_ids: [3, 4] })

      await chatApi.acceptInvite(101)
      expect(postSpy).toHaveBeenCalledWith('/api/chat/conversations/101/accept')

      await chatApi.declineInvite(101)
      expect(postSpy).toHaveBeenCalledWith('/api/chat/conversations/101/decline')

      await chatApi.leaveConversation(101)
      expect(postSpy).toHaveBeenCalledWith('/api/chat/conversations/101/leave')

      await chatApi.getMessages(101, 5)
      expect(getSpy).toHaveBeenCalledWith('/api/chat/conversations/101/messages', { since_id: 5 })

      await chatApi.sendMessage(101, 'Hello')
      expect(postSpy).toHaveBeenCalledWith('/api/chat/conversations/101/messages', { content: 'Hello' })

      await chatApi.clearHistory(101)
      expect(postSpy).toHaveBeenCalledWith('/api/chat/conversations/101/clear')

      await chatApi.markAsRead(101)
      expect(postSpy).toHaveBeenCalledWith('/api/chat/conversations/101/read')
    })
  })
})

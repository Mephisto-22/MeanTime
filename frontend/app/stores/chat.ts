import { defineStore } from 'pinia'
import {
  chatApi,
  type ConversationDetailOut,
  type ConversationOut,
  type CreateConversationIn,
  type MessageOut,
  type PendingInviteOut,
  type UpdateConversationIn,
} from '~/api/chat'

export interface ChatState {
  conversations: ConversationOut[]
  pendingInvites: PendingInviteOut[]
  activeConversationId: number | null
  activeConversation: ConversationDetailOut | null
  activeMessages: MessageOut[]
  isSidebarOpen: boolean
  loading: boolean
  isPolling: boolean
  pollingTimer: ReturnType<typeof setInterval> | null
}

export const useChatStore = defineStore('chat', {
  state: (): ChatState => ({
    conversations: [],
    pendingInvites: [],
    activeConversationId: null,
    activeConversation: null,
    activeMessages: [],
    isSidebarOpen: false,
    loading: false,
    isPolling: false,
    pollingTimer: null,
  }),

  getters: {
    totalUnreadCount: (state): number => {
      return state.conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0)
    },
    totalInviteCount: (state): number => {
      return state.pendingInvites.length
    },
    badgeCount(): number {
      return this.totalUnreadCount + this.totalInviteCount
    },
  },

  actions: {
    async loadConversations(): Promise<void> {
      this.loading = true
      try {
        const response = await chatApi.getConversations()
        this.conversations = response.conversations || []
        this.pendingInvites = response.pending_invites || []
      } finally {
        this.loading = false
      }
    },

    async selectConversation(id: number): Promise<void> {
      this.activeConversationId = id
      try {
        const [detail, messages] = await Promise.all([
          chatApi.getConversation(id),
          chatApi.getMessages(id),
        ])

        // Guard against race conditions if active conversation was switched while awaiting
        if (this.activeConversationId !== id) return

        this.activeConversation = detail
        this.activeMessages = messages || []

        // Mark as read and reset local unread badge
        await chatApi.markAsRead(id).catch(() => {})
        const conv = this.conversations.find((c) => c.id === id)
        if (conv) {
          conv.unread_count = 0
        }

        if (this.isSidebarOpen) {
          this.startPolling()
        }
      } catch (err) {
        // Reset active id on failure to avoid inconsistent state
        this.activeConversationId = null
        throw err
      }
    },

    async sendMessage(content: string): Promise<MessageOut | null> {
      if (!this.activeConversationId || !content.trim()) return null

      const msg = await chatApi.sendMessage(this.activeConversationId, content.trim())

      if (!this.activeMessages.some((m) => m.id === msg.id)) {
        this.activeMessages.push(msg)
      }

      const conv = this.conversations.find((c) => c.id === this.activeConversationId)
      if (conv) {
        conv.last_message = {
          content: msg.content,
          sender_name: msg.sender_name,
          created_at: msg.created_at,
        }
        conv.updated_at = msg.created_at
      }

      return msg
    },

    async clearHistory(): Promise<void> {
      if (!this.activeConversationId) return

      await chatApi.clearHistory(this.activeConversationId)
      this.activeMessages = []

      const conv = this.conversations.find((c) => c.id === this.activeConversationId)
      if (conv) {
        conv.last_message = null
      }
    },

    async acceptInvite(id: number): Promise<void> {
      const invite = this.pendingInvites.find(
        (i) => i.id === id || i.conversation_id === id,
      )
      const convId = invite ? invite.conversation_id : id
      await chatApi.acceptInvite(convId)
      this.pendingInvites = this.pendingInvites.filter(
        (i) => i.id !== id && i.conversation_id !== convId,
      )
      await this.loadConversations()
    },

    async declineInvite(id: number): Promise<void> {
      const invite = this.pendingInvites.find(
        (i) => i.id === id || i.conversation_id === id,
      )
      const convId = invite ? invite.conversation_id : id
      await chatApi.declineInvite(convId)
      this.pendingInvites = this.pendingInvites.filter(
        (i) => i.id !== id && i.conversation_id !== convId,
      )
    },

    async createChat(payload: CreateConversationIn): Promise<ConversationDetailOut> {
      const conv = await chatApi.createConversation(payload)
      await this.loadConversations()
      if (conv?.id) {
        await this.selectConversation(conv.id)
      }
      return conv
    },

    async openDirectChat(friendId: number): Promise<void> {
      this.openSidebar()

      if (this.conversations.length === 0) {
        await this.loadConversations()
      }

      const existing = this.conversations.find(
        (c) =>
          c.type === 'DIRECT' &&
          c.other_participants?.some((p) => p.user_id === friendId),
      )

      if (existing) {
        await this.selectConversation(existing.id)
      } else {
        const conv = await chatApi.createConversation({
          type: 'DIRECT',
          participant_ids: [friendId],
        })
        await this.loadConversations()
        if (conv?.id) {
          await this.selectConversation(conv.id)
        }
      }
    },

    async leaveConversation(id: number): Promise<void> {
      await chatApi.leaveConversation(id)
      if (this.activeConversationId === id) {
        this.activeConversationId = null
        this.activeConversation = null
        this.activeMessages = []
      }
      await this.loadConversations()
    },

    async updateConversationTitle(
      id: number,
      title: string,
    ): Promise<ConversationDetailOut> {
      const updated = await chatApi.updateConversation(id, { title })
      if (this.activeConversation?.id === id) {
        this.activeConversation = updated
      }
      await this.loadConversations()
      return updated
    },

    async inviteFriends(
      id: number,
      userIds: number[],
    ): Promise<ConversationDetailOut> {
      const updated = await chatApi.inviteFriends(id, userIds)
      if (this.activeConversation?.id === id) {
        this.activeConversation = updated
      }
      return updated
    },

    async pollMessages(): Promise<void> {
      if (!this.activeConversationId || !this.isSidebarOpen || this.isPolling) return
      this.isPolling = true

      const convId = this.activeConversationId
      const lastMsg = this.activeMessages[this.activeMessages.length - 1]
      const sinceId = lastMsg?.id

      try {
        const newMsgs = await chatApi.getMessages(convId, sinceId)
        if (newMsgs && newMsgs.length > 0 && this.activeConversationId === convId) {
          for (const msg of newMsgs) {
            if (!this.activeMessages.some((m) => m.id === msg.id)) {
              this.activeMessages.push(msg)
            }
          }

          await chatApi.markAsRead(convId).catch(() => {})

          const conv = this.conversations.find((c) => c.id === convId)
          const latest = this.activeMessages[this.activeMessages.length - 1]
          if (conv && latest) {
            conv.last_message = {
              content: latest.content,
              sender_name: latest.sender_name,
              created_at: latest.created_at,
            }
            conv.updated_at = latest.created_at
            conv.unread_count = 0
          }
        }
      } catch {
        // Polling errors are suppressed to prevent spamming UI
      } finally {
        this.isPolling = false
      }
    },

    startPolling(): void {
      if (this.pollingTimer) this.stopPolling()
      this.pollingTimer = setInterval(() => {
        if (this.isSidebarOpen && this.activeConversationId) {
          this.pollMessages()
        }
      }, 2500)
    },

    stopPolling(): void {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer)
        this.pollingTimer = null
      }
      this.isPolling = false
    },

    openSidebar(): void {
      this.isSidebarOpen = true
      this.startPolling()
      if (this.conversations.length === 0) {
        this.loadConversations().catch(() => {})
      }
    },

    closeSidebar(): void {
      this.isSidebarOpen = false
      this.stopPolling()
    },

    toggleSidebar(): void {
      if (this.isSidebarOpen) {
        this.closeSidebar()
      } else {
        this.openSidebar()
      }
    },
  },
})

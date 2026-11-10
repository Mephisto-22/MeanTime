<template>
  <div>
    <!-- Minimized Dock Button on screen edge -->
    <Button
      v-if="!chatStore.isSidebarOpen"
      severity="primary"
      rounded
      class="chat-dock-toggle fixed bottom-6 right-6 shadow-lg z-50 flex items-center gap-2"
      data-testid="chat-dock-button"
      @click="chatStore.openSidebar()"
    >
      <i class="pi pi-comments text-lg" />
      <span>Chat</span>
      <Badge
        v-if="chatStore.badgeCount > 0"
        :value="chatStore.badgeCount"
        severity="warn"
        data-testid="chat-dock-badge"
      />
    </Button>

    <!-- Chat Drawer -->
    <Drawer
      v-model:visible="chatStore.isSidebarOpen"
      position="right"
      style="width: 24rem"
      class="chat-drawer"
      data-testid="chat-drawer"
      :modal="false"
    >
      <template #header>
        <!-- View 1 Header: Roster & Invites -->
        <div
          v-if="chatStore.activeConversationId === null"
          class="flex items-center justify-between w-full pr-2"
          data-testid="roster-header"
        >
          <div class="flex items-center gap-2">
            <i class="pi pi-comments text-primary-500" />
            <span class="font-bold text-lg">Chats</span>
            <Badge
              v-if="chatStore.totalUnreadCount > 0"
              :value="chatStore.totalUnreadCount"
              severity="danger"
            />
          </div>
          <div class="flex items-center gap-1">
            <Button
              icon="pi pi-plus"
              size="small"
              label="New Chat"
              data-testid="new-chat-button"
              @click="showCreateDialog = true"
            />
            <Button
              icon="pi pi-times"
              text
              size="small"
              severity="secondary"
              data-testid="close-sidebar-button"
              @click="chatStore.closeSidebar()"
            />
          </div>
        </div>

        <!-- View 2 Header: Active Conversation -->
        <div
          v-else
          class="flex items-center justify-between w-full pr-2"
          data-testid="active-chat-header"
        >
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <Button
              icon="pi pi-arrow-left"
              text
              size="small"
              data-testid="back-to-roster-button"
              @click="handleBackToRoster"
            />
            <div class="flex flex-col min-w-0">
              <span class="font-semibold text-sm truncate" data-testid="active-chat-title">
                {{ activeChatTitle }}
              </span>
              <span
                v-if="chatStore.activeConversation?.participants?.length"
                class="text-xs text-surface-500"
                data-testid="active-chat-member-count"
              >
                {{ chatStore.activeConversation.participants.length }} members
              </span>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <Button
              v-if="chatStore.activeConversation?.type === 'GROUP'"
              icon="pi pi-user-plus"
              text
              size="small"
              title="Invite Friends"
              data-testid="invite-member-button"
              @click="showInviteDialog = true"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              size="small"
              title="Clear History"
              data-testid="clear-history-button"
              @click="showClearConfirm = true"
            />
            <Button
              icon="pi pi-times"
              text
              size="small"
              severity="secondary"
              data-testid="close-sidebar-button"
              @click="chatStore.closeSidebar()"
            />
          </div>
        </div>
      </template>

      <!-- Main Drawer Content -->
      <div class="flex flex-col h-full overflow-hidden">
        <!-- View 1: Roster & Invites View -->
        <template v-if="chatStore.activeConversationId === null">
          <!-- Pending Invites Section -->
          <div
            v-if="chatStore.pendingInvites.length > 0"
            class="flex flex-col gap-2 p-3 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-700"
            data-testid="pending-invites-section"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold uppercase tracking-wider text-surface-500">
                Pending Invites
              </span>
              <Badge :value="chatStore.pendingInvites.length" severity="warn" />
            </div>

            <div
              v-for="invite in chatStore.pendingInvites"
              :key="invite.id"
              class="flex flex-col gap-2 p-2 rounded bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700"
              :data-testid="'pending-invite-' + invite.id"
            >
              <div class="flex items-center justify-between gap-2">
                <Tag severity="warn" value="Invite">Invite</Tag>
                <span class="text-xs text-surface-500">{{ formatTimestamp(invite.created_at) }}</span>
              </div>
              <div class="text-sm">
                <strong>{{ invite.invited_by_name }}</strong> invited you to
                <span class="font-medium">{{ invite.conversation_title || 'a chat' }}</span>
              </div>
              <div class="flex gap-2 justify-end">
                <Button
                  size="small"
                  severity="secondary"
                  text
                  label="Decline"
                  icon="pi pi-times"
                  :data-testid="'decline-invite-' + invite.id"
                  @click="chatStore.declineInvite(invite.id)"
                />
                <Button
                  size="small"
                  severity="primary"
                  label="Accept"
                  icon="pi pi-check"
                  :data-testid="'accept-invite-' + invite.id"
                  @click="chatStore.acceptInvite(invite.id)"
                />
              </div>
            </div>
          </div>

          <!-- Active Conversations List -->
          <ScrollPanel class="flex-1 w-full" data-testid="conversations-scroll">
            <div
              v-if="chatStore.conversations.length === 0"
              class="p-6 text-center text-surface-500"
              data-testid="empty-conversations-message"
            >
              <Message severity="secondary" :closable="false">
                No conversations yet. Start a chat with a friend!
              </Message>
            </div>

            <div v-else class="flex flex-col" data-testid="conversations-list">
              <div
                v-for="conv in chatStore.conversations"
                :key="conv.id"
                class="flex items-center justify-between p-3 border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/60 cursor-pointer transition-colors"
                :data-testid="'conversation-item-' + conv.id"
                @click="chatStore.selectConversation(conv.id)"
              >
                <div class="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar
                    :label="getConversationInitials(conv)"
                    shape="circle"
                    size="normal"
                    class="flex-shrink-0"
                  />
                  <div class="flex flex-col min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-1">
                      <span
                        class="font-medium text-sm truncate"
                        :data-testid="'conversation-title-' + conv.id"
                      >
                        {{ getConversationDisplayTitle(conv) }}
                      </span>
                      <span
                        v-if="conv.last_message?.created_at"
                        class="text-xs text-surface-400 flex-shrink-0"
                      >
                        {{ formatShortTime(conv.last_message.created_at) }}
                      </span>
                    </div>
                    <div class="flex items-center justify-between gap-1 mt-0.5">
                      <span
                        class="text-xs text-surface-500 truncate"
                        :data-testid="'conversation-snippet-' + conv.id"
                      >
                        {{
                          conv.last_message
                            ? (conv.type === 'GROUP' ? conv.last_message.sender_name + ': ' : '') +
                              conv.last_message.content
                            : 'No messages yet'
                        }}
                      </span>
                      <Badge
                        v-if="conv.unread_count > 0"
                        :value="conv.unread_count"
                        severity="danger"
                        class="flex-shrink-0"
                        :data-testid="'unread-badge-' + conv.id"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollPanel>
        </template>

        <!-- View 2: Active Chat View -->
        <template v-else>
          <!-- Message History -->
          <ScrollPanel
            ref="messagesScrollRef"
            class="flex-1 w-full p-3 overflow-y-auto"
            data-testid="message-history"
          >
            <div
              v-if="chatStore.activeMessages.length === 0"
              class="py-8 text-center text-surface-500"
              data-testid="empty-messages"
            >
              <Message severity="info" :closable="false">
                No messages yet. Say hello!
              </Message>
            </div>

            <div v-else class="flex flex-col gap-3">
              <div
                v-for="msg in chatStore.activeMessages"
                :key="msg.id"
                class="flex flex-col"
                :class="msg.sender_id === authStore.user?.id ? 'items-end' : 'items-start'"
                :data-testid="'message-item-' + msg.id"
              >
                <div
                  class="flex items-end gap-2 max-w-[85%]"
                  :class="msg.sender_id === authStore.user?.id ? 'flex-row-reverse' : 'flex-row'"
                >
                  <Avatar
                    :label="getInitials(msg.sender_name)"
                    shape="circle"
                    size="small"
                    class="flex-shrink-0"
                  />
                  <div
                    class="flex flex-col"
                    :class="msg.sender_id === authStore.user?.id ? 'items-end' : 'items-start'"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-xs font-semibold text-surface-600 dark:text-surface-400">
                        {{ msg.sender_name }}
                      </span>
                      <span class="text-[10px] text-surface-400">
                        {{ formatShortTime(msg.created_at) }}
                      </span>
                    </div>
                    <div
                      class="p-2.5 rounded-lg text-sm break-words"
                      :class="
                        msg.sender_id === authStore.user?.id
                          ? 'bg-primary-500 text-white rounded-br-none'
                          : 'bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-100 rounded-bl-none'
                      "
                      :data-testid="'message-bubble-' + msg.id"
                    >
                      {{ msg.content }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollPanel>

          <!-- Message Input Bar -->
          <div
            class="p-2 border-t border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 flex items-center gap-2"
          >
            <InputText
              v-model="messageText"
              placeholder="Type a message..."
              class="flex-1"
              size="small"
              data-testid="message-input"
              @keydown.enter.prevent="handleSend"
            />
            <Button
              icon="pi pi-send"
              size="small"
              :disabled="!messageText.trim() || isSending"
              :loading="isSending"
              data-testid="send-message-button"
              @click="handleSend"
            />
          </div>
        </template>
      </div>
    </Drawer>

    <!-- Clear History Confirmation Dialog -->
    <Dialog
      v-model:visible="showClearConfirm"
      modal
      header="Clear Chat History"
      class="dialog-sm"
      style="width: 24rem"
      :draggable="false"
      data-testid="clear-history-dialog"
    >
      <p class="text-sm text-surface-600 dark:text-surface-300">
        Are you sure you want to clear your view of this chat history? This only clears messages from your view and does not affect other participants.
      </p>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            label="Cancel"
            text
            severity="secondary"
            data-testid="cancel-clear-button"
            @click="showClearConfirm = false"
          />
          <Button
            type="button"
            label="Clear"
            severity="danger"
            data-testid="confirm-clear-button"
            @click="handleClear"
          />
        </div>
      </template>
    </Dialog>

    <!-- New Chat Dialog -->
    <CreateChatDialog
      v-model:visible="showCreateDialog"
      :friends="friends"
    />

    <!-- Invite Friends to Group Dialog -->
    <Dialog
      v-model:visible="showInviteDialog"
      modal
      header="Invite Friends to Group"
      class="dialog-sm"
      style="width: 26rem"
      :draggable="false"
      data-testid="invite-friends-dialog"
    >
      <div class="flex flex-col gap-3 py-2">
        <label class="text-sm font-medium">Select Friends to Invite</label>
        <Message
          v-if="nonMemberFriends.length === 0"
          severity="secondary"
          :closable="false"
          size="small"
        >
          No additional friends available to invite.
        </Message>
        <ScrollPanel v-else style="max-height: 14rem" class="w-full">
          <div class="flex flex-col gap-1 pr-2">
            <div
              v-for="friend in nonMemberFriends"
              :key="friend.id"
              class="flex items-center justify-between p-2 rounded cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800"
              @click="toggleInviteFriend(friend.id)"
            >
              <div class="flex items-center gap-3">
                <Avatar
                  :label="getInitials(friend.display_name)"
                  shape="circle"
                  size="normal"
                />
                <span class="text-sm font-medium">{{ friend.display_name }}</span>
              </div>
              <Checkbox
                v-model="selectedInviteFriendIds"
                :value="friend.id"
                :inputId="'invite-friend-' + friend.id"
                @click.stop
              />
            </div>
          </div>
        </ScrollPanel>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            label="Cancel"
            text
            severity="secondary"
            @click="showInviteDialog = false"
          />
          <Button
            type="button"
            label="Invite"
            severity="primary"
            :disabled="selectedInviteFriendIds.length === 0 || isInviting"
            :loading="isInviting"
            @click="handleInviteFriends"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChatStore } from '~/stores/chat'
import { useAuthStore } from '~/stores/auth'
import type { UserOut } from '~/api/friends'
import type { ConversationOut } from '~/api/chat'
import CreateChatDialog from '~/components/chat/CreateChatDialog.vue'

interface Props {
  friends?: UserOut[]
}

const props = defineProps<Props>()

const chatStore = useChatStore()
const authStore = useAuthStore()

const showCreateDialog = ref(false)
const showClearConfirm = ref(false)
const showInviteDialog = ref(false)
const messageText = ref('')
const isSending = ref(false)
const isInviting = ref(false)
const selectedInviteFriendIds = ref<number[]>([])

const activeChatTitle = computed(() => {
  if (!chatStore.activeConversation) return 'Chat'
  if (chatStore.activeConversation.type === 'DIRECT') {
    const other = chatStore.activeConversation.participants?.find(
      (p) => p.user_id !== authStore.user?.id,
    )
    return other?.display_name || chatStore.activeConversation.title || 'Direct Chat'
  }
  return chatStore.activeConversation.title || 'Group Chat'
})

const nonMemberFriends = computed(() => {
  const currentMembers = new Set(
    chatStore.activeConversation?.participants?.map((p) => p.user_id) || [],
  )
  const list = props.friends || []
  return list.filter((f) => !currentMembers.has(f.id))
})

function getInitials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  if (!first) return '?'
  if (parts.length === 1) return first.slice(0, 2).toUpperCase()
  const last = parts[parts.length - 1]
  const firstChar = first[0] ?? ''
  const lastChar = last?.[0] ?? ''
  return (firstChar + lastChar).toUpperCase() || '?'
}

function getConversationDisplayTitle(conv: ConversationOut): string {
  if (conv.type === 'DIRECT') {
    return conv.other_participants?.[0]?.display_name || conv.title || 'Direct Chat'
  }
  return conv.title || 'Group Chat'
}

function getConversationInitials(conv: ConversationOut): string {
  const title = getConversationDisplayTitle(conv)
  return getInitials(title)
}

function formatShortTime(dateStr?: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatTimestamp(dateStr?: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function handleBackToRoster() {
  chatStore.activeConversationId = null
}

async function handleSend() {
  const text = messageText.value.trim()
  if (!text || isSending.value) return
  isSending.value = true
  messageText.value = ''
  try {
    await chatStore.sendMessage(text)
  } finally {
    isSending.value = false
  }
}

async function handleClear() {
  await chatStore.clearHistory()
  showClearConfirm.value = false
}

function toggleInviteFriend(id: number) {
  const idx = selectedInviteFriendIds.value.indexOf(id)
  if (idx === -1) {
    selectedInviteFriendIds.value.push(id)
  } else {
    selectedInviteFriendIds.value.splice(idx, 1)
  }
}

async function handleInviteFriends() {
  if (!chatStore.activeConversationId || selectedInviteFriendIds.value.length === 0) return
  isInviting.value = true
  try {
    await chatStore.inviteFriends(
      chatStore.activeConversationId,
      selectedInviteFriendIds.value,
    )
    selectedInviteFriendIds.value = []
    showInviteDialog.value = false
  } finally {
    isInviting.value = false
  }
}
</script>

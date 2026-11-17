<template>
  <div v-if="chat">
    <!-- Minimized Dock Button on screen edge -->
    <Button
      v-if="!chat.isOpen.value"
      severity="primary"
      rounded
      class="chat-dock-toggle !fixed !bottom-6 !right-6 !z-50 shadow-2xl flex items-center gap-2"
      data-testid="chat-dock-button"
      @click="chat.open()"
    >
      <i class="pi pi-comments text-lg" />
      <span>Chat</span>
    </Button>

    <!-- Board Live Chat Drawer -->
    <Drawer
      v-model:visible="chat.isOpen.value"
      position="right"
      style="width: 24rem"
      class="chat-drawer"
      data-testid="chat-drawer"
      :modal="false"
      :show-close-icon="false"
    >
      <template #header>
        <div
          class="flex items-center justify-between w-full pr-2"
          data-testid="active-chat-header"
        >
          <div class="flex items-center gap-2 min-w-0">
            <i class="pi pi-comments text-primary-500" />
            <div class="flex flex-col min-w-0">
              <span
                class="font-bold text-sm truncate"
                data-testid="active-chat-title"
              >
                {{ boardTitle || 'Board Chat' }}
              </span>
              <span class="text-xs text-surface-500">Live Chat</span>
            </div>
          </div>
          <Button
            icon="pi pi-times"
            text
            size="small"
            severity="secondary"
            data-testid="close-active-sidebar-button"
            @click="chat.close()"
          />
        </div>
      </template>

      <div class="flex flex-col h-full justify-between gap-3">
        <!-- Message History -->
        <ScrollPanel class="flex-1 w-full" style="height: calc(100vh - 11rem)">
          <div
            class="flex flex-col gap-3 p-2"
            data-testid="message-list"
          >
            <Message
              v-if="chat.messages.value.length === 0"
              severity="info"
              :closable="false"
              data-testid="empty-messages-state"
            >
              No messages yet. Say hello to your collaborators!
            </Message>

            <div
              v-for="msg in chat.messages.value"
              :key="msg.id"
              class="flex flex-col gap-1"
              :class="msg.sender_id === authStore.user?.id ? 'items-end' : 'items-start'"
              :data-testid="'message-item-' + msg.id"
            >
              <div class="flex items-center gap-2">
                <Avatar
                  v-if="msg.sender_id !== authStore.user?.id"
                  :label="getInitials(msg.sender_name)"
                  shape="circle"
                  size="normal"
                />
                <span
                  class="text-xs font-medium text-surface-600 dark:text-surface-400"
                  :data-testid="'message-sender-' + msg.id"
                >
                  {{ msg.sender_name }}
                </span>
                <span
                  class="text-xs text-surface-400"
                  :data-testid="'message-time-' + msg.id"
                >
                  {{ formatTimestamp(msg.created_at) }}
                </span>
              </div>

              <div
                class="px-3 py-2 rounded-lg max-w-xs break-words text-sm"
                :class="
                  msg.sender_id === authStore.user?.id
                    ? 'bg-primary-500 text-surface-0'
                    : 'bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-0'
                "
                :data-testid="'message-bubble-' + msg.id"
              >
                {{ msg.content }}
              </div>
            </div>
          </div>
        </ScrollPanel>

        <!-- Message Input Bar -->
        <div class="flex items-center gap-2 pt-2 border-t border-surface-200 dark:border-surface-700">
          <InputText
            v-model="messageText"
            placeholder="Type a message..."
            class="flex-1"
            size="small"
            data-testid="message-input"
            @keydown.enter="handleSend"
          />
          <Button
            icon="pi pi-send"
            size="small"
            :disabled="!messageText.trim() || isSending"
            data-testid="send-message-button"
            @click="handleSend"
          />
        </div>
      </div>
    </Drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { kanbanContextKey } from '~/api/kanban'
import type { BoardChatComposable } from '~/composables/useBoardChat'
import { useAuthStore } from '~/stores/auth'

interface Props {
  boardTitle?: string
  boardChat?: BoardChatComposable
}

const props = defineProps<Props>()

const kanbanCtx = inject(kanbanContextKey, null)
const authStore = useAuthStore()
const notify = useNotifications()

const chat = computed(() => props.boardChat ?? kanbanCtx?.boardChat ?? null)

const messageText = ref('')
const isSending = ref(false)

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

function formatTimestamp(dateStr?: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

async function handleSend() {
  const activeChat = chat.value
  const text = messageText.value.trim()
  if (!activeChat || !text || isSending.value) return
  isSending.value = true
  messageText.value = ''
  try {
    await activeChat.sendMessage(text)
  } catch (err) {
    messageText.value = text
    notify.error(err, 'Unable to send message')
  } finally {
    isSending.value = false
  }
}
</script>

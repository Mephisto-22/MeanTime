import {
  ref,
  watch,
  toValue,
  getCurrentScope,
  onScopeDispose,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import { chatApi, type MessageOut } from '~/api/chat'

export interface BoardChatComposable {
  messages: Ref<MessageOut[]>
  isOpen: Ref<boolean>
  loading: Ref<boolean>
  loadHistory: () => Promise<void>
  pollMessages: () => Promise<void>
  sendMessage: (content: string) => Promise<MessageOut | undefined>
  open: () => void
  close: () => void
  toggle: () => void
  stopPolling: () => void
}

export function useBoardChat(
  boardId: MaybeRefOrGetter<string | number>,
): BoardChatComposable {
  const messages = ref<MessageOut[]>([])
  const isOpen = ref(false)
  const loading = ref(false)
  const isPolling = ref(false)
  let pollingTimer: ReturnType<typeof setInterval> | null = null
  let requestToken = 0

  function appendUniqueMessages(incoming: MessageOut[]) {
    if (!incoming || incoming.length === 0) return
    const existingIds = new Set(messages.value.map((m) => m.id))
    for (const msg of incoming) {
      if (!existingIds.has(msg.id)) {
        messages.value.push(msg)
        existingIds.add(msg.id)
      }
    }
  }

  async function loadHistory(): Promise<void> {
    const targetId = toValue(boardId)
    if (targetId === undefined || targetId === null || targetId === '') return

    const token = ++requestToken
    loading.value = true
    try {
      const history = await chatApi.getBoardMessages(targetId)
      if (token !== requestToken || String(toValue(boardId)) !== String(targetId)) return
      messages.value = history || []
    } finally {
      if (token === requestToken && String(toValue(boardId)) === String(targetId)) {
        loading.value = false
      }
    }
  }

  async function pollMessages(): Promise<void> {
    if (isPolling.value) return
    const targetId = toValue(boardId)
    if (targetId === undefined || targetId === null || targetId === '') return

    isPolling.value = true
    try {
      const lastMsg = messages.value[messages.value.length - 1]
      const params = lastMsg ? { since_id: lastMsg.id } : undefined
      const newMessages = await chatApi.getBoardMessages(targetId, params)

      if (String(toValue(boardId)) !== String(targetId)) return
      appendUniqueMessages(newMessages)
    } catch {
      // Suppress transient background polling errors
    } finally {
      isPolling.value = false
    }
  }

  async function sendMessage(content: string): Promise<MessageOut | undefined> {
    const trimmed = content.trim()
    if (!trimmed) return undefined
    const targetId = toValue(boardId)
    if (targetId === undefined || targetId === null || targetId === '') return undefined

    const msg = await chatApi.sendBoardMessage(targetId, trimmed)
    if (msg && String(toValue(boardId)) === String(targetId)) {
      appendUniqueMessages([msg])
    }
    return msg
  }

  function startPolling(): void {
    stopPolling()
    pollingTimer = setInterval(() => {
      if (isOpen.value) {
        pollMessages()
      }
    }, 2500)
  }

  function stopPolling(): void {
    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
    isPolling.value = false
  }

  function open(): void {
    isOpen.value = true
  }

  function close(): void {
    isOpen.value = false
  }

  function toggle(): void {
    if (isOpen.value) {
      close()
    } else {
      open()
    }
  }

  watch(
    isOpen,
    (openState) => {
      if (openState) {
        loadHistory().catch(() => {})
        startPolling()
      } else {
        stopPolling()
      }
    },
    { flush: 'sync' },
  )

  watch(
    () => toValue(boardId),
    (newId, oldId) => {
      if (String(newId) === String(oldId)) return
      requestToken += 1
      messages.value = []
      loading.value = false
      stopPolling()
      if (isOpen.value) {
        loadHistory().catch(() => {})
        startPolling()
      }
    },
  )

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopPolling()
    })
  }

  return {
    messages,
    isOpen,
    loading,
    loadHistory,
    pollMessages,
    sendMessage,
    open,
    close,
    toggle,
    stopPolling,
  }
}

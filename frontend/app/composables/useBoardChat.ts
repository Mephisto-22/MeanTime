import {
  ref,
  watch,
  toValue,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import { chatApi, type MessageOut } from '~/api/chat'

export interface BoardChatComposable {
  messages: Ref<MessageOut[]>
  isOpen: Ref<boolean>
  loading: Ref<boolean>
  loadHistory: () => Promise<void>
  receiveMessage: (incoming: MessageOut | Record<string, any>) => void
  sendMessage: (content: string) => Promise<MessageOut | undefined>
  open: () => void
  close: () => void
  toggle: () => void
}

function normalizeMessage(raw: any): MessageOut | null {
  if (!raw || typeof raw !== 'object') return null
  const id = raw.id
  const boardId = raw.board_id ?? raw.boardId
  const senderId = raw.sender_id ?? raw.senderId
  const senderName = raw.sender_name ?? raw.senderName
  const content = raw.content
  const createdAt = raw.created_at ?? raw.createdAt

  if (id === undefined || boardId === undefined || typeof content !== 'string') {
    return null
  }

  return {
    id: Number(id),
    board_id: Number(boardId),
    sender_id: Number(senderId ?? 0),
    sender_name: String(senderName ?? ''),
    content,
    created_at: String(createdAt ?? ''),
  }
}

export function useBoardChat(
  boardId: MaybeRefOrGetter<string | number>,
): BoardChatComposable {
  const messages = ref<MessageOut[]>([])
  const isOpen = ref(false)
  const loading = ref(false)
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

      const merged = [...(history || [])]
      const seen = new Set(merged.map((m) => m.id))
      for (const existing of messages.value) {
        if (!seen.has(existing.id)) {
          merged.push(existing)
          seen.add(existing.id)
        }
      }
      messages.value = merged
    } finally {
      if (token === requestToken && String(toValue(boardId)) === String(targetId)) {
        loading.value = false
      }
    }
  }

  function receiveMessage(incoming: MessageOut | Record<string, any>): void {
    const targetId = toValue(boardId)
    if (targetId === undefined || targetId === null || targetId === '') return

    const normalized = normalizeMessage(incoming)
    if (!normalized) return
    if (String(normalized.board_id) !== String(targetId)) return

    appendUniqueMessages([normalized])
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
      if (isOpen.value) {
        loadHistory().catch(() => {})
      }
    },
  )

  return {
    messages,
    isOpen,
    loading,
    loadHistory,
    receiveMessage,
    sendMessage,
    open,
    close,
    toggle,
  }
}

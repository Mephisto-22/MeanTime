import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, ref, nextTick } from 'vue'
import { chatApi, type MessageOut } from '~/api/chat'
import { useBoardChat } from '~/composables/useBoardChat'

const mockMessagesBoard1: MessageOut[] = [
  {
    id: 1,
    board_id: 10,
    sender_id: 2,
    sender_name: 'Alice',
    content: 'Initial message 1',
    created_at: '2026-11-13T12:00:00Z',
  },
  {
    id: 2,
    board_id: 10,
    sender_id: 3,
    sender_name: 'Bob',
    content: 'Initial message 2',
    created_at: '2026-11-13T12:01:00Z',
  },
]

describe('useBoardChat Composable Suite (SSE Event-Driven)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes with empty messages, closed drawer, and not loading', () => {
    const scope = effectScope()
    scope.run(() => {
      const chat = useBoardChat(10)
      expect(chat.messages.value).toEqual([])
      expect(chat.isOpen.value).toBe(false)
      expect(chat.loading.value).toBe(false)
    })
    scope.stop()
  })

  it('open() sets isOpen=true and loads initial history once without starting any polling interval', async () => {
    const getSpy = vi
      .spyOn(chatApi, 'getBoardMessages')
      .mockResolvedValue([...mockMessagesBoard1])

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(10)
      chat.open()
      expect(chat.isOpen.value).toBe(true)

      await vi.advanceTimersByTimeAsync(0)
      expect(getSpy).toHaveBeenCalledTimes(1)
      expect(getSpy).toHaveBeenCalledWith(10)
      expect(chat.messages.value).toEqual(mockMessagesBoard1)

      // Advancing timers must not trigger background polling
      await vi.advanceTimersByTimeAsync(10000)
      expect(getSpy).toHaveBeenCalledTimes(1)
    })
    scope.stop()
  })

  it('close() sets isOpen=false', async () => {
    vi.spyOn(chatApi, 'getBoardMessages').mockResolvedValue([...mockMessagesBoard1])

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(10)
      chat.open()
      await vi.advanceTimersByTimeAsync(0)

      chat.close()
      expect(chat.isOpen.value).toBe(false)
    })
    scope.stop()
  })

  it('toggle() switches between open and closed states', async () => {
    vi.spyOn(chatApi, 'getBoardMessages').mockResolvedValue([])

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(10)
      chat.toggle()
      expect(chat.isOpen.value).toBe(true)
      chat.toggle()
      expect(chat.isOpen.value).toBe(false)
    })
    scope.stop()
  })

  it('receiveMessage() appends snake_case MessageOut and deduplicates by id', () => {
    const scope = effectScope()
    scope.run(() => {
      const chat = useBoardChat(10)
      chat.receiveMessage(mockMessagesBoard1[0]!)
      chat.receiveMessage(mockMessagesBoard1[0]!)
      chat.receiveMessage(mockMessagesBoard1[1]!)

      expect(chat.messages.value).toEqual(mockMessagesBoard1)
    })
    scope.stop()
  })

  it('receiveMessage() normalizes camelCase SSE payloads into MessageOut', () => {
    const scope = effectScope()
    scope.run(() => {
      const chat = useBoardChat(10)
      chat.receiveMessage({
        id: 7,
        boardId: 10,
        senderId: 2,
        senderName: 'Alice',
        content: 'From SSE camelCase',
        createdAt: '2026-11-16T18:00:00Z',
      })

      expect(chat.messages.value).toEqual([
        {
          id: 7,
          board_id: 10,
          sender_id: 2,
          sender_name: 'Alice',
          content: 'From SSE camelCase',
          created_at: '2026-11-16T18:00:00Z',
        },
      ])
    })
    scope.stop()
  })

  it('receiveMessage() ignores messages belonging to a different boardId', () => {
    const scope = effectScope()
    scope.run(() => {
      const chat = useBoardChat(10)
      chat.receiveMessage({
        id: 8,
        boardId: 999,
        senderId: 2,
        senderName: 'Alice',
        content: 'Other board message',
        createdAt: '2026-11-16T18:00:00Z',
      })

      expect(chat.messages.value).toEqual([])
    })
    scope.stop()
  })

  it('messages received via receiveMessage() while loadHistory() is in flight are preserved', async () => {
    let resolveHistory: ((val: MessageOut[]) => void) | undefined
    vi.spyOn(chatApi, 'getBoardMessages').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHistory = resolve
        }),
    )

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(10)
      const loadPromise = chat.loadHistory()

      // Live SSE message arrives before history request finishes
      chat.receiveMessage({
        id: 3,
        boardId: 10,
        senderId: 2,
        senderName: 'Alice',
        content: 'Arrived mid-flight',
        createdAt: '2026-11-13T12:02:00Z',
      })

      resolveHistory?.([...mockMessagesBoard1])
      await loadPromise

      expect(chat.messages.value.map((m) => m.id)).toEqual([1, 2, 3])
    })
    scope.stop()
  })

  it('toggling isOpen.value directly reactively triggers loadHistory', async () => {
    const getSpy = vi
      .spyOn(chatApi, 'getBoardMessages')
      .mockResolvedValue([...mockMessagesBoard1])

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(10)
      chat.isOpen.value = true
      await vi.advanceTimersByTimeAsync(0)
      expect(getSpy).toHaveBeenCalledWith(10)
      expect(chat.messages.value).toEqual(mockMessagesBoard1)
    })
    scope.stop()
  })

  it('sendMessage() trims content, calls sendBoardMessage, and appends deduplicated message', async () => {
    const sentMsg: MessageOut = {
      id: 5,
      board_id: 10,
      sender_id: 1,
      sender_name: 'Me',
      content: 'Hello world',
      created_at: '2026-11-13T12:05:00Z',
    }
    const sendSpy = vi
      .spyOn(chatApi, 'sendBoardMessage')
      .mockResolvedValue(sentMsg)

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(10)
      const res = await chat.sendMessage('  Hello world  ')

      expect(sendSpy).toHaveBeenCalledWith(10, 'Hello world')
      expect(res).toEqual(sentMsg)
      expect(chat.messages.value).toEqual([sentMsg])

      // Receiving the same message id via SSE does not duplicate it
      chat.receiveMessage(sentMsg)
      expect(chat.messages.value).toHaveLength(1)
    })
    scope.stop()
  })

  it('sendMessage() ignores empty or whitespace-only strings', async () => {
    const sendSpy = vi.spyOn(chatApi, 'sendBoardMessage')

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(10)
      const res = await chat.sendMessage('   ')
      expect(res).toBeUndefined()
      expect(sendSpy).not.toHaveBeenCalled()
    })
    scope.stop()
  })

  it('switching reactive boardId clears messages and reloads history if drawer is open', async () => {
    const board2Messages: MessageOut[] = [
      {
        id: 20,
        board_id: 99,
        sender_id: 4,
        sender_name: 'Dave',
        content: 'Board 99 message',
        created_at: '2026-11-13T13:00:00Z',
      },
    ]
    const getSpy = vi
      .spyOn(chatApi, 'getBoardMessages')
      .mockImplementation(async (id) =>
        Number(id) === 10 ? [...mockMessagesBoard1] : [...board2Messages],
      )

    const boardId = ref<number>(10)
    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(boardId)
      chat.open()
      await vi.advanceTimersByTimeAsync(0)
      expect(chat.messages.value).toEqual(mockMessagesBoard1)

      boardId.value = 99
      await nextTick()
      await vi.advanceTimersByTimeAsync(0)

      expect(getSpy).toHaveBeenLastCalledWith(99)
      expect(chat.messages.value).toEqual(board2Messages)
    })
    scope.stop()
  })

  it('switching boardId while drawer is closed invalidates cached messages and loads new board history upon reopening', async () => {
    const board2Messages: MessageOut[] = [
      {
        id: 20,
        board_id: 99,
        sender_id: 4,
        sender_name: 'Dave',
        content: 'Board 99 message',
        created_at: '2026-11-13T13:00:00Z',
      },
    ]
    const getSpy = vi
      .spyOn(chatApi, 'getBoardMessages')
      .mockImplementation(async (id) =>
        Number(id) === 10 ? [...mockMessagesBoard1] : [...board2Messages],
      )

    const boardId = ref<number>(10)
    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(boardId)
      chat.open()
      await vi.advanceTimersByTimeAsync(0)
      expect(chat.messages.value).toEqual(mockMessagesBoard1)

      chat.close()
      boardId.value = 99
      await nextTick()

      expect(chat.messages.value).toEqual([])
      expect(chat.loading.value).toBe(false)

      chat.open()
      await vi.advanceTimersByTimeAsync(0)
      expect(getSpy).toHaveBeenLastCalledWith(99)
      expect(chat.messages.value).toEqual(board2Messages)
    })
    scope.stop()
  })

  it('stale loadHistory response from previous boardId is ignored after rapid board switch', async () => {
    let resolveBoard10: ((val: MessageOut[]) => void) | undefined
    vi.spyOn(chatApi, 'getBoardMessages').mockImplementation((id) => {
      if (Number(id) === 10) {
        return new Promise((resolve) => {
          resolveBoard10 = resolve
        })
      }
      return Promise.resolve([
        {
          id: 99,
          board_id: 20,
          sender_id: 1,
          sender_name: 'Me',
          content: 'Board 20 message',
          created_at: '2026-11-13T14:00:00Z',
        },
      ])
    })

    const boardId = ref<number>(10)
    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(boardId)
      const p1 = chat.loadHistory()

      // Switch to board 20 before board 10 resolves
      boardId.value = 20
      await nextTick()
      await chat.loadHistory()

      // Now resolve board 10's stale request
      resolveBoard10?.([...mockMessagesBoard1])
      await p1

      expect(chat.messages.value.map((m) => m.board_id)).toEqual([20])
    })
    scope.stop()
  })
})

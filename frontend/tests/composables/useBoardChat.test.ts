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

describe('useBoardChat Composable Suite', () => {
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
      expect(chat.isPolling.value).toBe(false)
    })
    scope.stop()
  })

  it('open() sets isOpen=true, loads initial history, and starts 2.5s polling timer', async () => {
    const getSpy = vi
      .spyOn(chatApi, 'getBoardMessages')
      .mockResolvedValue([...mockMessagesBoard1])

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(10)
      chat.open()
      expect(chat.isOpen.value).toBe(true)

      await vi.advanceTimersByTimeAsync(0)
      expect(getSpy).toHaveBeenCalledWith(10)
      expect(chat.messages.value).toEqual(mockMessagesBoard1)

      // Advance 2.5s to trigger differential poll
      getSpy.mockResolvedValueOnce([
        {
          id: 3,
          board_id: 10,
          sender_id: 2,
          sender_name: 'Alice',
          content: 'Polled message 3',
          created_at: '2026-11-13T12:02:00Z',
        },
      ])
      await vi.advanceTimersByTimeAsync(2500)
      expect(getSpy).toHaveBeenLastCalledWith(10, { since_id: 2 })
      expect(chat.messages.value).toHaveLength(3)
    })
    scope.stop()
  })

  it('close() sets isOpen=false and stops polling timer', async () => {
    const getSpy = vi
      .spyOn(chatApi, 'getBoardMessages')
      .mockResolvedValue([...mockMessagesBoard1])

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(10)
      chat.open()
      await vi.advanceTimersByTimeAsync(0)
      expect(getSpy).toHaveBeenCalledTimes(1)

      chat.close()
      expect(chat.isOpen.value).toBe(false)

      await vi.advanceTimersByTimeAsync(5000)
      expect(getSpy).toHaveBeenCalledTimes(1)
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

  it('pollMessages() fetches with since_id of last message and appends new messages without duplicates', async () => {
    const getSpy = vi
      .spyOn(chatApi, 'getBoardMessages')
      .mockResolvedValueOnce([...mockMessagesBoard1])
      .mockResolvedValueOnce([
        mockMessagesBoard1[1]!,
        {
          id: 3,
          board_id: 10,
          sender_id: 2,
          sender_name: 'Alice',
          content: 'New message',
          created_at: '2026-11-13T12:02:00Z',
        },
      ])

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(10)
      await chat.loadHistory()
      await chat.pollMessages()

      expect(getSpy).toHaveBeenLastCalledWith(10, { since_id: 2 })
      expect(chat.messages.value.map((m) => m.id)).toEqual([1, 2, 3])
    })
    scope.stop()
  })

  it('pollMessages() skips concurrent execution when isPolling is true', async () => {
    let resolvePoll: ((val: MessageOut[]) => void) | undefined
    const getSpy = vi.spyOn(chatApi, 'getBoardMessages').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePoll = resolve
        }),
    )

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(10)
      const p1 = chat.pollMessages()
      const p2 = chat.pollMessages()

      expect(getSpy).toHaveBeenCalledTimes(1)
      resolvePoll?.([])
      await Promise.all([p1, p2])
      expect(chat.isPolling.value).toBe(false)
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

      // Calling poll that returns the same id should not duplicate it
      vi.spyOn(chatApi, 'getBoardMessages').mockResolvedValueOnce([sentMsg])
      await chat.pollMessages()
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

  it('stops polling timer automatically when scope/component is disposed', async () => {
    const getSpy = vi
      .spyOn(chatApi, 'getBoardMessages')
      .mockResolvedValue([...mockMessagesBoard1])

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useBoardChat(10)
      chat.open()
      await vi.advanceTimersByTimeAsync(0)
    })

    const callsBeforeStop = getSpy.mock.calls.length
    scope.stop()

    await vi.advanceTimersByTimeAsync(10000)
    expect(getSpy).toHaveBeenCalledTimes(callsBeforeStop)
  })
})

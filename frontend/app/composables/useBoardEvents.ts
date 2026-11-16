
import { toCamelCase } from '~/utils/case'

export interface BoardEvent {
  id: string
  type: string
  boardId: number
  actorId: number
  timestamp: string
  data: Record<string, any>
}

interface UseBoardEventsOptions {
  boardId: string | number
  onEvent: (event: BoardEvent) => void
  onReconnect?: () => Promise<void> | void
}

interface ParsedSSEMessage {
  id?: string
  event?: string
  data?: string
  retry?: number
}

const parseSSEMessage = (message: string): ParsedSSEMessage => {
  const parsed: ParsedSSEMessage = {}

  for (const line of message.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue

    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? '' : line.slice(separator + 1)

    if (value.startsWith(' ')) {
      value = value.slice(1)
    }

    switch (field) {
      case 'id':
        parsed.id = value
        break
      case 'event':
        parsed.event = value
        break
      case 'data':
        parsed.data = parsed.data
          ? `${parsed.data}\n${value}`
          : value
        break
      case 'retry':
        parsed.retry = Number(value)
        break
    }
  }

  return parsed
}

export const useBoardEvents = (options: UseBoardEventsOptions) => {
  const auth = useAuthStore()

  let controller: AbortController | null = null
  let running = false
  let reconnectDelay = 1000
  let hasConnected = false

  const stop = (): void => {
    running = false
    controller?.abort()
    controller = null
  }

  const refreshTokenIfNeeded = async (): Promise<string | null> => {
    if (!auth.accessToken) {
      return null
    }

    return auth.accessToken
  }

  const connect = async (): Promise<void> => {
    if (running) return

    running = true
    reconnectDelay = 1000

    while (running) {
      controller = new AbortController()

      try {
        let token = await refreshTokenIfNeeded()

        if (!token) {
          running = false
          break
        }

        const url = `/api/kanban/boards/${options.boardId}/events`

        let response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
          cache: 'no-store',
        })

        // Refresh an expired token and retry the connection once.
        if (response.status === 401) {
          await auth.refresh()
          token = await refreshTokenIfNeeded()

          if (!token) {
            running = false
            break
          }

          response = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'text/event-stream',
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
            cache: 'no-store',
          })
        }

        if (!response.ok) {
          if (response.status === 401 || response.status === 403 || response.status === 404) {
            running = false
            break
          }

          throw new Error(`SSE connection failed: ${response.status}`)
        }

        if (!response.body) {
          throw new Error('SSE response did not contain a readable stream.')
        }

        // A successful response means the stream has connected.
        if (hasConnected) {
          await options.onReconnect?.()
        }

        hasConnected = true
        reconnectDelay = 1000

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (running) {
            const { value, done } = await reader.read()

            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // SSE messages are separated by a blank line.
            const messages = buffer.split(/\r?\n\r?\n/)
            buffer = messages.pop() ?? ''

            for (const rawMessage of messages) {
              const parsed = parseSSEMessage(rawMessage)

              if (!parsed.data) continue

              try {
                const payload = JSON.parse(parsed.data)
                const event = toCamelCase<BoardEvent>(payload)

                // The backend sends the event type as the SSE event name
                // and also includes it in the JSON event envelope.
                if (!event.type && parsed.event) {
                  event.type = parsed.event
                }

                options.onEvent(event)
              } catch (error) {
                console.error('Unable to parse board event:', error)
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      } catch (error: any) {
        if (error.name === 'AbortError' || !running) {
          break
        }

        console.error('Board SSE connection error:', error)
      }

      if (!running) break

      // Reconnect with exponential backoff, capped at 15 seconds.
      await new Promise(resolve => setTimeout(resolve, reconnectDelay))
      reconnectDelay = Math.min(reconnectDelay * 2, 15000)
    }

    controller = null
  }

  return {
    connect,
    stop,
  }
}

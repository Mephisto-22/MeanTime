import { apiService } from '~/services/ApiService'

export interface MessageOut {
  id: number
  board_id: number
  sender_id: number
  sender_name: string
  content: string
  created_at: string
}

export const chatApi = {
  getBoardMessages(
    boardId: string | number,
    params?: { since_id?: number; limit?: number },
  ): Promise<MessageOut[]> {
    const query = new URLSearchParams()
    if (params?.since_id !== undefined) query.set('since_id', String(params.since_id))
    if (params?.limit !== undefined) query.set('limit', String(params.limit))
    const qs = query.toString()
    return apiService.get<MessageOut[]>(
      `/api/chat/boards/${boardId}/messages${qs ? `?${qs}` : ''}`,
    )
  },

  sendBoardMessage(
    boardId: string | number,
    content: string,
  ): Promise<MessageOut> {
    return apiService.post<MessageOut>(
      `/api/chat/boards/${boardId}/messages`,
      { content },
    )
  },
}

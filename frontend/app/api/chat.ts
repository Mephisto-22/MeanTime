import { apiService } from '~/services/ApiService'

export interface ParticipantOut {
  id: number
  user_id: number
  display_name: string
  email: string
  status: string
  invited_by_id?: number | null
}

export interface LastMessageOut {
  content: string
  sender_name: string
  created_at: string
}

export interface ConversationOut {
  id: number
  type: 'DIRECT' | 'GROUP' | string
  title: string
  updated_at: string
  other_participants: ParticipantOut[]
  last_message?: LastMessageOut | null
  unread_count: number
}

export interface PendingInviteOut {
  id: number
  conversation_id: number
  conversation_type: string
  conversation_title: string
  invited_by_name: string
  created_at: string
}

export interface ConversationListResponse {
  conversations: ConversationOut[]
  pending_invites: PendingInviteOut[]
}

export interface ConversationDetailOut {
  id: number
  type: 'DIRECT' | 'GROUP' | string
  title: string
  created_at: string
  updated_at: string
  is_active: boolean
  participants: ParticipantOut[]
}

export interface CreateConversationIn {
  type: 'DIRECT' | 'GROUP' | string
  participant_ids: number[]
  title?: string
}

export interface InviteFriendsIn {
  user_ids: number[]
}

export interface UpdateConversationIn {
  title: string
}

export interface MessageOut {
  id: number
  conversation_id: number
  sender_id: number
  sender_name: string
  content: string
  created_at: string
}

export interface SendMessageIn {
  content: string
}

export interface ClearHistoryResponse {
  success: boolean
  cleared_at: string
}

export interface MarkReadResponse {
  success: boolean
  last_read_at: string
}

export interface ActionResponse {
  success: boolean
  detail?: string | null
}

export class ChatApi {
  readonly endpoint = '/api/chat'

  getConversations(): Promise<ConversationListResponse> {
    return apiService.get<ConversationListResponse>(`${this.endpoint}/conversations`)
  }

  createConversation(payload: CreateConversationIn): Promise<ConversationDetailOut> {
    return apiService.post<ConversationDetailOut>(`${this.endpoint}/conversations`, payload)
  }

  getConversation(id: number): Promise<ConversationDetailOut> {
    return apiService.get<ConversationDetailOut>(`${this.endpoint}/conversations/${id}`)
  }

  updateConversation(id: number, payload: UpdateConversationIn): Promise<ConversationDetailOut> {
    return apiService.patch<ConversationDetailOut>(`${this.endpoint}/conversations/${id}`, payload)
  }

  inviteFriends(id: number, userIds: number[]): Promise<ConversationDetailOut> {
    return apiService.post<ConversationDetailOut>(`${this.endpoint}/conversations/${id}/invites`, { user_ids: userIds })
  }

  acceptInvite(id: number): Promise<ConversationDetailOut | ActionResponse> {
    return apiService.post<ConversationDetailOut | ActionResponse>(`${this.endpoint}/conversations/${id}/accept`)
  }

  declineInvite(id: number): Promise<ActionResponse> {
    return apiService.post<ActionResponse>(`${this.endpoint}/conversations/${id}/decline`)
  }

  leaveConversation(id: number): Promise<ActionResponse> {
    return apiService.post<ActionResponse>(`${this.endpoint}/conversations/${id}/leave`)
  }

  getMessages(id: number, sinceId?: number): Promise<MessageOut[]> {
    const query = sinceId !== undefined ? { since_id: sinceId } : undefined
    return apiService.get<MessageOut[]>(`${this.endpoint}/conversations/${id}/messages`, query)
  }

  sendMessage(id: number, content: string): Promise<MessageOut> {
    return apiService.post<MessageOut>(`${this.endpoint}/conversations/${id}/messages`, { content })
  }

  clearHistory(id: number): Promise<ClearHistoryResponse> {
    return apiService.post<ClearHistoryResponse>(`${this.endpoint}/conversations/${id}/clear`)
  }

  markAsRead(id: number): Promise<MarkReadResponse> {
    return apiService.post<MarkReadResponse>(`${this.endpoint}/conversations/${id}/read`)
  }
}

export const chatApi = new ChatApi()
export default chatApi

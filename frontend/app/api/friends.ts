import { apiService } from '~/services/ApiService'

export interface UserOut {
  id: number
  email: string
  display_name: string
  timezone: string
  created_at: string
}

export type RelationshipStatus = 'none' | 'friend' | 'pending_incoming' | 'pending_outgoing'

export interface UserSearchResultOut {
  id: number
  email: string
  display_name: string
  timezone: string
  relationship_status: RelationshipStatus
}

export interface FriendRequestOut {
  id: number
  user: UserOut
  created_at: string
}

export interface FriendRequestsListOut {
  incoming: FriendRequestOut[]
  outgoing: FriendRequestOut[]
}

export class FriendsApi {
  readonly endpoint = '/api/users'

  getFriends(): Promise<UserOut[]> {
    return apiService.get<UserOut[]>(`${this.endpoint}/friends`)
  }

  unfriend(userId: number): Promise<void> {
    return apiService.delete<void>(`${this.endpoint}/friends/${userId}`)
  }

  getRequests(): Promise<FriendRequestsListOut> {
    return apiService.get<FriendRequestsListOut>(`${this.endpoint}/friends/requests`)
  }

  sendRequest(userId: number): Promise<FriendRequestOut> {
    return apiService.post<FriendRequestOut>(`${this.endpoint}/friends/requests/${userId}`)
  }

  acceptRequest(userId: number): Promise<void> {
    return apiService.post<void>(`${this.endpoint}/friends/requests/${userId}/accept`)
  }

  declineRequest(userId: number): Promise<void> {
    return apiService.post<void>(`${this.endpoint}/friends/requests/${userId}/decline`)
  }

  cancelRequest(userId: number): Promise<void> {
    return apiService.delete<void>(`${this.endpoint}/friends/requests/${userId}`)
  }

  searchUser(query: string): Promise<UserSearchResultOut[]> {
    return apiService.get<UserSearchResultOut[]>(`${this.endpoint}/search?q=${encodeURIComponent(query)}`)
  }

  getBlocked(): Promise<UserOut[]> {
    return apiService.get<UserOut[]>(`${this.endpoint}/blocks`)
  }

  blockUser(userId: number): Promise<void> {
    return apiService.post<void>(`${this.endpoint}/blocks/${userId}`)
  }

  unblockUser(userId: number): Promise<void> {
    return apiService.delete<void>(`${this.endpoint}/blocks/${userId}`)
  }
}

export const friendsApi = new FriendsApi()

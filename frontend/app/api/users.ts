import { apiService } from '~/services/ApiService'
import type { User } from '~/stores/auth'

export interface UserUpdatePayload {
  display_name?: string
  timezone?: string
}

export interface DeleteAccountPayload {
  password: string
}

export class UsersApi {
  readonly endpoint = '/api/users'

  updateMe(payload: UserUpdatePayload): Promise<User> {
    return apiService.patch<User>(`${this.endpoint}/me`, payload)
  }

  deleteMe(payload: DeleteAccountPayload): Promise<{ detail: string }> {
    return apiService.delete<{ detail: string }>(`${this.endpoint}/me`, payload)
  }
}

export const usersApi = new UsersApi()

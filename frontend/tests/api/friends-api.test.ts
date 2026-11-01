import { beforeEach, describe, expect, it, vi } from 'vitest'
import { friendsApi, type FriendRequestOut, type FriendRequestsListOut, type UserOut, type UserSearchResultOut } from '~/api/friends'
import { apiService } from '~/services/ApiService'

const mockFetch = vi.fn()

vi.mock('#build/fetch.mjs', () => ({
  $fetch: (...args: any[]) => mockFetch(...args),
}))

describe('FriendsApi Contract Suite', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.restoreAllMocks()
  })

  describe('Friend list and relationship operations', () => {
    it('getFriends routes to GET /api/users/friends', async () => {
      const mockFriends: UserOut[] = [
        {
          id: 2,
          email: 'bob@example.com',
          display_name: 'Bob',
          timezone: 'UTC',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]
      const getSpy = vi.spyOn(apiService, 'get').mockResolvedValue(mockFriends)

      const result = await friendsApi.getFriends()

      expect(getSpy).toHaveBeenCalledTimes(1)
      expect(getSpy).toHaveBeenCalledWith('/api/users/friends')
      expect(result).toEqual(mockFriends)
    })

    it('unfriend routes to DELETE /api/users/friends/:userId', async () => {
      const deleteSpy = vi.spyOn(apiService, 'delete').mockResolvedValue(undefined as any)

      await friendsApi.unfriend(42)

      expect(deleteSpy).toHaveBeenCalledTimes(1)
      expect(deleteSpy).toHaveBeenCalledWith('/api/users/friends/42')
    })
  })

  describe('Friend request operations', () => {
    it('getRequests routes to GET /api/users/friends/requests', async () => {
      const mockRequests: FriendRequestsListOut = {
        incoming: [
          {
            id: 1,
            user: {
              id: 3,
              email: 'charlie@example.com',
              display_name: 'Charlie',
              timezone: 'UTC',
              created_at: '2026-01-01T00:00:00Z',
            },
            created_at: '2026-01-02T00:00:00Z',
          },
        ],
        outgoing: [],
      }
      const getSpy = vi.spyOn(apiService, 'get').mockResolvedValue(mockRequests)

      const result = await friendsApi.getRequests()

      expect(getSpy).toHaveBeenCalledTimes(1)
      expect(getSpy).toHaveBeenCalledWith('/api/users/friends/requests')
      expect(result).toEqual(mockRequests)
    })

    it('sendRequest routes to POST /api/users/friends/requests/:userId', async () => {
      const mockRequestOut: FriendRequestOut = {
        id: 10,
        user: {
          id: 4,
          email: 'dana@example.com',
          display_name: 'Dana',
          timezone: 'UTC',
          created_at: '2026-01-01T00:00:00Z',
        },
        created_at: '2026-01-02T00:00:00Z',
      }
      const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue(mockRequestOut)

      const result = await friendsApi.sendRequest(4)

      expect(postSpy).toHaveBeenCalledTimes(1)
      expect(postSpy).toHaveBeenCalledWith('/api/users/friends/requests/4')
      expect(result).toEqual(mockRequestOut)
    })

    it('acceptRequest routes to POST /api/users/friends/requests/:userId/accept', async () => {
      const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue(undefined as any)

      await friendsApi.acceptRequest(5)

      expect(postSpy).toHaveBeenCalledTimes(1)
      expect(postSpy).toHaveBeenCalledWith('/api/users/friends/requests/5/accept')
    })

    it('declineRequest routes to POST /api/users/friends/requests/:userId/decline', async () => {
      const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue(undefined as any)

      await friendsApi.declineRequest(6)

      expect(postSpy).toHaveBeenCalledTimes(1)
      expect(postSpy).toHaveBeenCalledWith('/api/users/friends/requests/6/decline')
    })

    it('cancelRequest routes to DELETE /api/users/friends/requests/:userId', async () => {
      const deleteSpy = vi.spyOn(apiService, 'delete').mockResolvedValue(undefined as any)

      await friendsApi.cancelRequest(7)

      expect(deleteSpy).toHaveBeenCalledTimes(1)
      expect(deleteSpy).toHaveBeenCalledWith('/api/users/friends/requests/7')
    })
  })

  describe('User search operations', () => {
    it('searchUser routes to GET /api/users/search?q=:encodedQuery', async () => {
      const mockSearchResults: UserSearchResultOut[] = [
        {
          id: 8,
          email: 'alice+test@example.com',
          display_name: 'Alice Cooper',
          timezone: 'America/New_York',
          relationship_status: 'none',
        },
      ]
      const getSpy = vi.spyOn(apiService, 'get').mockResolvedValue(mockSearchResults)

      const result = await friendsApi.searchUser('Alice Cooper')

      expect(getSpy).toHaveBeenCalledTimes(1)
      expect(getSpy).toHaveBeenCalledWith('/api/users/search?q=Alice%20Cooper')
      expect(result).toEqual(mockSearchResults)
    })

    it('searchUser properly encodes special characters in search query', async () => {
      const getSpy = vi.spyOn(apiService, 'get').mockResolvedValue([])

      await friendsApi.searchUser('user@example.com & co')

      expect(getSpy).toHaveBeenCalledWith('/api/users/search?q=user%40example.com%20%26%20co')
    })
  })

  describe('Block and unblock operations', () => {
    it('getBlocked routes to GET /api/users/blocks', async () => {
      const mockBlocked: UserOut[] = [
        {
          id: 9,
          email: 'spammer@example.com',
          display_name: 'Spammer',
          timezone: 'UTC',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]
      const getSpy = vi.spyOn(apiService, 'get').mockResolvedValue(mockBlocked)

      const result = await friendsApi.getBlocked()

      expect(getSpy).toHaveBeenCalledTimes(1)
      expect(getSpy).toHaveBeenCalledWith('/api/users/blocks')
      expect(result).toEqual(mockBlocked)
    })

    it('blockUser routes to POST /api/users/blocks/:userId', async () => {
      const postSpy = vi.spyOn(apiService, 'post').mockResolvedValue(undefined as any)

      await friendsApi.blockUser(10)

      expect(postSpy).toHaveBeenCalledTimes(1)
      expect(postSpy).toHaveBeenCalledWith('/api/users/blocks/10')
    })

    it('unblockUser routes to DELETE /api/users/blocks/:userId', async () => {
      const deleteSpy = vi.spyOn(apiService, 'delete').mockResolvedValue(undefined as any)

      await friendsApi.unblockUser(11)

      expect(deleteSpy).toHaveBeenCalledTimes(1)
      expect(deleteSpy).toHaveBeenCalledWith('/api/users/blocks/11')
    })
  })

  describe('Integration with ApiService authentication and headers', () => {
    it('dispatches bearer authorization header and correct verb for friends endpoints', async () => {
      const fetchCalls: Array<{ url: string; options: any }> = []
      mockFetch.mockImplementation(async (url: string, options: any) => {
        fetchCalls.push({ url, options })
        return []
      })

      apiService.setAuthHandler({
        getAccessToken: () => 'friends-test-token',
        async refresh() {},
        async expireSession() {},
      })

      await friendsApi.getFriends()
      const lastCall = fetchCalls[fetchCalls.length - 1]
      expect(lastCall.options.method).toBe('GET')
      expect(lastCall.options.headers.Authorization).toBe('Bearer friends-test-token')
      expect(lastCall.url).toBe('/api/users/friends')
    })
  })
})

import { afterEach, expect, it, vi } from 'vitest'
import { authApi } from '~/api/auth'
import { apiService } from '~/services/ApiService'

afterEach(() => vi.restoreAllMocks())

it('posts logout tokens without automatic refresh and with a bounded timeout', async () => {
  const post = vi.spyOn(apiService, 'post').mockResolvedValue({ detail: 'Logged out' })
  await authApi.logout('refresh', 'access')
  expect(post).toHaveBeenCalledWith('/api/auth/logout', { refresh_token: 'refresh', access_token: 'access' }, { auth: false, timeout: 10000 })
  await authApi.logout('refresh')
  expect(post).toHaveBeenLastCalledWith('/api/auth/logout', { refresh_token: 'refresh' }, { auth: false, timeout: 10000 })
})

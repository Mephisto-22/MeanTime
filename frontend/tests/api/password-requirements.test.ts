import { afterEach, expect, it, vi } from 'vitest'
import { authApi } from '~/api/auth'
import { apiService } from '~/services/ApiService'

afterEach(() => vi.restoreAllMocks())

it('checks requirements with the backend using a public POST and no confirmation value', async () => {
  const post = vi.spyOn(apiService, 'post').mockResolvedValue({ requirements: [] })
  const candidate = { password: 'Candidate982!', email: 'user@example.com', display_name: 'Name' }
  await authApi.passwordRequirements(candidate)
  expect(post).toHaveBeenCalledWith('/api/auth/password-requirements', candidate, { auth: false })
})

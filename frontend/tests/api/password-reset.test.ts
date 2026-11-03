import { afterEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '~/api/auth'
import { apiService } from '~/services/ApiService'

afterEach(() => vi.restoreAllMocks())

describe('Password reset API', () => {
  it('uses public endpoints and the exact backend payloads', async () => {
    const post = vi.spyOn(apiService, 'post').mockResolvedValue({ detail: 'OK' })
    const link = { uid: 'MQ', token: 'test-token' }
    await authApi.requestPasswordReset('user@example.com')
    await authApi.validatePasswordReset(link)
    await authApi.confirmPasswordReset({ ...link, password: 'new', password_confirm: 'new' })
    expect(post.mock.calls).toEqual([
      ['/api/auth/password-reset', { email: 'user@example.com' }, { auth: false }],
      ['/api/auth/password-reset/validate', link, { auth: false }],
      ['/api/auth/password-reset/confirm', { ...link, password: 'new', password_confirm: 'new' }, { auth: false }],
    ])
  })
})

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getClientTimezone } from '~/components/RegistrationForm.vue'

describe('getClientTimezone', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the system timezone when Intl returns a valid timezone string', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'America/New_York' }),
    } as unknown as Intl.DateTimeFormat)

    expect(getClientTimezone()).toBe('America/New_York')
  })

  it('falls back to UTC when resolvedOptions().timeZone is empty or undefined', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: '' }),
    } as unknown as Intl.DateTimeFormat)

    expect(getClientTimezone()).toBe('UTC')
  })

  it('falls back to UTC when Intl.DateTimeFormat throws an error', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('Intl disabled')
    })

    expect(getClientTimezone()).toBe('UTC')
  })
})

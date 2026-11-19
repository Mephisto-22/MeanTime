// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getClientTimezone as getClientTimezoneFromRegistration } from '~/components/RegistrationForm.vue'
import { getAvailableTimezones, getClientTimezone } from '~/utils/timezone'

describe('getClientTimezone', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('re-exports getClientTimezone from RegistrationForm.vue', () => {
    expect(getClientTimezoneFromRegistration).toBe(getClientTimezone)
  })

  it('returns the system timezone when Intl returns a valid timezone string', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'America/New_York' }),
    } as unknown as Intl.DateTimeFormat)

    expect(getClientTimezone()).toBe('America/New_York')
  })

  it('normalizes legacy ICU timezone IDs returned by Intl.DateTimeFormat to canonical IANA IDs', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'Asia/Calcutta' }),
    } as unknown as Intl.DateTimeFormat)

    expect(getClientTimezone()).toBe('Asia/Kolkata')
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

describe('getAvailableTimezones', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a sorted list of unique IANA timezones from Intl.supportedValuesOf and always includes UTC', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Europe/London', 'America/New_York', 'America/Chicago'])

    expect(getAvailableTimezones()).toEqual([
      'America/Chicago',
      'America/New_York',
      'Europe/London',
      'UTC',
    ])
  })

  it('includes extra timezones without duplicates and ignores blank or nullish entries', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['America/New_York', 'UTC'])

    expect(getAvailableTimezones(['UTC', 'America/Indiana/Indianapolis', '', '   ', null, undefined])).toEqual([
      'America/Indiana/Indianapolis',
      'America/New_York',
      'UTC',
    ])
  })

  it('falls back to UTC (plus valid extra timezones) when Intl.supportedValuesOf throws', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
      throw new Error('Unsupported')
    })

    expect(getAvailableTimezones(['America/New_York'])).toEqual(['America/New_York', 'UTC'])
  })

  it('normalizes all 18 legacy ICU/CLDR timezone IDs to modern canonical IANA IDs accepted by backend zoneinfo', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue([
      'Africa/Asmera',
      'America/Buenos_Aires',
      'America/Catamarca',
      'America/Cordoba',
      'America/Godthab',
      'America/Indianapolis',
      'America/Jujuy',
      'America/Louisville',
      'America/Mendoza',
      'Asia/Calcutta',
      'Asia/Katmandu',
      'Asia/Rangoon',
      'Asia/Saigon',
      'Atlantic/Faeroe',
      'Europe/Kiev',
      'Pacific/Enderbury',
      'Pacific/Ponape',
      'Pacific/Truk',
    ])

    expect(getAvailableTimezones()).toEqual([
      'Africa/Asmara',
      'America/Argentina/Buenos_Aires',
      'America/Argentina/Catamarca',
      'America/Argentina/Cordoba',
      'America/Argentina/Jujuy',
      'America/Argentina/Mendoza',
      'America/Indiana/Indianapolis',
      'America/Kentucky/Louisville',
      'America/Nuuk',
      'Asia/Ho_Chi_Minh',
      'Asia/Kathmandu',
      'Asia/Kolkata',
      'Asia/Yangon',
      'Atlantic/Faroe',
      'Europe/Kyiv',
      'Pacific/Chuuk',
      'Pacific/Kanton',
      'Pacific/Pohnpei',
      'UTC',
    ])
  })
})


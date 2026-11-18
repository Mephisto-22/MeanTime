const LEGACY_IANA_TIMEZONE_MAP: Record<string, string> = {
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
}

export function normalizeTimezone(timezone: string): string {
  const trimmed = timezone.trim()
  return LEGACY_IANA_TIMEZONE_MAP[trimmed] ?? trimmed
}

export function getClientTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof tz === 'string' && tz.trim() ? normalizeTimezone(tz) : 'UTC'
  } catch {
    return 'UTC'
  }
}

export function getAvailableTimezones(extraTimezones: Array<string | null | undefined> = []): string[] {
  const zones = new Set<string>(['UTC'])

  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      for (const tz of Intl.supportedValuesOf('timeZone')) {
        if (typeof tz === 'string' && tz.trim()) {
          zones.add(normalizeTimezone(tz))
        }
      }
    }
  } catch {
    // Fall back to UTC plus any valid extra timezones
  }

  for (const tz of extraTimezones) {
    if (typeof tz === 'string' && tz.trim()) {
      zones.add(normalizeTimezone(tz))
    }
  }

  return Array.from(zones).sort()
}

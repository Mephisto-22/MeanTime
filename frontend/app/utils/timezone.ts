export function getClientTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof tz === 'string' && tz.trim() ? tz.trim() : 'UTC'
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
          zones.add(tz.trim())
        }
      }
    }
  } catch {
    // Fall back to UTC plus any valid extra timezones
  }

  for (const tz of extraTimezones) {
    if (typeof tz === 'string' && tz.trim()) {
      zones.add(tz.trim())
    }
  }

  return Array.from(zones).sort()
}

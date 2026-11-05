export function getClientTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof tz === 'string' && tz.trim() ? tz.trim() : 'UTC'
  } catch {
    return 'UTC'
  }
}

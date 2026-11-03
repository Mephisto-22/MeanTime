/** Extract messages only, never validation inputs, request bodies, or stack traces. */
function messages(value: unknown): string[] {
  if (typeof value === 'string') return [value.replace(/^Value error, /, '').slice(0, 300)]
  if (Array.isArray(value)) return value.flatMap(messages)
  if (!value || typeof value !== 'object') return []
  const item = value as Record<string, unknown>
  if (typeof item.msg === 'string') {
    const field = Array.isArray(item.loc) ? item.loc.filter(part => part !== 'body' && part !== 'payload').join(' ').replaceAll('_', ' ') : ''
    return [`${field ? `${field}: ` : ''}${item.msg.replace(/^Value error, /, '')}`.slice(0, 300)]
  }
  for (const key of ['detail', 'message', 'errors']) {
    const result = messages(item[key])
    if (result.length) return result
  }
  return []
}

export function getErrorMessage(error: unknown, fallback = 'Please try again.'): string {
  if (!error) return fallback
  const item = error as { statusCode?: number; data?: unknown; cause?: unknown; message?: string }
  if (item.statusCode && item.statusCode >= 500) return 'The server could not complete the request. Please try again.'
  const details = messages(item.data)
  if (details.length) return [...new Set(details)].join(' ').slice(0, 700)
  if (item.cause) return getErrorMessage(item.cause, fallback)
  const text = messages(error)
  if (text.length && !/fetch failed|failed to fetch|networkerror|network request failed/i.test(text.join(' '))) return text.join(' ').slice(0, 700)
  return fallback
}

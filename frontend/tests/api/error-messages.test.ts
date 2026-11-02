import { describe, expect, it } from 'vitest'
import { getErrorMessage } from '~/utils/errors'

describe('Safe, consistent error messages', () => {
  it('formats Ninja/Pydantic validation lists without leaking submitted values', () => {
    const error = { statusCode: 422, data: { detail: [
      { loc: ['body', 'payload', 'email'], msg: 'Enter a valid email address.', input: 'secret-input' },
      { loc: ['body', 'display_name'], msg: 'Value error, Display name is required.' },
    ] } }
    expect(getErrorMessage(error)).toBe('email: Enter a valid email address. display name: Display name is required.')
    expect(getErrorMessage(error)).not.toContain('secret-input')
    expect(getErrorMessage(error)).not.toContain('[object Object]')
  })

  it('supports API detail strings, errors arrays, and ordinary errors', () => {
    expect(getErrorMessage({ data: { detail: 'Invalid credentials' } })).toBe('Invalid credentials')
    expect(getErrorMessage({ data: { errors: ['Missing title', 'Missing title'] } })).toBe('Missing title')
    expect(getErrorMessage(new Error('Save failed'))).toBe('Save failed')
    expect(getErrorMessage({ data: { input: 'secret' } })).toBe('Please try again.')
  })

  it('uses safe messages for server and network failures', () => {
    expect(getErrorMessage({ statusCode: 500, data: { detail: 'Database password=secret' } })).not.toContain('secret')
    expect(getErrorMessage(new Error('Failed to fetch'), 'Unable to reach the server.')).toBe('Unable to reach the server.')
    expect(getErrorMessage(null, 'Fallback')).toBe('Fallback')
  })
})

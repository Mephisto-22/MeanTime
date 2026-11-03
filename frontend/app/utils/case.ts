/**
 * Case conversion utilities for normalizing API payloads and responses
 * between backend (snake_case) and frontend (camelCase) conventions.
 */

function isPlainObject(value: any): boolean {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/**
 * Converts a snake_case identifier to camelCase.
 * Preserves leading underscores and non-identifier characters.
 * Already-camelCase strings are preserved.
 */
export function snakeToCamel(str: string): string {
  const leadingUnderscores = str.match(/^_+/)?.[0] || ''
  const remainder = str.slice(leadingUnderscores.length)
  const converted = remainder.replace(/_([a-z0-9])/gi, (_, letter) => letter.toUpperCase())
  return leadingUnderscores + converted
}

/**
 * Converts a camelCase identifier to snake_case.
 * Already-snake_case strings are preserved.
 */
export function camelToSnake(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

/**
 * Recursively transforms all object keys using the provided mapping function.
 * Arrays and plain nested objects are traversed; primitives, null/undefined,
 * Dates, and special object types (FormData, Blob, etc.) are left untouched.
 */
export function deepTransformKeys<T = any>(obj: any, transform: (key: string) => string): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepTransformKeys(item, transform)) as unknown as T
  }

  if (isPlainObject(obj)) {
    const result: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[transform(key)] = deepTransformKeys(value, transform)
    }
    return result as T
  }

  return obj
}

/**
 * Recursively converts object keys from snake_case to camelCase.
 */
export function toCamelCase<T = any>(obj: any): T {
  return deepTransformKeys<T>(obj, snakeToCamel)
}

/**
 * Recursively converts object keys from camelCase to snake_case.
 */
export function toSnakeCase<T = any>(obj: any): T {
  return deepTransformKeys<T>(obj, camelToSnake)
}

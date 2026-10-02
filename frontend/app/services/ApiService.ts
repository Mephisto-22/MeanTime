/**
 * ApiService provides a centralized HTTP client wrapper around Nuxt's $fetch.
 * It encapsulates standard HTTP methods (GET, POST, PUT, DELETE), manages headers,
 * serializes request payloads and query parameters, and normalizes error handling.
 */

export interface ApiRequestOptions extends Omit<Parameters<typeof $fetch>[1], 'method' | 'body' | 'query'> {
  headers?: Record<string, string>
}

export class ApiError extends Error {
  statusCode?: number
  data?: any

  constructor(message: string, statusCode?: number, data?: any) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.data = data
  }
}

export class ApiService {
  /**
   * Base request executor with uniform error normalization and default headers.
   */
  protected async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: any,
    options: ApiRequestOptions = {},
  ): Promise<T> {
    const isBodyMethod = method === 'POST' || method === 'PUT'

    try {
      return await $fetch<T>(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: isBodyMethod ? data : undefined,
        query: !isBodyMethod ? data : undefined,
        ...options,
      })
    } catch (err: any) {
      const statusCode = err.statusCode || err.response?.status || 500
      const errorData = err.data || err.response?._data
      const message =
        (typeof errorData === 'object' && (errorData?.detail || errorData?.message)) ||
        err.message ||
        'An unexpected API error occurred.'

      throw new ApiError(message, statusCode, errorData)
    }
  }

  /**
   * Send a GET request with optional query parameters.
   */
  get<T>(url: string, query?: Record<string, any>, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(url, 'GET', query, options)
  }

  /**
   * Send a POST request with body payload.
   */
  post<T>(url: string, body?: any, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(url, 'POST', body, options)
  }

  /**
   * Send a PUT request with body payload.
   */
  put<T>(url: string, body?: any, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(url, 'PUT', body, options)
  }

  /**
   * Send a DELETE request.
   */
  delete<T>(url: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(url, 'DELETE', undefined, options)
  }
}

export const apiService = new ApiService()

/** Typed fetch wrappers for the `/api` routes (proxied to the server by Vite in dev). */

const API_BASE = '/api'

type Method = 'GET' | 'PUT' | 'POST' | 'DELETE'

export class ApiRequestError extends Error {
  readonly status: number
  /** The parsed response body: an `ApiError` object for JSON responses, text otherwise, null when empty. */
  readonly body: unknown

  constructor(method: Method, path: string, status: number, body: unknown) {
    super(`${method} ${path} failed with ${status}${describe(body)}`)
    this.name = 'ApiRequestError'
    this.status = status
    this.body = body
  }
}

function describe(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return `: ${body.error}`
  }
  return ''
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null
  const text = await res.text()
  if (text === '') return null
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
  return text
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const headers: Record<string, string> = { accept: 'application/json' }
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(url, init)
  const payload = await parseBody(res)
  if (!res.ok) throw new ApiRequestError(method, path, res.status, payload)
  return payload as T
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path)
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PUT', path, body)
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body)
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>('DELETE', path)
}

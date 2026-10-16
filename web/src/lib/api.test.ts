import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, apiGet, apiPost, apiPut } from './api'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('api wrappers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GETs under /api and returns the parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiGet<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.objectContaining({ method: 'GET' }))
  })

  it('sends JSON bodies for PUT and POST', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, { updatedAt: 'now' })))
    vi.stubGlobal('fetch', fetchMock)
    await apiPut('sessions/x/review', { a: 1 })
    await apiPost('/sessions/x/runs')
    const [, putInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(putInit.method).toBe('PUT')
    expect(putInit.body).toBe('{"a":1}')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/sessions/x/review')
    const [, postInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(postInit.method).toBe('POST')
    expect(postInit.body).toBeUndefined()
  })

  it('throws ApiRequestError carrying status and body on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(409, { error: 'stale', current: {} })))
    const error = await apiPut('/sessions/x/review', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    const apiError = error as ApiRequestError
    expect(apiError.status).toBe(409)
    expect(apiError.body).toEqual({ error: 'stale', current: {} })
    expect(apiError.message).toContain('409')
    expect(apiError.message).toContain('stale')
  })
})

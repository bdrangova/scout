import { vi, type Mock } from 'vitest'

type Handler = (init: RequestInit | undefined) => Response

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Stubs `fetch` with handlers keyed `METHOD /api/path` (an unmatched request is a 404); returns the mock to inspect the calls. */
export function stubApi(routes: Record<string, Handler>): Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>> {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const handler = routes[`${init?.method ?? 'GET'} ${String(input)}`]
    return Promise.resolve(handler ? handler(init) : json(404, { error: 'not found' }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** The `METHOD path` of every call, in order. */
export function calls(fetchMock: Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>): string[] {
  return fetchMock.mock.calls.map(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}`)
}

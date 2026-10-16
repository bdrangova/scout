import type { CommitList, PutReviewRequest, Review, ReviewResponse, WorkingTree } from '@review-dash/shared'
import { vi, type Mock } from 'vitest'
import { PATCH_FIXTURE } from './fixtures'

export type PutOutcome =
  | { ok: true; updatedAt?: string }
  | { ok: false; kind: 'conflict'; current: Review }
  | { ok: false; kind: 'error'; status: number; error: string }

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface ReviewApiMockOptions {
  /** Text served for `GET /sessions/:id/<extras|spec>/<path>`, keyed `extras/<path>` and `spec/<path>` (decoded). */
  contents?: Record<string, string>
  /** Paths whose patch route answers 410 (omitted from the diff). */
  omittedPaths?: readonly string[]
  /** Served for `GET /sessions/:id/commits` (unmocked, 404, when absent). */
  commits?: CommitList
  /** Served for `GET /sessions/:id/scopes/:scope`, keyed by scope (404 for the others). */
  scopes?: Record<string, WorkingTree>
}

export interface ReviewApiMock {
  fetchMock: Mock<FetchFn>
  /** Every PUT body, in order. */
  puts: PutReviewRequest[]
  /** Queue the outcome of the next PUT (default: 200 with a fresh `updatedAt`). */
  queuePut: (outcome: PutOutcome) => void
  /** URLs of every patch request, in order. */
  patchRequests: string[]
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function text(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } })
}

export function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

/** Stubs `fetch` for the review GET/PUT, the per-file patch route and the extras/spec content routes. */
export function mockReviewApi(response: ReviewResponse, options: ReviewApiMockOptions = {}): ReviewApiMock {
  const puts: PutReviewRequest[] = []
  const patchRequests: string[] = []
  const queue: PutOutcome[] = []
  const omitted = new Set(options.omittedPaths ?? [])
  let saves = 0
  const fetchMock = vi.fn<FetchFn>(async (input, init) => {
    const url = urlOf(input)
    const method = init?.method ?? 'GET'
    if (method === 'GET' && /\/review$/.test(url)) return json(200, response)
    if (method === 'PUT' && /\/review$/.test(url)) {
      puts.push(JSON.parse(String(init?.body)) as PutReviewRequest)
      const outcome = queue.shift() ?? { ok: true }
      if (outcome.ok) {
        saves += 1
        return json(200, { updatedAt: outcome.updatedAt ?? `2026-09-26T18:00:${String(saves).padStart(2, '0')}.000Z` })
      }
      if (outcome.kind === 'conflict') return json(409, { error: 'stale', current: outcome.current })
      return json(outcome.status, { error: outcome.error })
    }
    if (method === 'GET' && /\/commits$/.test(url)) {
      return options.commits ? json(200, options.commits) : json(404, { error: 'unmocked commits' })
    }
    const scope = /\/scopes\/([^/?]+)$/.exec(url)
    if (method === 'GET' && scope) {
      const tree = options.scopes?.[decodeURIComponent(scope[1] ?? '')]
      return tree ? json(200, tree) : json(404, { error: 'unknown scope' })
    }
    const patch = /\/files\/(.+)\/patch(\?|$)/.exec(url)
    if (method === 'GET' && patch) {
      patchRequests.push(url)
      if (omitted.has(decodeURIComponent(patch[1] ?? ''))) return json(410, { error: 'omitted from the diff' })
      return text(PATCH_FIXTURE)
    }
    const content = /\/sessions\/[^/]+\/(extras|spec)\/(.+)$/.exec(url)
    if (method === 'GET' && content) {
      const body = options.contents?.[`${content[1]}/${decodeURIComponent(content[2] ?? '')}`]
      if (body !== undefined) return text(body)
    }
    return json(404, { error: `unmocked ${method} ${url}` })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, puts, queuePut: (outcome) => queue.push(outcome), patchRequests }
}

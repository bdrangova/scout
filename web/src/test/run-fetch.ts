import { vi } from 'vitest'
import { urlOf } from './mock-api'

const LOG_LINES = ['boot ok', 'listening on 4546', 'request /items', 'done', 'warn: slow query', 'error: empty result', 'stack frame', 'stack frame', 'closed']

/** Wraps the current stubbed `fetch` (the review API mock) so run log slices and run files answer too. */
export function stubRunResources(files: Record<string, string> = {}): void {
  const inner = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input)
      const log = /\/run\/log\/.+\?from=(\d+)&to=(\d+)$/.exec(url)
      if (log) {
        const from = Number(log[1])
        const to = Number(log[2])
        return Response.json({ path: 'logs/run.log', from, to, total: LOG_LINES.length, lines: LOG_LINES.slice(from - 1, to) })
      }
      const file = /\/run\/file\/(.+)$/.exec(url)
      if (file) {
        const body = files[decodeURIComponent(file[1] ?? '')]
        return body === undefined ? new Response('missing', { status: 404 }) : new Response(body, { status: 200 })
      }
      return inner(input, init)
    }),
  )
}

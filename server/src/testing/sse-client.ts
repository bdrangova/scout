import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Express } from 'express'

export type SseMessage = { kind: 'event'; event: string | null; id: string | null; data: string } | { kind: 'comment'; text: string }

export interface SseReader {
  readonly messages: SseMessage[]
  /** Resolves with the first message (at or after `from`) matching `pred`; rejects on timeout. */
  waitFor(pred: (m: SseMessage) => boolean, opts?: { timeoutMs?: number; from?: number }): Promise<SseMessage>
  /** Resolves once the stream ended (server closed it). */
  readonly ended: Promise<void>
  close(): void
}

/** Starts the app on an ephemeral port. */
export async function listen(app: Express): Promise<{ url: string; server: Server; close: () => Promise<void> }> {
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    server,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      }),
  }
}

function parseFrame(frame: string): SseMessage | null {
  let event: string | null = null
  let id: string | null = null
  const data: string[] = []
  const comments: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) comments.push(line.slice(1).trim())
    else if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('id:')) id = line.slice(3).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
  }
  if (data.length > 0) return { kind: 'event', event, id, data: data.join('\n') }
  if (comments.length > 0) return { kind: 'comment', text: comments.join('\n') }
  return null
}

/** Opens an SSE connection with `fetch` and parses frames as they arrive. */
export async function openSseReader(url: string, headers: Record<string, string> = {}): Promise<SseReader> {
  const controller = new AbortController()
  const res = await fetch(url, { headers: { accept: 'text/event-stream', ...headers }, signal: controller.signal })
  const body = res.body
  if (!res.ok || !body) throw new Error(`SSE request failed: ${res.status}`)
  const messages: SseMessage[] = []
  const waiters: { pred: (m: SseMessage) => boolean; from: number; resolve: (m: SseMessage) => void }[] = []

  const ended = (async () => {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let index = buffer.indexOf('\n\n')
        while (index >= 0) {
          const message = parseFrame(buffer.slice(0, index))
          buffer = buffer.slice(index + 2)
          if (message) {
            messages.push(message)
            for (const waiter of waiters.splice(0)) {
              const hit = messages.slice(waiter.from).find(waiter.pred)
              if (hit) waiter.resolve(hit)
              else waiters.push(waiter)
            }
          }
          index = buffer.indexOf('\n\n')
        }
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) throw err
    }
  })()

  return {
    messages,
    ended,
    waitFor(pred, opts = {}) {
      const from = opts.from ?? 0
      const hit = messages.slice(from).find(pred)
      if (hit) return Promise.resolve(hit)
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for an SSE message (have ${messages.length})`)), opts.timeoutMs ?? 5000)
        waiters.push({
          pred,
          from,
          resolve: (m) => {
            clearTimeout(timer)
            resolve(m)
          },
        })
      })
    },
    close: () => controller.abort(),
  }
}

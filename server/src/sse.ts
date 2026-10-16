import type { Response } from 'express'

export const HEARTBEAT_MS = 15_000

export interface SseStream {
  /** Writes one event; `data` is JSON-encoded. */
  send(data: unknown, opts?: { event?: string; id?: string | number }): void
  /** Writes a comment line (used for heartbeats and readiness markers). */
  comment(text: string): void
  end(): void
  readonly closed: boolean
  onClose(fn: () => void): void
}

export interface SseOptions {
  heartbeatMs?: number
}

/** Tracks open streams so they can be ended on server shutdown. */
export class SseRegistry {
  private readonly streams = new Set<SseStream>()

  open(res: Response, options: SseOptions = {}): SseStream {
    const stream = openSse(res, options)
    this.streams.add(stream)
    stream.onClose(() => this.streams.delete(stream))
    return stream
  }

  get size(): number {
    return this.streams.size
  }

  closeAll(): void {
    for (const stream of [...this.streams]) stream.end()
  }
}

/**
 * Turns an Express response into a server-sent-events stream: the headers, an `id:`/`event:`/
 * `data:` writer, a heartbeat comment every 15 s and cleanup when either side closes.
 */
export function openSse(res: Response, options: SseOptions = {}): SseStream {
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  res.req.socket.setTimeout(0)
  res.req.socket.setNoDelay(true)
  res.req.socket.setKeepAlive(true)

  let closed = false
  const closeHandlers: (() => void)[] = []
  const heartbeat = setInterval(() => write(': ping\n\n'), options.heartbeatMs ?? HEARTBEAT_MS)

  function write(chunk: string): void {
    if (closed) return
    res.write(chunk)
  }

  function cleanup(): void {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    for (const handler of closeHandlers.splice(0)) {
      try {
        handler()
      } catch (err) {
        console.error('sse close handler failed', err)
      }
    }
  }

  res.on('close', cleanup)
  write(': connected\n\n')

  return {
    send(data, opts = {}) {
      let frame = ''
      if (opts.id !== undefined) frame += `id: ${opts.id}\n`
      if (opts.event !== undefined) frame += `event: ${opts.event}\n`
      frame += `data: ${JSON.stringify(data)}\n\n`
      write(frame)
    },
    comment(text) {
      write(`: ${text}\n\n`)
    },
    end() {
      if (closed) return
      res.end()
      cleanup()
    },
    get closed() {
      return closed
    },
    onClose(fn) {
      if (closed) fn()
      else closeHandlers.push(fn)
    },
  }
}

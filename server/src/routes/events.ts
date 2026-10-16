import { Router } from 'express'
import type { StoreEventBus } from '../events.ts'
import type { SseRegistry } from '../sse.ts'
import type { StoreWatcher } from '../watcher.ts'

export interface EventsDeps {
  bus: StoreEventBus
  watcher: StoreWatcher
  sse: SseRegistry
}

/** `GET /events`: every `StoreEvent` as an unnamed SSE message; `: ready` once the watcher scanned the store. */
export function eventsRouter(deps: EventsDeps): Router {
  const { bus, watcher, sse } = deps
  const router = Router()

  router.get('/events', async (_req, res) => {
    const stream = sse.open(res)
    const unsubscribe = bus.subscribe((event) => stream.send(event))
    stream.onClose(unsubscribe)
    watcher.start()
    await watcher.ready
    stream.comment('ready')
  })

  return router
}

import type { StoreEvent } from '@review-dash/shared'
import { useEffect, useRef } from 'react'

/** The union member(s) whose `type` admits `K` (the first member's `type` is itself a union). */
type EventOf<E, K> = E extends { type: infer T } ? (K extends T ? E : never) : never

/** One optional handler per event type, each typed with that type's payload (`tree.updated` carries the fingerprint). */
export type StoreEventHandlers = {
  [K in StoreEvent['type']]?: (event: EventOf<StoreEvent, K>) => void
}

type AnyHandler = (event: StoreEvent) => void

export const STORE_EVENTS_URL = '/api/events'

function isStoreEvent(value: unknown): value is StoreEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    'sessionId' in value &&
    typeof value.sessionId === 'string'
  )
}

/** The one open stream and who listens to it; closed again when the last subscriber leaves. */
let shared: { source: EventSource; listeners: Set<AnyHandler> } | null = null

function subscribe(listener: AnyHandler): () => void {
  if (shared === null) {
    const source = new EventSource(STORE_EVENTS_URL)
    const listeners = new Set<AnyHandler>()
    source.addEventListener('message', (message: MessageEvent) => {
      let parsed: unknown = null
      try {
        parsed = JSON.parse(String(message.data))
      } catch {
        return
      }
      if (!isStoreEvent(parsed)) return
      for (const handler of listeners) handler(parsed)
    })
    shared = { source, listeners }
  }
  const current = shared
  current.listeners.add(listener)
  return () => {
    current.listeners.delete(listener)
    if (current.listeners.size === 0 && shared === current) {
      current.source.close()
      shared = null
    }
  }
}

/**
 * Subscribes to `/api/events` for as long as the component is mounted; each `StoreEvent` goes to
 * the handler registered for its type. Subscribers share one `EventSource` (the session page has
 * several: the live updates, the commit list, the uncommitted scope). Handlers are read through
 * a ref, so passing a fresh object on every render does not resubscribe.
 */
export function useStoreEvents(handlers: StoreEventHandlers, enabled = true): void {
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return
    return subscribe((event) => {
      // Each handler only accepts its own event type; the lookup by `event.type` guarantees the match.
      const handler = handlersRef.current[event.type] as AnyHandler | undefined
      handler?.(event)
    })
  }, [enabled])
}

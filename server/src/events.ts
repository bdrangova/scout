import type { StoreEvent } from '@scout/shared'

export type StoreEventListener = (event: StoreEvent) => void

/** In-process fan-out of `StoreEvent`s to `/api/events` subscribers. */
export class StoreEventBus {
  private readonly listeners = new Set<StoreEventListener>()

  emit(event: StoreEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('store event listener failed', err)
      }
    }
  }

  subscribe(listener: StoreEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  get size(): number {
    return this.listeners.size
  }
}

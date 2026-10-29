import { vi } from 'vitest'

type Listener = (event: MessageEvent) => void

/** A hand-driven `EventSource`: tests call `emit(type, data)` to deliver server events. */
export class MockEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: MockEventSource[] = []

  readonly url: string
  readyState = MockEventSource.OPEN
  private readonly listeners = new Map<string, Set<Listener>>()

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED
  }

  get closed(): boolean {
    return this.readyState === MockEventSource.CLOSED
  }

  emit(type: string, data: unknown, lastEventId = ''): void {
    const event = new MessageEvent(type, { data: JSON.stringify(data), lastEventId })
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  /** The most recent source whose URL contains `fragment`. */
  static latest(fragment: string): MockEventSource | undefined {
    return [...MockEventSource.instances].reverse().find((source) => source.url.includes(fragment))
  }

  static reset(): void {
    MockEventSource.instances = []
  }
}

export function stubEventSource(): void {
  MockEventSource.reset()
  vi.stubGlobal('EventSource', MockEventSource)
}

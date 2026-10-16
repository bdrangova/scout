/** A push-based async iterable: producers `push`, one consumer iterates, `end` completes it. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = []
  private readonly waiters: ((result: IteratorResult<T>) => void)[] = []
  private ended = false

  push(item: T): void {
    if (this.ended) return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: item, done: false })
    else this.items.push(item)
  }

  end(): void {
    if (this.ended) return
    this.ended = true
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.items.length > 0) return Promise.resolve({ value: this.items.shift() as T, done: false })
        if (this.ended) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => this.waiters.push(resolve))
      },
    }
  }
}

/** Resolves after `ms`, or as soon as `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(done, ms)
    function done(): void {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })
}

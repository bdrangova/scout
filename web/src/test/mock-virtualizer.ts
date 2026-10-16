import type { VirtualItem } from '@tanstack/react-virtual'
import { vi } from 'vitest'

interface Options {
  count: number
  estimateSize: (index: number) => number
  getItemKey?: (index: number) => string | number
}

/** `scrollToIndex` of every mocked virtualizer, for assertions. */
export const scrollToIndexMock = vi.fn<(index: number, options?: unknown) => void>()

/**
 * A `useVirtualizer` that lays every row out with `estimateSize` (happy-dom has no layout, so the
 * real one would measure nothing). Use with `vi.mock('@tanstack/react-virtual', …)`.
 */
export function virtualizerModuleMock() {
  return {
    useVirtualizer: (options: Options) => {
      const items: VirtualItem[] = []
      let start = 0
      for (let index = 0; index < options.count; index += 1) {
        const size = options.estimateSize(index)
        items.push({ index, key: options.getItemKey?.(index) ?? index, start, size, end: start + size, lane: 0 })
        start += size
      }
      return {
        getVirtualItems: () => items,
        getTotalSize: () => start,
        measureElement: () => undefined,
        scrollToIndex: scrollToIndexMock,
      }
    },
  }
}

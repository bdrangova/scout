import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { useCachedAsync } from './hooks'

const Schema = z.object({ n: z.number() })

describe('useCachedAsync', () => {
  it('shows the last answer at once on the next visit, then the fresh one', async () => {
    const first = renderHook(() => useCachedAsync('k', () => Promise.resolve({ n: 1 }), Schema))
    await waitFor(() => expect(first.result.current.data).toEqual({ n: 1 }))
    first.unmount()

    let resolve: (value: { n: number }) => void = () => {}
    const second = renderHook(() => useCachedAsync('k', () => new Promise<{ n: number }>((r) => { resolve = r }), Schema))
    expect(second.result.current.data).toEqual({ n: 1 })
    expect(second.result.current.loading).toBe(false)
    expect(second.result.current.busy).toBe(true)
    resolve({ n: 2 })
    await waitFor(() => expect(second.result.current.data).toEqual({ n: 2 }))
    expect(second.result.current.loading).toBe(false)
    expect(second.result.current.busy).toBe(false)

    act(() => second.result.current.reload())
    expect(second.result.current.busy).toBe(true)
    expect(second.result.current.data).toEqual({ n: 2 })
  })

  it('keeps the cached answer when the reload fails', async () => {
    const first = renderHook(() => useCachedAsync('k', () => Promise.resolve({ n: 1 }), Schema))
    await waitFor(() => expect(first.result.current.data).toEqual({ n: 1 }))
    first.unmount()

    const second = renderHook(() => useCachedAsync('k', () => Promise.reject(new Error('down')), Schema))
    await waitFor(() => expect(second.result.current.error?.message).toBe('down'))
    expect(second.result.current.data).toEqual({ n: 1 })
  })

  it('starts empty for a key never loaded', () => {
    const { result } = renderHook(() => useCachedAsync('other', () => new Promise(() => {}), Schema))
    expect(result.current.data).toBeNull()
  })
})

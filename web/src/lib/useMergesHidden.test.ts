import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMergesHidden } from './useMergesHidden'

describe('useMergesHidden', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('shows merges by default, toggles and remembers the choice', () => {
    const { result } = renderHook(() => useMergesHidden())
    expect(result.current[0]).toBe(false)
    act(() => {
      expect(result.current[1]()).toBe(true)
    })
    expect(result.current[0]).toBe(true)
    expect(window.localStorage.getItem('scout:hide-merges')).toBe('hidden')
    const { result: again } = renderHook(() => useMergesHidden())
    expect(again.current[0]).toBe(true)
  })

  it('works without storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useMergesHidden())
    expect(result.current[0]).toBe(false)
    act(() => {
      result.current[1]()
    })
    expect(result.current[0]).toBe(true)
  })
})

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTreeCollapsed } from './useTreeCollapsed'

describe('useTreeCollapsed', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts open, remembers a fold and reads it back', () => {
    const first = renderHook(() => useTreeCollapsed())
    expect(first.result.current[0]).toBe(false)
    act(() => first.result.current[1]())
    expect(first.result.current[0]).toBe(true)
    expect(renderHook(() => useTreeCollapsed()).result.current[0]).toBe(true)
    act(() => first.result.current[1]())
    expect(window.localStorage.getItem('scout:files-tree-collapsed')).toBe('false')
  })
})

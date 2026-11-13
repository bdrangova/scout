import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { pickStateOf, useSelection } from './useSelection'

describe('pickStateOf', () => {
  it('is all, some or none of the files', () => {
    const picked = new Set(['a', 'b'])
    expect(pickStateOf(['a', 'b'], picked)).toBe('all')
    expect(pickStateOf(['a', 'c'], picked)).toBe('some')
    expect(pickStateOf(['c'], picked)).toBe('none')
  })
})

describe('useSelection', () => {
  it('toggles files and whole groups, keeps picks while on and forgets them on leave', () => {
    const { result } = renderHook(() => useSelection())
    expect(result.current.active).toBe(false)
    act(() => result.current.enter(['a']))
    expect(result.current.active).toBe(true)
    act(() => result.current.toggle(['a', 'b']))
    expect([...result.current.selected]).toEqual(['a', 'b'])
    act(() => result.current.toggle(['a', 'b']))
    expect(result.current.selected.size).toBe(0)
    act(() => result.current.add(['c']))
    act(() => result.current.leave())
    expect(result.current.active).toBe(false)
    expect(result.current.selected.size).toBe(0)
  })
})

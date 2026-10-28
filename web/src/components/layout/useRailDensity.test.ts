import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useRailDensity } from './useRailDensity'

describe('useRailDensity', () => {
  beforeEach(() => window.localStorage.clear())

  it('defaults to compact on Files and roomy elsewhere', () => {
    expect(renderHook(() => useRailDensity('files')).result.current[0]).toBe('compact')
    expect(renderHook(() => useRailDensity('other')).result.current[0]).toBe('roomy')
  })

  it('remembers a toggle per group, leaving the other group alone', () => {
    const files = renderHook(() => useRailDensity('files'))
    act(() => files.result.current[1]())
    expect(files.result.current[0]).toBe('roomy')
    expect(window.localStorage.getItem('scout:rail-density:files')).toBe('roomy')
    expect(window.localStorage.getItem('scout:rail-density:other')).toBeNull()
    expect(renderHook(() => useRailDensity('files')).result.current[0]).toBe('roomy')
    expect(renderHook(() => useRailDensity('other')).result.current[0]).toBe('roomy')
  })

  it('switches to the other group\'s own choice when the group changes', () => {
    window.localStorage.setItem('scout:rail-density:other', 'compact')
    const { result, rerender } = renderHook(({ group }) => useRailDensity(group), { initialProps: { group: 'files' as const } as { group: 'files' | 'other' } })
    expect(result.current[0]).toBe('compact')
    rerender({ group: 'other' })
    expect(result.current[0]).toBe('compact')
    act(() => result.current[1]())
    expect(result.current[0]).toBe('roomy')
    rerender({ group: 'files' })
    expect(result.current[0]).toBe('compact')
  })

  it('ignores a stored value it does not know', () => {
    window.localStorage.setItem('scout:rail-density:files', 'huge')
    expect(renderHook(() => useRailDensity('files')).result.current[0]).toBe('compact')
  })
})

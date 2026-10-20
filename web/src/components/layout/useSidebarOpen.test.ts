import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSidebarOpen } from './useSidebarOpen'

function mockViewport(desktop: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: desktop, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  )
}

describe('useSidebarOpen', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('is open beside the content by default and remembers a toggle', () => {
    mockViewport(true)
    const { result } = renderHook(() => useSidebarOpen())
    expect(result.current).toMatchObject({ desktop: true, open: true })
    act(() => result.current.toggle())
    expect(result.current.open).toBe(false)
    expect(window.localStorage.getItem('review-dash:rail')).toBe('closed')
    expect(renderHook(() => useSidebarOpen()).result.current.open).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)
    expect(window.localStorage.getItem('review-dash:rail')).toBe('open')
  })

  it('is a closed drawer by default on a narrow screen and does not touch the remembered choice', () => {
    mockViewport(false)
    const { result } = renderHook(() => useSidebarOpen())
    expect(result.current).toMatchObject({ desktop: false, open: false })
    act(() => result.current.toggle())
    expect(result.current.open).toBe(true)
    act(() => result.current.close())
    expect(result.current.open).toBe(false)
    expect(window.localStorage.getItem('review-dash:rail')).toBeNull()
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { modeSearch, parseMode, readLastCardMode, rememberCardMode, toggledCardMode, toggledGridMode } from './mode'

describe('mode', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('parses the three modes and falls back to swipe', () => {
    expect(parseMode('scroll')).toBe('scroll')
    expect(parseMode('grid')).toBe('grid')
    expect(parseMode('swipe')).toBe('swipe')
    expect(parseMode('bogus')).toBe('swipe')
    expect(parseMode(null)).toBe('swipe')
  })

  it('remembers the last card mode for the grid to return to', () => {
    expect(readLastCardMode()).toBe('swipe')
    expect(toggledGridMode('swipe')).toBe('grid')
    rememberCardMode('scroll')
    expect(readLastCardMode()).toBe('scroll')
    expect(toggledGridMode('grid')).toBe('scroll')
  })

  it('S toggles swipe and scroll, from the grid relative to the remembered mode', () => {
    expect(toggledCardMode('swipe')).toBe('scroll')
    expect(toggledCardMode('scroll')).toBe('swipe')
    expect(toggledCardMode('grid')).toBe('scroll')
    rememberCardMode('scroll')
    expect(toggledCardMode('grid')).toBe('swipe')
  })

  it('modeSearch switches the mode and keeps the commit scope', () => {
    expect(modeSearch(new URLSearchParams('mode=swipe&commit=uncommitted'), 'grid')).toBe('?mode=grid&commit=uncommitted')
    expect(modeSearch(new URLSearchParams(), 'scroll')).toBe('?mode=scroll')
  })
})

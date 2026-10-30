import { describe, expect, it } from 'vitest'
import { clampRailWidth, RAIL_MIN_WIDTH, railMaxWidth } from './useRailWidth'

describe('rail width', () => {
  it('never goes below the natural width', () => {
    expect(clampRailWidth(100, 1500)).toBe(RAIL_MIN_WIDTH)
  })

  it('stops at a third of the window', () => {
    expect(railMaxWidth(1500)).toBe(500)
    expect(clampRailWidth(900, 1500)).toBe(500)
  })

  it('keeps the natural width when a third of the window is narrower', () => {
    expect(railMaxWidth(800)).toBe(RAIL_MIN_WIDTH)
    expect(clampRailWidth(400, 800)).toBe(RAIL_MIN_WIDTH)
  })
})

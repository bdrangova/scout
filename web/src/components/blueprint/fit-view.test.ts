import { describe, expect, it } from 'vitest'
import { fitView } from './fit-view'

describe('fitView', () => {
  it('keeps small content at 100% and centres it', () => {
    const view = fitView([{ x: 0, y: 0, w: 200, h: 100 }], { w: 1000, h: 600 })
    expect(view).toEqual({ scale: 1, x: 400, y: 250 })
  })

  it('zooms out until everything fits inside the padding', () => {
    const view = fitView([{ x: 0, y: 0, w: 2000, h: 100 }], { w: 1096, h: 600 })
    expect(view?.scale).toBeCloseTo(0.5)
  })

  it('never zooms out past the minimum', () => {
    expect(fitView([{ x: 0, y: 0, w: 100000, h: 100 }], { w: 1000, h: 600 })?.scale).toBe(0.2)
  })

  it('accounts for boxes at negative positions', () => {
    const view = fitView([{ x: -100, y: -50, w: 200, h: 100 }], { w: 1000, h: 600 })
    expect(view).toEqual({ scale: 1, x: 500 + 100 - 100, y: 300 + 50 - 50 })
  })

  it('has nothing to do without boxes or room', () => {
    expect(fitView([], { w: 1000, h: 600 })).toBeNull()
    expect(fitView([{ x: 0, y: 0, w: 1, h: 1 }], { w: 0, h: 0 })).toBeNull()
  })
})

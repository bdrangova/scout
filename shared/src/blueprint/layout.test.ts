import { describe, expect, it } from 'vitest'
import type { BlueprintBox, BlueprintDiagram } from './model.ts'
import { layoutBlueprint } from './layout.ts'

function box(name: string, layer: number): BlueprintBox {
  return { key: `file:${name}`, ref: { type: 'file', path: name }, name, files: [name], layer, usedByOutside: 0, extendedByOutside: 0, usesOutside: 0 }
}

function diagram(boxes: BlueprintBox[]): BlueprintDiagram {
  return { id: 'pkg:', ref: { type: 'package', dir: '' }, title: 'Whole change', boxes, arrows: [], center: null }
}

const sizes = (boxes: BlueprintBox[], w = 100, h = 50): Record<string, { w: number; h: number }> => Object.fromEntries(boxes.map((b) => [b.key, { w, h }]))

describe('layoutBlueprint', () => {
  const boxes = [box('a', 0), box('b', 0), box('c', 0), box('d', 1), box('e', 1), box('u1', -1), box('u2', -1), box('u3', -1)]
  const d = diagram(boxes)
  const options = { maxRowWidth: 250 }

  it('places every box, without overlaps and with non-negative coordinates', () => {
    const points = layoutBlueprint(d, sizes(boxes), options)
    expect(Object.keys(points).sort()).toEqual(boxes.map((b) => b.key).sort())
    for (const p of Object.values(points)) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
    }
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b) continue
        const pa = points[a.key]!
        const pb = points[b.key]!
        const apart = pa.x + 100 <= pb.x || pb.x + 100 <= pa.x || pa.y + 50 <= pb.y || pb.y + 50 <= pa.y
        expect(apart, `${a.name} vs ${b.name}`).toBe(true)
      }
    }
  })

  it('wraps bands at maxRowWidth and centres rows on one axis', () => {
    const points = layoutBlueprint(d, sizes(boxes), options)
    // two per row (100 + 30 + 100 <= 250), the third wraps
    expect(points['file:a']?.y).toBe(points['file:b']?.y)
    expect(points['file:c']?.y).toBeGreaterThan(points['file:a']?.y ?? 0)
    expect(points['file:b']?.x).toBe((points['file:a']?.x ?? 0) + 130)
    // axis = 125: the full row spans 10..240, the lone box is centred
    expect(points['file:a']?.x).toBe(10)
    expect(points['file:c']?.x).toBe(75)
    // layer 1 starts below layer 0
    expect(points['file:d']?.y).toBeGreaterThan(points['file:c']?.y ?? 0)
  })

  it('puts unlinked boxes in a wrapped grid below the linked ones, with a larger gap', () => {
    const points = layoutBlueprint(d, sizes(boxes), options)
    const linkedBottom = Math.max(...['a', 'b', 'c', 'd', 'e'].map((n) => (points[`file:${n}`]?.y ?? 0) + 50))
    expect(points['file:u1']?.y).toBeGreaterThan(linkedBottom + 62)
    expect(points['file:u1']?.y).toBe(points['file:u2']?.y)
    expect(points['file:u3']?.y).toBeGreaterThan(points['file:u1']?.y ?? 0)
  })

  it('gives a box wider than maxRowWidth its own row', () => {
    const wide = [box('w', 0), box('x', 0)]
    const points = layoutBlueprint(diagram(wide), sizes(wide, 400), options)
    expect(points['file:w']?.y).toBeLessThan(points['file:x']?.y ?? 0)
    expect(points['file:w']?.x).toBe(0)
  })

  it('uses 264x120 for boxes missing from sizes and honours the gaps', () => {
    const two = [box('p', 0), box('q', 1)]
    const points = layoutBlueprint(diagram(two), {}, { maxRowWidth: 300, gapY: 10 })
    expect(points['file:q']?.y).toBe(130)
    expect(points['file:p']?.x).toBe(18)
  })

  it('is deterministic', () => {
    expect(layoutBlueprint(d, sizes(boxes), options)).toEqual(layoutBlueprint(d, sizes(boxes), options))
  })

  it('handles an empty diagram', () => {
    expect(layoutBlueprint(diagram([]), {}, options)).toEqual({})
  })
})

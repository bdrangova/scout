import { beforeEach, describe, expect, it } from 'vitest'
import { loadBlueprintSelection, orderBlueprintSelection, saveBlueprintSelection } from './blueprint'

describe('Blueprint selection helpers', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('orders the picked files by the diagram, then the others by path', () => {
    expect(orderBlueprintSelection(new Set(['z.ts', 'b.ts', 'a.ts', 'c.ts']), ['c.ts', 'a.ts', 'x.ts', 'b.ts'])).toEqual(['c.ts', 'a.ts', 'b.ts', 'z.ts'])
    expect(orderBlueprintSelection(new Set(), ['a.ts'])).toEqual([])
  })

  it('saves a list under a short key per session and reads it back', () => {
    const key = saveBlueprintSelection('s1', ['a.ts', 'b.ts'])
    expect(key).toMatch(/^[a-z0-9]{1,8}$/)
    expect(loadBlueprintSelection('s1', key ?? '')).toEqual(['a.ts', 'b.ts'])
    expect(window.sessionStorage.getItem(`scout:bp-sel:s1:${key}`)).toBe('["a.ts","b.ts"]')
    expect(loadBlueprintSelection('s2', key ?? '')).toBeNull()
  })

  it('reads null for an unknown key and for content that is not a list of paths', () => {
    expect(loadBlueprintSelection('s1', 'nope')).toBeNull()
    window.sessionStorage.setItem('scout:bp-sel:s1:bad', '{"a":1}')
    expect(loadBlueprintSelection('s1', 'bad')).toBeNull()
    window.sessionStorage.setItem('scout:bp-sel:s1:mixed', '["a",1]')
    expect(loadBlueprintSelection('s1', 'mixed')).toBeNull()
    window.sessionStorage.setItem('scout:bp-sel:s1:junk', 'not json')
    expect(loadBlueprintSelection('s1', 'junk')).toBeNull()
  })
})

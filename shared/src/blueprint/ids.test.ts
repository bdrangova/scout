import { describe, expect, it } from 'vitest'
import { BLUEPRINT_ROOT_DIAGRAM, blueprintBoxKey, blueprintDiagramId, parseBlueprintBoxKey, parseBlueprintDiagramId } from './ids.ts'

describe('blueprint ids', () => {
  it('round-trips diagram ids', () => {
    for (const ref of [{ type: 'package', dir: '' }, { type: 'package', dir: 'a/b' }, { type: 'around', path: 'a/b.ts' }] as const) {
      expect(parseBlueprintDiagramId(blueprintDiagramId(ref))).toEqual(ref)
    }
    expect(blueprintDiagramId({ type: 'package', dir: '' })).toBe(BLUEPRINT_ROOT_DIAGRAM)
  })

  it('round-trips box keys', () => {
    for (const ref of [{ type: 'dir', dir: 'a' }, { type: 'dir', dir: '' }, { type: 'file', path: 'a/b.ts' }] as const) {
      expect(parseBlueprintBoxKey(blueprintBoxKey(ref))).toEqual(ref)
    }
  })

  it('rejects anything else', () => {
    expect(parseBlueprintDiagramId(null)).toBeNull()
    expect(parseBlueprintDiagramId('around:')).toBeNull()
    expect(parseBlueprintDiagramId('nope')).toBeNull()
    expect(parseBlueprintBoxKey('file:')).toBeNull()
    expect(parseBlueprintBoxKey('x')).toBeNull()
  })
})

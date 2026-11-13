import { describe, expect, it } from 'vitest'
import type { Blueprint, BlueprintFile } from '../schemas/blueprint.ts'
import { blueprintBoxKey } from './ids.ts'
import { blueprintDiagramFiles, buildBlueprintDiagram } from './model.ts'
import { buildBlueprintTree } from './tree.ts'

function file(path: string, imports: string[] = [], extend: string[] = []): BlueprintFile {
  return { path, kind: 'module', analyzed: true, members: [], imports: [...imports].sort(), extends: extend }
}

function blueprint(files: BlueprintFile[]): Blueprint {
  return { fingerprint: 'a'.repeat(16), files }
}

function diagramOf(bp: Blueprint, ref: Parameters<typeof buildBlueprintDiagram>[2]) {
  return buildBlueprintDiagram(bp, buildBlueprintTree(bp.files.map((f) => f.path)), ref)
}

const fileKey = (path: string): string => blueprintBoxKey({ type: 'file', path })
const dirKey = (dir: string): string => blueprintBoxKey({ type: 'dir', dir })
const nums = (dir: string, prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${dir}/${prefix}${i + 1}.ts`)

/** core (8 files) and feat (8 files) sub-packages plus a root file `top.ts`. */
function big(top = true): Blueprint {
  const core = nums('core', 'c', 8).map((p) => file(p))
  const feat = nums('feat', 'f', 8).map((p) => {
    if (p === 'feat/f1.ts') return file(p, ['core/c1.ts', 'core/c2.ts'])
    if (p === 'feat/f2.ts') return file(p, ['core/c1.ts'])
    if (p === 'feat/f3.ts') return file(p, ['core/c3.ts'], ['core/c3.ts'])
    return file(p)
  })
  return blueprint([...core, ...feat, ...(top ? [file('top.ts', ['feat/f1.ts', 'feat/f4.ts'], ['feat/f4.ts'])] : [])])
}

describe('package diagram', () => {
  it('aggregates file links into arrows between boxes and layers them', () => {
    const d = diagramOf(big(), { type: 'package', dir: '' })
    expect(d?.id).toBe('pkg:')
    expect(d?.title).toBe('Whole change')
    expect(d?.center).toBeNull()
    expect(d?.boxes.map((b) => [b.key, b.name, b.layer])).toEqual([
      [dirKey('core'), 'core', 0],
      [dirKey('feat'), 'feat', 1],
      [fileKey('top.ts'), 'top.ts', 2],
    ])
    expect(d?.arrows).toEqual([
      { from: dirKey('feat'), to: dirKey('core'), count: 4, extends: true },
      { from: fileKey('top.ts'), to: dirKey('feat'), count: 2, extends: true },
    ])
    expect(d?.boxes[0]?.files).toHaveLength(8)
  })

  it('counts links to files outside the diagram on the boxes only', () => {
    const d = diagramOf(big(), { type: 'package', dir: 'feat' })
    expect(d?.title).toBe('feat')
    expect(d?.arrows).toEqual([])
    const box = (p: string) => d?.boxes.find((b) => b.key === fileKey(p))
    expect(box('feat/f1.ts')).toMatchObject({ usedByOutside: 1, extendedByOutside: 0, usesOutside: 2, layer: -1 })
    expect(box('feat/f4.ts')).toMatchObject({ usedByOutside: 0, extendedByOutside: 1, usesOutside: 0 })
    expect(box('feat/f3.ts')?.usesOutside).toBe(1)
    expect(d?.boxes.map((b) => b.layer)).toEqual(Array(8).fill(-1))
  })

  it('orders layers with cycles broken and unlinked boxes last', () => {
    const d = diagramOf(blueprint([file('a.ts', ['b.ts']), file('b.ts', ['c.ts']), file('c.ts', ['a.ts']), file('d.ts')]), { type: 'package', dir: '' })
    expect(d?.boxes.map((b) => [b.name, b.layer])).toEqual([['c.ts', 0], ['b.ts', 1], ['a.ts', 2], ['d.ts', -1]])
    expect(d?.arrows).toHaveLength(3)
  })

  it('orders a layer by the position under what it leans on, then by path', () => {
    const bp = blueprint([file('base1.ts'), file('base2.ts'), file('x.ts', ['base2.ts']), file('y.ts', ['base1.ts']), file('z.ts', ['base1.ts'])])
    const d = diagramOf(bp, { type: 'package', dir: '' })
    expect(d?.boxes.map((b) => b.name)).toEqual(['base1.ts', 'base2.ts', 'y.ts', 'z.ts', 'x.ts'])
    expect(blueprintDiagramFiles(d!)).toEqual(['base1.ts', 'base2.ts', 'y.ts', 'z.ts', 'x.ts'])
  })

  it('is null for a folder that is not a package', () => {
    expect(diagramOf(big(), { type: 'package', dir: 'nope' })).toBeNull()
  })
})

describe('around-a-file diagram', () => {
  const bp = blueprint([
    file('u1.ts'),
    file('u2.ts'),
    file('m.ts', ['u1.ts', 'u2.ts'], ['u1.ts']),
    file('z.ts', ['m.ts']),
    file('e.ts', ['m.ts'], ['m.ts']),
    file('o.ts', ['m.ts']),
    file('other.ts', ['u1.ts', 'z.ts']),
  ])

  it('shows imports, the file and its importers, extenders first', () => {
    const d = diagramOf(bp, { type: 'around', path: 'm.ts' })
    expect(d?.id).toBe('around:m.ts')
    expect(d?.title).toBe('around m.ts')
    expect(d?.center).toBe(fileKey('m.ts'))
    expect(d?.boxes.map((b) => [b.name, b.layer])).toEqual([['u1.ts', 0], ['u2.ts', 0], ['m.ts', 1], ['e.ts', 2], ['o.ts', 2], ['z.ts', 2]])
    expect(d?.arrows).toEqual([
      { from: fileKey('m.ts'), to: fileKey('u1.ts'), count: 1, extends: true },
      { from: fileKey('m.ts'), to: fileKey('u2.ts'), count: 1, extends: false },
      { from: fileKey('e.ts'), to: fileKey('m.ts'), count: 1, extends: true },
      { from: fileKey('o.ts'), to: fileKey('m.ts'), count: 1, extends: false },
      { from: fileKey('z.ts'), to: fileKey('m.ts'), count: 1, extends: false },
    ])
    const box = (p: string) => d?.boxes.find((b) => b.key === fileKey(p))
    expect(box('u1.ts')?.usedByOutside).toBe(1)
    expect(blueprintDiagramFiles(d!)).toEqual(['u1.ts', 'u2.ts', 'm.ts', 'e.ts', 'o.ts', 'z.ts'])
  })

  it('is null for an unknown file', () => {
    expect(diagramOf(bp, { type: 'around', path: 'nope.ts' })).toBeNull()
  })
})

describe('blueprintDiagramFiles', () => {
  it('lists the files of every box, box by box, when there are no file boxes', () => {
    const d = diagramOf(big(false), { type: 'package', dir: '' })
    expect(d?.boxes.map((b) => b.name)).toEqual(['core', 'feat'])
    expect(blueprintDiagramFiles(d!)).toEqual([...nums('core', 'c', 8), ...nums('feat', 'f', 8)])
  })

  it('lists only the direct file boxes when there are some', () => {
    const d = diagramOf(big(), { type: 'package', dir: '' })
    expect(blueprintDiagramFiles(d!)).toEqual(['top.ts'])
  })
})

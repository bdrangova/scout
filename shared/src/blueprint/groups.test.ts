import { describe, expect, it } from 'vitest'
import type { BlueprintGroup, BlueprintGrouping } from '../schemas/blueprint-groups.ts'
import { BLUEPRINT_UNGROUPED_ID, blueprintGroupingOfDir, buildBlueprintGroupTree, checkBlueprintGroups } from './groups.ts'

const group = (id: string, files: string[], extra: Partial<BlueprintGroup> = {}): BlueprintGroup => ({ id, name: id.toUpperCase(), purpose: `${id} purpose`, files, ...extra })
const grouping = (groups: BlueprintGroup[]): BlueprintGrouping => ({ createdAt: '2026-11-13T10:00:00.000Z', groups })

describe('buildBlueprintGroupTree', () => {
  it('keeps the group order, sorts files and nests dirs under @type', () => {
    const tree = buildBlueprintGroupTree('feature', grouping([group('zeta', ['b.ts', 'a.ts']), group('alpha', ['c.ts'], { groups: [group('inner', ['d.ts'], { groups: [group('deep', ['e.ts'])] })] })]), ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'])
    expect(tree.root.dir).toBe('@feature')
    expect(tree.root.packages.map((p) => p.dir)).toEqual(['@feature/zeta', '@feature/alpha'])
    expect(tree.root.packages[0]?.files).toEqual(['a.ts', 'b.ts'])
    const alpha = tree.root.packages[1]
    expect(alpha?.purpose).toBe('alpha purpose')
    expect(alpha?.files).toEqual(['c.ts'])
    expect(alpha?.allFiles).toEqual(['c.ts', 'd.ts', 'e.ts'])
    expect(alpha?.packages[0]?.dir).toBe('@feature/alpha/inner')
    expect(alpha?.packages[0]?.packages[0]?.dir).toBe('@feature/alpha/inner/deep')
    expect(tree.root.allFiles).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'])
    expect(tree.stale).toBe(false)
    expect(tree.ungrouped).toEqual([])
    expect(tree.gone).toEqual([])
  })

  it('drops gone files and empty groups, and reports them as stale', () => {
    const tree = buildBlueprintGroupTree('layer', grouping([group('a', ['a.ts', 'old.ts']), group('empty', ['old2.ts']), group('parent', [], { groups: [group('child', ['old.ts'])] })]), ['a.ts'])
    expect(tree.root.packages.map((p) => p.dir)).toEqual(['@layer/a'])
    expect(tree.gone).toEqual(['old.ts', 'old2.ts'])
    expect(tree.stale).toBe(true)
  })

  it('puts files no group names in a last Ungrouped package', () => {
    const tree = buildBlueprintGroupTree('feature', grouping([group('a', ['a.ts'])]), ['z.ts', 'a.ts', 'm.ts'])
    const last = tree.root.packages[tree.root.packages.length - 1]
    expect(last?.dir).toBe(`@feature/${BLUEPRINT_UNGROUPED_ID}`)
    expect(last?.dir).toBe('@feature/~ungrouped')
    expect(last?.name).toBe('Ungrouped')
    expect(last?.files).toEqual(['m.ts', 'z.ts'])
    expect(tree.ungrouped).toEqual(['m.ts', 'z.ts'])
    expect(tree.stale).toBe(true)
    expect(tree.root.allFiles).toEqual(['a.ts', 'm.ts', 'z.ts'])
  })

  it('counts a file named twice once, in the first group', () => {
    const tree = buildBlueprintGroupTree('priority', grouping([group('one', ['a.ts']), group('two', ['a.ts', 'b.ts'])]), ['a.ts', 'b.ts'])
    expect(tree.root.packages.map((p) => p.files)).toEqual([['a.ts'], ['b.ts']])
    expect(tree.root.allFiles).toEqual(['a.ts', 'b.ts'])
    expect(tree.gone).toEqual([])
    expect(tree.stale).toBe(false)
  })
})

describe('checkBlueprintGroups', () => {
  const paths = ['a.ts', 'b.ts', 'c.ts']

  it('accepts a good grouping', () => {
    expect(checkBlueprintGroups('feature', [group('x', ['a.ts', 'b.ts']), group('y', ['c.ts'])], paths)).toEqual({ problems: [], missing: [] })
  })

  it('reports files nobody names as missing, not as a problem', () => {
    expect(checkBlueprintGroups('feature', [group('x', ['a.ts'])], paths)).toEqual({ problems: [], missing: ['b.ts', 'c.ts'] })
  })

  it('finds duplicate sibling ids, but allows the same id under different parents', () => {
    expect(checkBlueprintGroups('feature', [group('x', ['a.ts']), group('x', ['b.ts'])], paths).problems).toEqual(['group id "x" is used twice among its siblings'])
    expect(checkBlueprintGroups('feature', [group('p', [], { groups: [group('x', ['a.ts'])] }), group('q', [], { groups: [group('x', ['b.ts'])] })], paths).problems).toEqual([])
  })

  it('finds a file in two groups and an unknown file', () => {
    const { problems } = checkBlueprintGroups('feature', [group('x', ['a.ts']), group('y', ['a.ts', 'nope.ts'])], paths)
    expect(problems).toContain('"a.ts" is in both x and y')
    expect(problems).toContain('"nope.ts" (in y) is not a changed file of this session')
  })

  it('finds nesting deeper than 3 levels', () => {
    const level3 = group('l3', ['a.ts'], { groups: [group('l4', ['b.ts'])] })
    const { problems } = checkBlueprintGroups('feature', [group('l1', [], { groups: [group('l2', [], { groups: [level3] })] })], paths)
    expect(problems).toEqual(['group "l1/l2/l3/l4" is nested deeper than 3 levels'])
  })

  it('fixes the priority top level ids and names', () => {
    const ok = [group('read-carefully', ['a.ts'], { name: 'Read carefully' }), group('mechanical', ['b.ts'], { name: 'Mechanical or generated' })]
    expect(checkBlueprintGroups('priority', ok, paths).problems).toEqual([])
    const bad = checkBlueprintGroups('priority', [group('other', ['a.ts']), group('repeated-pattern', ['b.ts'], { name: 'Same again' })], paths).problems
    expect(bad).toHaveLength(2)
    expect(bad[0]).toContain('"other" must be one of read-carefully, repeated-pattern, mechanical')
    expect(bad[1]).toContain('must be named "Repeated pattern"')
    expect(checkBlueprintGroups('feature', [group('other', ['a.ts'])], paths).problems).toEqual([])
  })
})

describe('blueprintGroupingOfDir', () => {
  it('tells a group path from a real folder', () => {
    expect(blueprintGroupingOfDir('@feature')).toBe('feature')
    expect(blueprintGroupingOfDir('@layer/a/b')).toBe('layer')
    expect(blueprintGroupingOfDir('@priority/~ungrouped')).toBe('priority')
    expect(blueprintGroupingOfDir('')).toBeNull()
    expect(blueprintGroupingOfDir('src/@feature')).toBeNull()
    expect(blueprintGroupingOfDir('@featured/x')).toBeNull()
    expect(blueprintGroupingOfDir('@other')).toBeNull()
  })
})

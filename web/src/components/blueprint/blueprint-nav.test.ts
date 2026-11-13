import { buildBlueprintGroupTree, buildBlueprintTree } from '@scout/shared'
import { describe, expect, it } from 'vitest'
import { chainOfDiagram, packageChain, parentDiagramId } from './blueprint-nav'

const paths = [
  ...Array.from({ length: 8 }, (_, i) => `app/ui/Widget${i}.tsx`),
  ...Array.from({ length: 8 }, (_, i) => `app/api/route${i}.ts`),
  ...Array.from({ length: 8 }, (_, i) => `lib/util${i}.ts`),
]
const root = buildBlueprintTree(paths)

describe('blueprint navigation', () => {
  it('walks from the root down to a package by its folder', () => {
    const chain = packageChain(root, 'app/ui')
    expect(chain[0]?.dir).toBe(root.dir)
    expect(chain.at(-1)?.dir).toBe('app/ui')
    expect(packageChain(root, 'missing')).toEqual([])
  })

  it('finds the deepest package holding the file of an around-diagram', () => {
    const chain = chainOfDiagram(root, { type: 'around', path: 'app/ui/Widget1.tsx' })
    expect(chain.at(-1)?.dir).toBe('app/ui')
  })

  it('goes up one level: package to parent, around to its holder, root nowhere', () => {
    expect(parentDiagramId(root, { type: 'package', dir: 'app/ui' })).toBe(`pkg:${packageChain(root, 'app/ui').at(-2)?.dir}`)
    expect(parentDiagramId(root, { type: 'around', path: 'app/ui/Widget1.tsx' })).toBe('pkg:app/ui')
    expect(parentDiagramId(root, { type: 'package', dir: '' })).toBeNull()
  })

  it('follows a grouping: the group holding the file, and up to its parent group or the view root', () => {
    const grouping = {
      createdAt: '2026-11-13T10:00:00.000Z',
      groups: [{ id: 'ui', name: 'UI', purpose: 'Screens.', files: [], groups: [{ id: 'widgets', name: 'Widgets', purpose: 'Boxes.', files: ['app/ui/Widget1.tsx'] }] }],
    }
    const tree = buildBlueprintGroupTree('feature', grouping, paths).root
    expect(chainOfDiagram(tree, { type: 'around', path: 'app/ui/Widget1.tsx' }).map((pkg) => pkg.dir)).toEqual(['@feature', '@feature/ui', '@feature/ui/widgets'])
    expect(parentDiagramId(tree, { type: 'around', path: 'app/ui/Widget1.tsx' })).toBe('pkg:@feature/ui/widgets')
    expect(parentDiagramId(tree, { type: 'package', dir: '@feature/ui/widgets' })).toBe('pkg:@feature/ui')
    expect(parentDiagramId(tree, { type: 'package', dir: '@feature' })).toBeNull()
  })
})

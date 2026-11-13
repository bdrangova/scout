import { describe, expect, it } from 'vitest'
import { BLUEPRINT_FLAT_MAX_FILES, buildBlueprintTree, findBlueprintPackage } from './tree.ts'

const many = (dir: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${dir}/f${String(i + 1).padStart(2, '0')}.ts`)

const chain = [...many('app/web/src/pages', 8), ...many('app/web/src/ui', 8), ...many('app/server', 3)]

describe('buildBlueprintTree', () => {
  it('merges single-folder chains and skips the root chain', () => {
    const root = buildBlueprintTree(chain)
    expect(root.dir).toBe('')
    expect(root.files).toEqual([])
    expect(root.allFiles).toEqual([...chain].sort())
    expect(root.packages.map((p) => [p.name, p.dir])).toEqual([
      ['server', 'app/server'],
      ['web/src', 'app/web/src'],
    ])
    const web = root.packages[1]
    expect(web?.packages.map((p) => [p.name, p.dir])).toEqual([
      ['pages', 'app/web/src/pages'],
      ['ui', 'app/web/src/ui'],
    ])
    expect(web?.allFiles).toHaveLength(16)
  })

  it('dissolves folders of two files or fewer into the parent', () => {
    const root = buildBlueprintTree([...chain, 'docs/b.md', 'docs/a.md', 'notes/x.md'])
    expect(root.files).toEqual(['docs/a.md', 'docs/b.md', 'notes/x.md'])
    expect(root.packages.map((p) => p.dir)).toEqual(['app'])
    expect(root.packages[0]?.packages.map((p) => p.name)).toEqual(['server', 'web/src'])
  })

  it('keeps folders of three files', () => {
    const root = buildBlueprintTree([...chain, 'docs/a.md', 'docs/b.md', 'docs/c.md'])
    expect(root.packages.map((p) => p.dir)).toEqual(['app', 'docs'])
  })

  it('makes a package of up to 14 files flat, and 15 not', () => {
    const flat = buildBlueprintTree([...many('a/x', 7), ...many('a/y', 7)])
    expect(BLUEPRINT_FLAT_MAX_FILES).toBe(14)
    expect(flat.packages).toEqual([])
    expect(flat.files).toHaveLength(14)
    expect(flat.files).toEqual([...flat.files].sort())

    const deep = buildBlueprintTree([...many('a/x', 7), ...many('a/y', 8)])
    expect(deep.packages.map((p) => [p.name, p.dir, p.files.length])).toEqual([
      ['x', 'a/x', 7],
      ['y', 'a/y', 8],
    ])
    expect(deep.files).toEqual([])
  })

  it('steps through a level that is one package plus a couple of loose files', () => {
    const many = (dir: string, n: number) => Array.from({ length: n }, (_, i) => `${dir}/f${String(i).padStart(2, '0')}.ts`)
    const root = buildBlueprintTree(['lint.sh', 'vitest.config.ts', ...many('src/main', 10), ...many('src/test', 10)])
    expect(root.dir).toBe('')
    expect(root.packages.map((p) => [p.dir, p.name])).toEqual([
      ['src/main', 'main'],
      ['src/test', 'test'],
    ])
    expect(root.files).toEqual(['lint.sh', 'vitest.config.ts'])
    expect(root.allFiles).toHaveLength(22)

    const kept = buildBlueprintTree(['a.sh', 'b.sh', 'c.sh', ...many('src/main', 10), ...many('src/test', 10)])
    expect(kept.packages.map((p) => p.dir)).toEqual(['src'])
  })

  it('handles an empty change and repeated paths', () => {
    expect(buildBlueprintTree([])).toEqual({ dir: '', name: '', packages: [], files: [], allFiles: [] })
    expect(buildBlueprintTree(['a.ts', 'a.ts']).files).toEqual(['a.ts'])
  })
})

describe('findBlueprintPackage', () => {
  const root = buildBlueprintTree(chain)

  it('finds a package by its real folder', () => {
    expect(findBlueprintPackage(root, '')).toBe(root)
    expect(findBlueprintPackage(root, 'app/web/src/ui')?.name).toBe('ui')
    expect(findBlueprintPackage(root, 'app/web/src')?.name).toBe('web/src')
  })

  it('returns null for folders that are not packages', () => {
    expect(findBlueprintPackage(root, 'app/web')).toBeNull()
    expect(findBlueprintPackage(root, 'nope')).toBeNull()
  })
})

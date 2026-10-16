import { describe, expect, it } from 'vitest'
import { makeTreeFile } from '@/test/fixtures'
import { allFolderIds, ancestorsOf, buildFileTree, countReviewed, filterTree, flattenTree, naturalCompare, type TreeNode } from './file-tree'

const paths = [
  'src/components/diff/CardDeck.tsx',
  'src/components/diff/ScrollList.tsx',
  'src/lib/mode.ts',
  'src/lib/file10.ts',
  'src/lib/file2.ts',
  'README.md',
  'package.json',
  'docs/guide/intro/Start.md',
]

const tree = buildFileTree(paths.map((path) => makeTreeFile({ path })))

function names(nodes: readonly TreeNode[]): string[] {
  return nodes.map((node) => (node.kind === 'folder' ? `${node.name}/` : node.name))
}

function folder(nodes: readonly TreeNode[], id: string) {
  const node = nodes.find((candidate) => candidate.id === id)
  if (!node || node.kind !== 'folder') throw new Error(`no folder ${id}`)
  return node
}

describe('buildFileTree', () => {
  it('puts folders before files in natural order', () => {
    expect(names(tree)).toEqual(['docs/guide/intro/', 'src/', 'package.json', 'README.md'])
    expect(names(folder(folder(tree, 'src').children, 'src/lib').children)).toEqual(['file2.ts', 'file10.ts', 'mode.ts'])
  })

  it('collapses single-child folder chains into one row with the full path as id', () => {
    const docs = folder(tree, 'docs/guide/intro')
    expect(docs.name).toBe('docs/guide/intro')
    expect(names(docs.children)).toEqual(['Start.md'])
    const src = folder(tree, 'src')
    expect(names(src.children)).toEqual(['components/diff/', 'lib/'])
    expect(folder(src.children, 'src/components/diff').paths).toEqual(['src/components/diff/CardDeck.tsx', 'src/components/diff/ScrollList.tsx'])
  })

  it('counts every file below a folder', () => {
    expect(folder(tree, 'src').paths).toHaveLength(5)
    expect(countReviewed(folder(tree, 'src').paths, (path) => path.endsWith('.tsx'))).toBe(2)
  })
})

describe('filterTree', () => {
  it('keeps matching files and the folders leading to them, case-insensitively', () => {
    const filtered = filterTree(tree, 'CARDDECK')
    expect(names(filtered)).toEqual(['src/'])
    const src = folder(filtered, 'src')
    expect(names(src.children)).toEqual(['components/diff/'])
    expect(src.paths).toEqual(['src/components/diff/CardDeck.tsx'])
  })

  it('matches on the whole path and returns everything for a blank query', () => {
    expect(names(filterTree(tree, 'lib/'))).toEqual(['src/'])
    expect(filterTree(tree, '   ')).toHaveLength(tree.length)
    expect(filterTree(tree, 'nothing-here')).toEqual([])
  })
})

describe('flattenTree, allFolderIds and ancestorsOf', () => {
  it('lists the visible rows with their depth', () => {
    const rows = flattenTree(tree, (id) => id === 'src')
    expect(rows.map((row) => `${row.depth}:${row.node.id}`)).toEqual([
      '0:docs/guide/intro',
      '0:src',
      '1:src/components/diff',
      '1:src/lib',
      '0:package.json',
      '0:README.md',
    ])
    expect(rows[2]?.parentId).toBe('src')
  })

  it('knows every folder and the way down to a file', () => {
    expect(allFolderIds(tree)).toEqual(['docs/guide/intro', 'src', 'src/components/diff', 'src/lib'])
    expect(ancestorsOf(tree, 'src/components/diff/CardDeck.tsx')).toEqual(['src', 'src/components/diff'])
    expect(ancestorsOf(tree, 'README.md')).toEqual([])
    expect(ancestorsOf(tree, 'src/unknown.ts')).toEqual(['src'])
  })

  it('compares naturally', () => {
    expect(['b10', 'a', 'B2'].sort(naturalCompare)).toEqual(['a', 'B2', 'b10'])
  })
})

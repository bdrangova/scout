import { COLLAPSE_MAX_BYTES, parsePatchLines } from '@review-dash/shared'
import type { FileDiffMetadata } from '@pierre/diffs/react'
import { describe, expect, it, vi } from 'vitest'
import { makeTreeFile } from '@/test/fixtures'
import { canExpandContext, contentsLoader, fetchFileSides, fullFileRows } from './expand-context'

const apiGet = vi.hoisted(() => vi.fn((path: string) => Promise.resolve(`<${path}>`)))
vi.mock('@/lib/api', () => ({ apiGet }))

describe('canExpandContext', () => {
  it('is true for a modified or renamed text file whose sides are within the collapse limit', () => {
    expect(canExpandContext(makeTreeFile({ status: 'modified', sizeBefore: 10, sizeAfter: COLLAPSE_MAX_BYTES }))).toBe(true)
    expect(canExpandContext(makeTreeFile({ status: 'renamed', oldPath: 'a.ts', sizeBefore: 10, sizeAfter: 12 }))).toBe(true)
  })

  it('is false for added, deleted, binary and omitted files, and for a side over the limit or unknown', () => {
    expect(canExpandContext(makeTreeFile({ status: 'added', sizeBefore: null, sizeAfter: 10 }))).toBe(false)
    expect(canExpandContext(makeTreeFile({ status: 'deleted', sizeBefore: 10, sizeAfter: null }))).toBe(false)
    expect(canExpandContext(makeTreeFile({ status: 'modified', binary: true, sizeBefore: 10, sizeAfter: 10 }))).toBe(false)
    expect(canExpandContext(makeTreeFile({ status: 'modified', omitted: true, sizeBefore: 10, sizeAfter: 10 }))).toBe(false)
    expect(canExpandContext(makeTreeFile({ status: 'modified', sizeBefore: 10, sizeAfter: COLLAPSE_MAX_BYTES + 1 }))).toBe(false)
    expect(canExpandContext(makeTreeFile({ status: 'modified', sizeBefore: null, sizeAfter: 10 }))).toBe(false)
  })
})

describe('fetchFileSides and contentsLoader', () => {
  it('reads both sides from the file routes (the scope routes when a scope is given)', async () => {
    await expect(fetchFileSides('sid', 'src/a b.ts', null)).resolves.toEqual({
      before: '</sessions/sid/files/src/a%20b.ts/contents?side=before>',
      after: '</sessions/sid/files/src/a%20b.ts/contents?side=after>',
    })
    await expect(fetchFileSides('sid', 'a.ts', 'abc123')).resolves.toMatchObject({ before: '</sessions/sid/scopes/abc123/files/a.ts/contents?side=before>' })
  })

  it('names the loaded files as the diff does, the old side after a rename', async () => {
    const load = vi.fn(() => Promise.resolve({ before: 'old', after: 'new' }))
    const loader = contentsLoader(load)
    const renamed = { name: 'b.ts', prevName: 'a.ts' } as FileDiffMetadata
    await expect(loader(renamed)).resolves.toEqual({ oldFile: { name: 'a.ts', contents: 'old' }, newFile: { name: 'b.ts', contents: 'new' } })
    await expect(loader({ name: 'c.ts' } as FileDiffMetadata)).resolves.toMatchObject({ oldFile: { name: 'c.ts' } })
  })
})

const PATCH = `@@ -4,3 +4,4 @@
 four
-five
+FIVE
+five-and-a-half
 six
@@ -10,2 +11,2 @@
 ten
-eleven
+ELEVEN
`

const BEFORE = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'].join('\n') + '\n'
const AFTER = ['one', 'two', 'three', 'four', 'FIVE', 'five-and-a-half', 'six', 'seven', 'eight', 'nine', 'ten', 'ELEVEN', 'twelve'].join('\n')

describe('fullFileRows', () => {
  it('fills the lines before, between and after the hunks as context rows numbered on both sides', () => {
    const rows = fullFileRows(parsePatchLines(PATCH), { before: BEFORE, after: AFTER })
    expect(rows.map((row) => `${row.old ?? '-'}:${row.new ?? '-'}${row.kind === 'context' ? '' : row.kind === 'add' ? '+' : '-'}`)).toEqual([
      '1:1', '2:2', '3:3',
      '4:4', '5:--', '-:5+', '-:6+', '6:7',
      '7:8', '8:9', '9:10',
      '10:11', '11:--', '-:12+',
      '12:13',
    ])
    expect(rows[1]).toEqual({ kind: 'context', old: 2, new: 2, text: 'two' })
    expect(rows[rows.length - 1]).toEqual({ kind: 'context', old: 12, new: 13, text: 'twelve' })
  })

  it('leaves a patch that already covers the whole file alone', () => {
    const rows = parsePatchLines('@@ -1,2 +1,2 @@\n a\n-b\n+c\n')
    expect(fullFileRows(rows, { before: 'a\nb\n', after: 'a\nc\n' })).toEqual(rows)
  })
})

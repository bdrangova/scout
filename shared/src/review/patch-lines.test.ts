import { describe, expect, it } from 'vitest'
import { anchorKey, anchorLabel, formatLineAnchor } from './line-anchor.ts'
import { anchorExcerpt, anchorInPatch, filePatchFor, parsePatchLines } from './patch-lines.ts'

const A_PATCH = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 import x from 'x'
-const a = 1
+const a = 2
+const b = 3
 export { a }
@@ -20,3 +21,3 @@ function f() {
   return 1
-  // old
+  // new
 }
`

const DELETED_PATCH = `diff --git a/gone.ts b/gone.ts
deleted file mode 100644
index 3333333..0000000
--- a/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-one
-two
`

const lines = parsePatchLines(A_PATCH)

describe('parsePatchLines', () => {
  it('numbers every content line on the sides it exists on, across hunks', () => {
    expect(lines).toEqual([
      { kind: 'context', old: 1, new: 1, text: "import x from 'x'" },
      { kind: 'del', old: 2, new: null, text: 'const a = 1' },
      { kind: 'add', old: null, new: 2, text: 'const a = 2' },
      { kind: 'add', old: null, new: 3, text: 'const b = 3' },
      { kind: 'context', old: 3, new: 4, text: 'export { a }' },
      { kind: 'context', old: 20, new: 21, text: '  return 1' },
      { kind: 'del', old: 21, new: null, text: '  // old' },
      { kind: 'add', old: null, new: 22, text: '  // new' },
      { kind: 'context', old: 22, new: 23, text: '}' },
    ])
  })

  it('handles a deleted file and ignores the no-newline marker', () => {
    expect(parsePatchLines(`${DELETED_PATCH}\\ No newline at end of file\n`)).toEqual([
      { kind: 'del', old: 1, new: null, text: 'one' },
      { kind: 'del', old: 2, new: null, text: 'two' },
    ])
    expect(parsePatchLines('')).toEqual([])
  })
})

describe('filePatchFor', () => {
  it('finds a file section in a concatenated patch, including a deleted file', () => {
    const all = A_PATCH + DELETED_PATCH
    expect(filePatchFor(all, 'src/a.ts')).toBe(A_PATCH)
    expect(filePatchFor(all, 'gone.ts')).toBe(DELETED_PATCH)
    expect(filePatchFor(all, 'src/missing.ts')).toBeNull()
  })
})

describe('anchors', () => {
  it('knows which anchors are still in the patch', () => {
    expect(anchorInPatch(lines, { side: 'new', line: 3 })).toBe(true)
    expect(anchorInPatch(lines, { side: 'old', line: 2 })).toBe(true)
    expect(anchorInPatch(lines, { side: 'new', line: 2, endLine: 4 })).toBe(true)
    expect(anchorInPatch(lines, { side: 'new', line: 10 })).toBe(false)
    expect(anchorInPatch(lines, { side: 'new', line: 2, endLine: 10 })).toBe(false)
    expect(anchorInPatch(lines, { side: 'old', line: 5 })).toBe(false)
  })

  it('excerpts the anchored line with a neighbour each side, numbered on its own side', () => {
    expect(anchorExcerpt(lines, { side: 'new', line: 3 })).toEqual(['2 + const a = 2', '3 + const b = 3', '4   export { a }'])
    expect(anchorExcerpt(lines, { side: 'old', line: 2 })).toEqual(["1   import x from 'x'", '2 - const a = 1', '  + const a = 2'])
    expect(anchorExcerpt(lines, { side: 'new', line: 1 })).toEqual(["1   import x from 'x'", '  - const a = 1'])
    expect(anchorExcerpt(lines, { side: 'new', line: 99 })).toEqual([])
  })

  it('excerpts the first lines of a range and marks the cut', () => {
    expect(anchorExcerpt(lines, { side: 'new', line: 2, endLine: 3 })).toEqual(['2 + const a = 2', '3 + const b = 3'])
    expect(anchorExcerpt(lines, { side: 'new', line: 1, endLine: 4 })).toEqual(["1   import x from 'x'", '2 + const a = 2', '3 + const b = 3', '…'])
  })

  it('formats anchors for the feedback, the UI and grouping', () => {
    expect(formatLineAnchor({ side: 'new', line: 12 })).toBe('12')
    expect(formatLineAnchor({ side: 'new', line: 10, endLine: 14 })).toBe('10-14')
    expect(formatLineAnchor({ side: 'old', line: 3, endLine: 3 })).toBe('3 (old)')
    expect(anchorLabel({ side: 'new', line: 12 })).toBe('line 12')
    expect(anchorLabel({ side: 'old', line: 10, endLine: 14 })).toBe('old lines 10–14')
    expect(anchorKey({ side: 'new', line: 12 })).toBe('new:12')
    expect(anchorKey({ side: 'old', line: 3, endLine: 5 })).toBe('old:3-5')
  })
})

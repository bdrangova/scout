import { describe, expect, it } from 'vitest'
import { searchPatch } from './search.ts'

const patch = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@
 const Keep = 1
-const gone = Keep
+const added = KEEP
`

describe('searchPatch', () => {
  it('matches case-insensitively, numbering deletions on the old side', () => {
    expect(searchPatch('a.ts', patch, 'keep')?.hits).toEqual([
      { side: 'new', line: 1, kind: 'context', text: 'const Keep = 1' },
      { side: 'old', line: 2, kind: 'del', text: 'const gone = Keep' },
      { side: 'new', line: 2, kind: 'add', text: 'const added = KEEP' },
    ])
  })

  it('caps the hits and says so, and returns null without any', () => {
    expect(searchPatch('a.ts', patch, 'keep', 1)).toMatchObject({ truncated: true, hits: [{ line: 1 }] })
    expect(searchPatch('a.ts', patch, 'nothing')).toBeNull()
  })
})

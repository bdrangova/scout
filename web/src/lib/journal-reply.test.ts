import { describe, expect, it } from 'vitest'
import { replyTargetFor } from './journal-reply'
import { makeEntry } from '@/test/journal'

const PATCH = 'diff --git a/src/other.ts b/src/other.ts\n--- a/src/other.ts\n+++ b/src/other.ts\n@@ -1,2 +1,3 @@\n a\n+b\n c\n'
const load = () => Promise.resolve(PATCH)

describe('replyTargetFor', () => {
  it('is overall for a session-level note and the file for an unanchored one', async () => {
    expect(await replyTargetFor(makeEntry('j1', { file: null }), 's', load)).toEqual({ kind: 'overall', ref: null })
    expect(await replyTargetFor(makeEntry('j1'), 's', load)).toEqual({ kind: 'file', ref: 'src/other.ts' })
  })

  it('uses the relocated lines, and the file when the line is gone or the patch cannot be loaded', async () => {
    const moved = makeEntry('j1', { anchor: { side: 'new', line: 8, snippet: 'b' } })
    expect(await replyTargetFor(moved, 's', load)).toEqual({ kind: 'file', ref: 'src/other.ts', anchor: { side: 'new', line: 2 } })
    const gone = makeEntry('j1', { anchor: { side: 'new', line: 2, snippet: 'nope' } })
    expect(await replyTargetFor(gone, 's', load)).toEqual({ kind: 'file', ref: 'src/other.ts' })
    expect(await replyTargetFor(moved, 's', () => Promise.reject(new Error('410')))).toEqual({ kind: 'file', ref: 'src/other.ts' })
  })
})

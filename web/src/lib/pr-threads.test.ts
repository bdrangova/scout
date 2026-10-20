import { buildPrCommentsResponse, parsePatchLines } from '@review-dash/shared'
import { makePrComment, makePrComments, makePrResolution } from '@review-dash/shared/testing/fixtures'
import { describe, expect, it } from 'vitest'
import { groupPrThreads, placePrThreads, prCountsByPath, threadsForPath } from './pr-threads'

const PATCH = `diff --git a/src/a.tsx b/src/a.tsx
--- a/src/a.tsx
+++ b/src/a.tsx
@@ -10,3 +10,4 @@
 context
-old
+new line 11
+new line 12
 tail
`

function views() {
  const comments = [
    makePrComment({ githubId: 1, path: 'src/a.tsx', line: 12 }),
    makePrComment({ githubId: 2, path: 'src/a.tsx', line: 12, inReplyTo: 'rc1', threadId: 'rc1' }),
    makePrComment({ githubId: 3, path: 'src/a.tsx', line: null, outdated: true, originalLine: 4 }),
    makePrComment({ githubId: 4, path: 'src/a.tsx', line: 90 }),
    makePrComment({ githubId: 5, path: 'src/b.ts', line: 3 }),
    makePrComment({ githubId: 6, kind: 'general', path: null, line: null, side: null }),
  ]
  const resolutions = { schemaVersion: 2 as const, sessionId: makePrComments().sessionId, updatedAt: '2026-10-05T10:00:00.000Z', comments: { rc4: makePrResolution() } }
  return buildPrCommentsResponse(makePrComments(comments), resolutions, null).comments
}

describe('pr threads', () => {
  it('nests replies under their root and keeps display order', () => {
    const threads = groupPrThreads(views())
    expect(threads.map((thread) => thread.root.id).sort()).toEqual(['rc1', 'rc3', 'rc4', 'rc5', 'rc6'])
    const first = threads.find((thread) => thread.root.id === 'rc1')
    expect(first?.replies.map((reply) => reply.id)).toEqual(['rc2'])
  })

  it('keeps only the line threads of the path', () => {
    const threads = threadsForPath(groupPrThreads(views()), 'src/a.tsx')
    expect(threads.map((thread) => thread.root.id).sort()).toEqual(['rc1', 'rc3', 'rc4'])
  })

  it('counts threads and open ones per file, replies and general comments excluded', () => {
    const counts = prCountsByPath(groupPrThreads(views()))
    expect(counts.get('src/a.tsx')).toEqual({ total: 3, open: 1 })
    expect(counts.get('src/b.ts')).toEqual({ total: 1, open: 1 })
    expect(counts.size).toBe(2)
  })

  it('places a thread under its line and leaves outdated ones and lines outside the diff unplaced', () => {
    const threads = threadsForPath(groupPrThreads(views()), 'src/a.tsx')
    const { placed, unplaced } = placePrThreads(parsePatchLines(PATCH), threads)
    expect(placed.map(({ thread }) => thread.root.id)).toEqual(['rc1'])
    expect(placed[0]?.anchor).toEqual({ side: 'new', line: 12 })
    expect(unplaced.map((thread) => thread.root.id).sort()).toEqual(['rc3', 'rc4'])
  })
})

import { describe, expect, it } from 'vitest'
import { ReviewSchema } from '../schemas/review.ts'
import { SentSnapshotSchema } from '../schemas/sent.ts'
import { T0, T1, T2, fp, makeComment, makeResolution, makeResolutions, makeReview, makeTree, makeTreeFile } from '../testing/fixtures.ts'
import { buildSentSnapshot, sentFileStem, sentPatchPath, stampSent } from './sent.ts'

const tree = makeTree({
  files: [
    makeTreeFile({ path: 'src/a.tsx' }),
    makeTreeFile({ path: 'src/b.ts' }),
    makeTreeFile({ path: 'src/c.ts', status: 'added', sizeBefore: null, additions: 40, deletions: 0 }),
    makeTreeFile({ path: 'src/d.ts' }),
  ],
})

const reviewed = makeReview({
  files: {
    'src/a.tsx': { verdict: 'rejected', fingerprint: fp('src/a.tsx'), viewed: true },
    'src/b.ts': { verdict: 'none', fingerprint: null, viewed: true },
    'src/c.ts': { verdict: 'approved', fingerprint: fp('src/c.ts'), viewed: true },
    'src/d.ts': { verdict: 'approved', fingerprint: fp('stale'), viewed: true },
    'src/gone.ts': { verdict: 'approved', fingerprint: fp('src/gone.ts'), viewed: true },
  },
  comments: [
    makeComment({ id: 'c1', target: { kind: 'file', ref: 'src/a.tsx' }, body: 'No.' }),
    makeComment({ id: 'c2', target: { kind: 'file', ref: 'src/b.ts' }, body: 'Nit.' }),
    makeComment({ id: 'c3', target: { kind: 'overall', ref: null }, body: 'Looks fine overall.', sentAt: T0 }),
    makeComment({ id: 'c4', target: { kind: 'file', ref: 'src/b.ts' }, body: 'Already handled.' }),
    makeComment({ id: 'c5', target: { kind: 'evidence', ref: 'trial-bar.png' }, body: 'Done by me.', resolvedAt: T1 }),
  ],
})

describe('sent file names', () => {
  it('derives the stem and the patch path from sentAt', () => {
    expect(sentFileStem(T2)).toBe('2026-09-26T19-30-00.000Z')
    expect(sentPatchPath(T2)).toBe('review/sent/2026-09-26T19-30-00.000Z.patch')
  })
})

describe('buildSentSnapshot', () => {
  it('collects the open comments, the effective verdicts with tree facts, the shas and the counts', () => {
    const sent = buildSentSnapshot({
      review: reviewed,
      tree,
      decision: 'request-changes',
      resolutions: makeResolutions({ c4: makeResolution({ at: T1 }) }),
      now: T2,
    })
    expect(SentSnapshotSchema.parse(sent)).toEqual(sent)
    expect(sent).toMatchObject({
      schemaVersion: 2,
      sessionId: reviewed.sessionId,
      sentAt: T2,
      decision: 'request-changes',
      tree: { baseSha: tree.baseSha, headSha: tree.headSha, branch: 'feature/trial-bar' },
      patchPath: 'review/sent/2026-09-26T19-30-00.000Z.patch',
    })
    expect(sent.files).toEqual([
      { path: 'src/a.tsx', verdict: 'rejected', fingerprint: fp('src/a.tsx'), status: 'modified', additions: 10, deletions: 2 },
      { path: 'src/c.ts', verdict: 'approved', fingerprint: fp('src/c.ts'), status: 'added', additions: 40, deletions: 0 },
    ])
    expect(sent.comments.map((c) => [c.id, c.sentAt])).toEqual([
      ['c1', T2],
      ['c2', T2],
      ['c3', T2],
    ])
    expect(sent.comments[0]).not.toHaveProperty('status')
    // d.ts changed since its verdict → unreviewed; b.ts has only comments → commented
    expect(sent.counts).toEqual({ files: 4, approved: 1, rejected: 1, commented: 1, unreviewed: 1, openComments: 3 })
  })

  it('is empty for an untouched review', () => {
    const sent = buildSentSnapshot({ review: makeReview(), tree: makeTree(), decision: 'approve', resolutions: null, now: T1 })
    expect(sent.files).toEqual([])
    expect(sent.comments).toEqual([])
    expect(sent.counts).toEqual({ files: 3, approved: 0, rejected: 0, commented: 0, unreviewed: 3, openComments: 0 })
  })
})

describe('stampSent', () => {
  it('records the send on the review and stamps only the included comments', () => {
    const sent = buildSentSnapshot({
      review: reviewed,
      tree,
      decision: 'reject',
      resolutions: makeResolutions({ c4: makeResolution({ at: T1 }) }),
      now: T2,
    })
    const stamped = stampSent(reviewed, sent, T2)
    expect(ReviewSchema.parse(stamped)).toEqual(stamped)
    expect(stamped.sent).toEqual({ at: T2, decision: 'reject' })
    expect(stamped.overall.decision).toBe('reject')
    expect(stamped.updatedAt).toBe(T2)
    expect(stamped.comments.map((c) => [c.id, c.sentAt])).toEqual([
      ['c1', T2],
      ['c2', T2],
      ['c3', T2],
      ['c4', null],
      ['c5', null],
    ])
    expect(reviewed.sent).toBeNull()
    expect(reviewed.comments[0]?.sentAt).toBeNull()
  })
})

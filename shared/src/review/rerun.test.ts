import { describe, expect, it } from 'vitest'
import { makeComment, makeReview } from '../testing/fixtures.ts'
import { commentsSince, runFileOwners, unapproveCommented } from './rerun.ts'

const NOW = '2026-09-27T09:00:00.000Z'
const approved = { verdict: 'approved' as const, fingerprint: '0123456789abcdef', viewed: true }

describe('unapproveCommented', () => {
  it('clears approved items with a comment, keeps rejected and uncommented ones', () => {
    const files = { 'src/a.tsx': approved, 'src/b.tsx': approved, 'src/c.tsx': { ...approved, verdict: 'rejected' as const } }
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'c2', target: { kind: 'file', ref: 'src/c.tsx' } }),
      makeComment({ id: 'c3', target: { kind: 'overall', ref: null } }),
    ]
    const review = makeReview({ files, comments })
    const next = unapproveCommented(review, comments, NOW)
    expect(next.files).toEqual({
      'src/a.tsx': { verdict: 'none', fingerprint: null, viewed: true },
      'src/b.tsx': approved,
      'src/c.tsx': files['src/c.tsx'],
    })
    expect(next.updatedAt).toBe(NOW)
  })

  it('maps a run-file comment to the scenario holding the file', () => {
    const index = {
      scenarios: [{ id: 's1', evidence: { videos: [], screenshots: [{ path: 'run:s1/shot.png' }], data: [] } }],
    } as unknown as Parameters<typeof runFileOwners>[0]
    const comments = [makeComment({ target: { kind: 'run-file', ref: 'run:s1/shot.png' } })]
    const review = makeReview({ files: { s1: approved }, comments })
    expect(unapproveCommented(review, comments, NOW, runFileOwners(index)).files['s1']?.verdict).toBe('none')
    expect(unapproveCommented(review, comments, NOW)).toBe(review)
  })

  it('returns the same review when nothing changes', () => {
    const review = makeReview({ comments: [makeComment()] })
    expect(unapproveCommented(review, review.comments, NOW)).toBe(review)
  })
})

describe('commentsSince', () => {
  it('picks comments created, edited or reopened after the time', () => {
    const since = '2026-09-26T12:00:00.000Z'
    const review = makeReview({
      comments: [
        makeComment({ id: 'c1', createdAt: '2026-09-26T10:00:00.000Z' }),
        makeComment({ id: 'c2', createdAt: '2026-09-26T13:00:00.000Z' }),
        makeComment({ id: 'c3', createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T13:00:00.000Z' }),
        makeComment({ id: 'c4', createdAt: '2026-09-26T10:00:00.000Z', reopenedAt: '2026-09-26T13:00:00.000Z' }),
      ],
    })
    expect(commentsSince(review, since).map((comment) => comment.id)).toEqual(['c2', 'c3', 'c4'])
  })
})

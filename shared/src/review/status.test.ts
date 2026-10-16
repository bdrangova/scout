import { describe, expect, it } from 'vitest'
import {
  SESSION_ID,
  T0,
  T1,
  T2,
  fp,
  makeComment,
  makeManifest,
  makeResolution,
  makeResolutions,
  makeReview,
  makeTree,
  makeTreeFile,
} from '../testing/fixtures.ts'
import { anyFileUpdated, commentStatus, effectiveVerdict, fileIsUpdated, mergeComments, progress, sessionStatus } from './status.ts'

describe('commentStatus', () => {
  it('is open without any event', () => {
    expect(commentStatus(makeComment(), null)).toBe('open')
  })

  it('agent resolve then reviewer reopen → open', () => {
    expect(commentStatus(makeComment({ reopenedAt: T2 }), makeResolution({ at: T1 }))).toBe('open')
  })

  it('reviewer reopen then agent resolve → resolved', () => {
    expect(commentStatus(makeComment({ reopenedAt: T1 }), makeResolution({ at: T2 }))).toBe('resolved')
  })

  it('reviewer resolvedAt → resolved, also after a reopen', () => {
    expect(commentStatus(makeComment({ resolvedAt: T1 }), null)).toBe('resolved')
    expect(commentStatus(makeComment({ reopenedAt: T1, resolvedAt: T2 }), null)).toBe('resolved')
  })

  it('an agent reply that keeps the comment open wins when it is the latest event', () => {
    expect(commentStatus(makeComment({ resolvedAt: T1 }), makeResolution({ status: 'open', at: T2 }))).toBe('open')
  })

  it('reopen wins a timestamp tie', () => {
    expect(commentStatus(makeComment({ reopenedAt: T1 }), makeResolution({ at: T1 }))).toBe('open')
  })
})

describe('mergeComments', () => {
  it('attaches status and resolution per comment', () => {
    const r = makeReview({ comments: [makeComment({ id: 'c1' }), makeComment({ id: 'c2', target: { kind: 'overall', ref: null } })] })
    const merged = mergeComments(r, makeResolutions({ c1: makeResolution() }))
    expect(merged.map((c) => [c.id, c.status, c.resolution?.note ?? null])).toEqual([
      ['c1', 'resolved', 'Renamed.'],
      ['c2', 'open', null],
    ])
  })

  it('treats missing resolutions as open', () => {
    const merged = mergeComments(makeReview({ comments: [makeComment()] }), null)
    expect(merged[0]?.status).toBe('open')
    expect(merged[0]?.resolution).toBeNull()
  })
})

describe('fileIsUpdated and effectiveVerdict', () => {
  const file = makeTreeFile({ path: 'src/a.tsx' })

  it('is true for a judged file whose fingerprint moved on', () => {
    expect(fileIsUpdated({ verdict: 'approved', fingerprint: fp('old'), viewed: true }, file)).toBe(true)
    expect(effectiveVerdict({ verdict: 'approved', fingerprint: fp('old'), viewed: true }, file)).toBe('none')
  })

  it('is false without an entry, without a verdict, without a fingerprint, or when unchanged', () => {
    expect(fileIsUpdated(null, file)).toBe(false)
    expect(fileIsUpdated(undefined, file)).toBe(false)
    expect(fileIsUpdated({ verdict: 'none', fingerprint: fp('old'), viewed: true }, file)).toBe(false)
    expect(fileIsUpdated({ verdict: 'approved', fingerprint: null, viewed: true }, file)).toBe(false)
    expect(fileIsUpdated({ verdict: 'rejected', fingerprint: file.fingerprint, viewed: true }, file)).toBe(false)
    expect(effectiveVerdict({ verdict: 'rejected', fingerprint: file.fingerprint, viewed: true }, file)).toBe('rejected')
    expect(effectiveVerdict(undefined, file)).toBe('none')
  })
})

describe('sessionStatus', () => {
  const tree = makeTree()

  it('unreviewed without a review or with an untouched one', () => {
    expect(sessionStatus({ review: null, tree, resolutions: null, activeRun: false })).toBe('unreviewed')
    expect(sessionStatus({ review: makeReview(), tree, resolutions: null, activeRun: false })).toBe('unreviewed')
  })

  it('in-progress with a verdict or a comment', () => {
    const withVerdict = makeReview({ files: { 'src/a.tsx': { verdict: 'approved', fingerprint: fp('src/a.tsx'), viewed: true } } })
    expect(sessionStatus({ review: withVerdict, tree, resolutions: null, activeRun: false })).toBe('in-progress')
    const withComment = makeReview({ comments: [makeComment()] })
    expect(sessionStatus({ review: withComment, tree, resolutions: null, activeRun: false })).toBe('in-progress')
  })

  it('sent after a request-changes submit with nothing new since', () => {
    const r = makeReview({
      sent: { at: T1, decision: 'request-changes' },
      files: { 'src/a.tsx': { verdict: 'rejected', fingerprint: fp('src/a.tsx'), viewed: true } },
    })
    expect(sessionStatus({ review: r, tree, resolutions: null, activeRun: false })).toBe('sent')
    expect(sessionStatus({ review: r, tree, resolutions: makeResolutions({}, T0), activeRun: false })).toBe('sent')
  })

  it('agent-working while a run is active, whatever the review says', () => {
    const r = makeReview({ sent: { at: T1, decision: 'approve' } })
    expect(sessionStatus({ review: r, tree, resolutions: null, activeRun: true })).toBe('agent-working')
  })

  it('updated when a judged file changed since the send, or the agent wrote resolutions after it', () => {
    const r = makeReview({
      sent: { at: T1, decision: 'request-changes' },
      files: { 'src/a.tsx': { verdict: 'rejected', fingerprint: fp('before-fix'), viewed: true } },
    })
    expect(sessionStatus({ review: r, tree, resolutions: null, activeRun: false })).toBe('updated')
    const unchanged = makeReview({ sent: { at: T1, decision: 'request-changes' } })
    expect(sessionStatus({ review: unchanged, tree, resolutions: makeResolutions({ c1: makeResolution({ at: T2 }) }, T2), activeRun: false })).toBe('updated')
  })

  it('approved when the last send approved and every file is still effectively approved', () => {
    const r = makeReview({
      sent: { at: T1, decision: 'approve' },
      files: {
        'src/a.tsx': { verdict: 'approved', fingerprint: fp('src/a.tsx'), viewed: true },
        'src/b.ts': { verdict: 'approved', fingerprint: fp('src/b.ts'), viewed: true },
        'src/c.ts': { verdict: 'approved', fingerprint: fp('src/c.ts'), viewed: true },
      },
    })
    expect(sessionStatus({ review: r, tree, resolutions: null, activeRun: false })).toBe('approved')
  })

  it('updated, not approved, when every approved file went stale after the approving send', () => {
    const r = makeReview({
      sent: { at: T1, decision: 'approve' },
      files: {
        'src/a.tsx': { verdict: 'approved', fingerprint: fp('older-a'), viewed: true },
        'src/b.ts': { verdict: 'approved', fingerprint: fp('older-b'), viewed: true },
        'src/c.ts': { verdict: 'approved', fingerprint: fp('older-c'), viewed: true },
      },
    })
    expect(sessionStatus({ review: r, tree, resolutions: null, activeRun: false })).toBe('updated')
    expect(progress(r, tree)).toEqual({ reviewed: 0, total: 3 })
  })

  it('updated when one approved file went stale and the others are untouched', () => {
    const r = makeReview({
      sent: { at: T1, decision: 'approve' },
      files: {
        'src/a.tsx': { verdict: 'approved', fingerprint: fp('older-a'), viewed: true },
        'src/b.ts': { verdict: 'approved', fingerprint: fp('src/b.ts'), viewed: true },
        'src/c.ts': { verdict: 'approved', fingerprint: fp('src/c.ts'), viewed: true },
      },
    })
    expect(sessionStatus({ review: r, tree, resolutions: null, activeRun: false })).toBe('updated')
  })

  it('back to approved once the stale files are approved again on their current content', () => {
    const r = makeReview({
      sent: { at: T1, decision: 'approve' },
      files: {
        'src/a.tsx': { verdict: 'approved', fingerprint: fp('src/a.tsx'), viewed: true },
        'src/b.ts': { verdict: 'approved', fingerprint: fp('src/b.ts'), viewed: true },
        'src/c.ts': { verdict: 'approved', fingerprint: fp('src/c.ts'), viewed: true },
      },
    })
    expect(sessionStatus({ review: r, tree, resolutions: null, activeRun: false })).toBe('approved')
  })

  it('sent, not approved, when the approving send left a file without an effective approval', () => {
    const r = makeReview({
      sent: { at: T1, decision: 'approve' },
      files: { 'src/a.tsx': { verdict: 'approved', fingerprint: fp('src/a.tsx'), viewed: true } },
    })
    expect(sessionStatus({ review: r, tree, resolutions: null, activeRun: false })).toBe('sent')
  })

  it('updated, not in-progress or unreviewed, when the only verdict went stale before any send', () => {
    const r = makeReview({ files: { 'src/a.tsx': { verdict: 'approved', fingerprint: fp('older'), viewed: true } } })
    expect(sessionStatus({ review: r, tree, resolutions: null, activeRun: false })).toBe('updated')
  })
})

describe('progress and anyFileUpdated', () => {
  it('counts files with an effective verdict or an open file comment', () => {
    const tree = makeTree()
    expect(progress(null, tree)).toEqual({ reviewed: 0, total: 3 })
    const r = makeReview({
      files: {
        'src/a.tsx': { verdict: 'approved', fingerprint: fp('src/a.tsx'), viewed: true },
        'src/b.ts': { verdict: 'rejected', fingerprint: fp('stale'), viewed: true },
        'src/gone.ts': { verdict: 'rejected', fingerprint: fp('src/gone.ts'), viewed: true },
      },
      comments: [makeComment({ id: 'c1', target: { kind: 'file', ref: 'src/c.ts' } })],
    })
    // a.tsx approved, c.ts commented; b.ts's verdict is stale and gone.ts is not in the tree.
    expect(progress(r, tree)).toEqual({ reviewed: 2, total: 3 })
    expect(anyFileUpdated(r, tree)).toBe(true)
    expect(anyFileUpdated(makeReview(), tree)).toBe(false)
  })

  it('a comment counts until the agent resolves it; other targets never count', () => {
    const tree = makeTree()
    const r = makeReview({
      comments: [
        makeComment({ id: 'c1', target: { kind: 'file', ref: 'src/a.tsx' } }),
        makeComment({ id: 'c2', target: { kind: 'file', ref: 'src/b.ts' } }),
        makeComment({ id: 'c3', target: { kind: 'overall', ref: null } }),
        makeComment({ id: 'c4', target: { kind: 'evidence', ref: 'e1' } }),
      ],
    })
    expect(progress(r, tree)).toEqual({ reviewed: 2, total: 3 })
    const resolved = makeResolutions({ c2: makeResolution({ status: 'resolved', at: T2 }) })
    expect(progress(r, tree, resolved)).toEqual({ reviewed: 1, total: 3 })
  })

  it('uses the shared fixtures consistently', () => {
    expect(makeManifest().id).toBe(SESSION_ID)
    expect(makeTree().stats.files).toBe(3)
  })
})

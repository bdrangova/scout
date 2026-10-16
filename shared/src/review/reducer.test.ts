import { describe, expect, it } from 'vitest'
import { ReviewSchema } from '../schemas/review.ts'
import type { Review } from '../schemas/review.ts'
import { T0, T1, T2, T3, fp, makeComment, makeReview, makeTreeFile } from '../testing/fixtures.ts'
import { initialReviewState, nextUnreviewedFile, reviewReducer } from './reducer.ts'
import type { ReviewAction, ReviewContext, ReviewState } from './reducer.ts'

const A = 'src/a.tsx'
const B = 'src/b.ts'
const C = 'src/c.ts'
const files = [makeTreeFile({ path: A }), makeTreeFile({ path: B }), makeTreeFile({ path: C })]
const ctx: ReviewContext = { files }

function run(state: ReviewState, actions: ReviewAction[], context: ReviewContext = ctx): ReviewState {
  return actions.reduce((current, action) => reviewReducer(current, action, context), state)
}

function start(overrides: Partial<Review> = {}, currentFile: string | null = A): ReviewState {
  return initialReviewState(makeReview({ ...overrides, ui: { mode: 'swipe', currentFile, section: 'files' } }))
}

describe('flow rules', () => {
  it('approve stores the verdict with the fingerprint, marks viewed, and advances', () => {
    const next = run(start(), [{ type: 'SET_VERDICT', path: A, verdict: 'approved', fingerprint: fp(A), now: T1 }])
    expect(next.review.files[A]).toEqual({ verdict: 'approved', fingerprint: fp(A), viewed: true })
    expect(next.review.ui.currentFile).toBe(B)
    expect(next.atEnd).toBe(false)
    expect(next.review.updatedAt).toBe(T1)
    expect(next.pendingReject).toBeNull()
  })

  it('falls back to the tree fingerprint when the action carries none', () => {
    const next = run(start(), [{ type: 'SET_VERDICT', path: B, verdict: 'approved', fingerprint: null, now: T1 }])
    expect(next.review.files[B]?.fingerprint).toBe(fp(B))
    const unknown = run(start(), [{ type: 'SET_VERDICT', path: 'gone.ts', verdict: 'approved', fingerprint: null, now: T1 }])
    expect(unknown.review.files['gone.ts']?.fingerprint).toBeNull()
  })

  it('a file comment advances without storing a verdict', () => {
    const next = run(start(), [{ type: 'ADD_COMMENT', target: { kind: 'file', ref: A }, body: 'Rename.', now: T1 }])
    expect(next.review.comments).toEqual([
      {
        id: 'c1',
        target: { kind: 'file', ref: A },
        body: 'Rename.',
        timestampSec: null,
        createdAt: T1,
        updatedAt: null,
        sentAt: null,
        resolvedAt: null,
        reopenedAt: null,
      },
    ])
    expect(next.review.nextCommentId).toBe(2)
    expect(next.review.files[A]).toBeUndefined()
    expect(next.review.ui.currentFile).toBe(B)
  })

  it('reject waits for a comment, then stores rejected with the tree fingerprint and advances', () => {
    const initial = start()
    const pending = reviewReducer(initial, { type: 'SET_VERDICT', path: A, verdict: 'rejected', fingerprint: fp(A), now: T1 }, ctx)
    expect(pending.pendingReject).toBe(A)
    expect(pending.review).toBe(initial.review)

    const done = reviewReducer(pending, { type: 'ADD_COMMENT', target: { kind: 'file', ref: A }, body: 'No.', now: T2 }, ctx)
    expect(done.pendingReject).toBeNull()
    expect(done.review.files[A]).toEqual({ verdict: 'rejected', fingerprint: fp(A), viewed: true })
    expect(done.review.comments.map((c) => [c.id, c.body])).toEqual([['c1', 'No.']])
    expect(done.review.ui.currentFile).toBe(B)
  })

  it('approve with a comment stores both and advances once', () => {
    const next = run(start(), [{ type: 'SET_VERDICT', path: A, verdict: 'approved', fingerprint: fp(A), comment: '  Nice, but rename x.  ', now: T1 }])
    expect(next.review.files[A]).toEqual({ verdict: 'approved', fingerprint: fp(A), viewed: true })
    expect(next.review.comments.map((c) => [c.id, c.target, c.body])).toEqual([['c1', { kind: 'file', ref: A }, 'Nice, but rename x.']])
    expect(next.review.nextCommentId).toBe(2)
    expect(next.review.ui.currentFile).toBe(B)
  })

  it('reject with a comment is final at once, without waiting for a comment', () => {
    const next = run(start(), [{ type: 'SET_VERDICT', path: A, verdict: 'rejected', fingerprint: fp(A), comment: 'No.', now: T1 }])
    expect(next.pendingReject).toBeNull()
    expect(next.review.files[A]).toEqual({ verdict: 'rejected', fingerprint: fp(A), viewed: true })
    expect(next.review.comments.map((c) => c.body)).toEqual(['No.'])
    expect(next.review.ui.currentFile).toBe(B)
  })

  it('a blank comment next to a verdict is ignored: approve still stores, reject still waits', () => {
    const approved = run(start(), [{ type: 'SET_VERDICT', path: A, verdict: 'approved', fingerprint: fp(A), comment: '   ', now: T1 }])
    expect(approved.review.comments).toEqual([])
    expect(approved.review.files[A]?.verdict).toBe('approved')
    const pending = run(start(), [{ type: 'SET_VERDICT', path: A, verdict: 'rejected', fingerprint: fp(A), comment: '  ', now: T1 }])
    expect(pending.pendingReject).toBe(A)
    expect(pending.review.comments).toEqual([])
  })

  it('a comment on another file while a reject is pending keeps the reject pending', () => {
    const next = run(start(), [
      { type: 'SET_VERDICT', path: A, verdict: 'rejected', fingerprint: null, now: T1 },
      { type: 'ADD_COMMENT', target: { kind: 'file', ref: B }, body: 'Nit.', now: T2 },
    ])
    expect(next.pendingReject).toBe(A)
    expect(next.review.files[A]).toBeUndefined()
    expect(next.review.files[B]).toBeUndefined()
  })

  it('a line comment is stored on the file but neither resolves a pending reject nor advances', () => {
    const anchor = { side: 'new' as const, line: 12 }
    const next = run(start(), [
      { type: 'SET_VERDICT', path: A, verdict: 'rejected', fingerprint: null, now: T1 },
      { type: 'ADD_COMMENT', target: { kind: 'file', ref: A, anchor }, body: 'Off by one.', now: T2 },
    ])
    expect(next.pendingReject).toBe(A)
    expect(next.review.files[A]).toBeUndefined()
    expect(next.review.ui.currentFile).toBe(A)
    expect(next.review.comments.map((c) => [c.id, c.target])).toEqual([['c1', { kind: 'file', ref: A, anchor }]])
    // The file counts as commented: advancing from it skips it like any file comment.
    expect(nextUnreviewedFile(next.review, files)).toBe(B)
    // The file-level comment still resolves the reject.
    const done = reviewReducer(next, { type: 'ADD_COMMENT', target: { kind: 'file', ref: A }, body: 'No.', now: T3 }, ctx)
    expect(done.pendingReject).toBeNull()
    expect(done.review.files[A]?.verdict).toBe('rejected')
    expect(done.review.ui.currentFile).toBe(B)
  })

  it('CANCEL_REJECT drops the pending reject; approving another file clears it too', () => {
    const pending = run(start(), [{ type: 'SET_VERDICT', path: A, verdict: 'rejected', fingerprint: null, now: T1 }])
    const cancelled = reviewReducer(pending, { type: 'CANCEL_REJECT' }, ctx)
    expect(cancelled.pendingReject).toBeNull()
    expect(cancelled.review).toBe(pending.review)
    expect(reviewReducer(cancelled, { type: 'CANCEL_REJECT' }, ctx)).toBe(cancelled)
    const approvedOther = reviewReducer(pending, { type: 'SET_VERDICT', path: B, verdict: 'approved', fingerprint: null, now: T2 }, ctx)
    expect(approvedOther.pendingReject).toBeNull()
  })

  it('verdict none clears the verdict and fingerprint but keeps viewed', () => {
    const next = run(start(), [
      { type: 'SET_VERDICT', path: A, verdict: 'approved', fingerprint: fp(A), now: T1 },
      { type: 'SET_VERDICT', path: A, verdict: 'none', fingerprint: null, now: T2 },
    ])
    expect(next.review.files[A]).toEqual({ verdict: 'none', fingerprint: null, viewed: true })
    expect(next.review.updatedAt).toBe(T2)
  })
})

describe('comments', () => {
  it('ignores an empty or whitespace-only comment', () => {
    const initial = start()
    for (const body of ['', '   ', '\n\t']) {
      expect(reviewReducer(initial, { type: 'ADD_COMMENT', target: { kind: 'overall', ref: null }, body, now: T1 }, ctx)).toBe(initial)
    }
  })

  it('trims the body and stores an evidence timestamp without moving the deck', () => {
    const next = run(start(), [
      { type: 'ADD_COMMENT', target: { kind: 'evidence', ref: 'flow.webm' }, body: '  Cut off  \n', timestampSec: 42, now: T1 },
    ])
    expect(next.review.comments[0]).toMatchObject({ id: 'c1', body: 'Cut off', timestampSec: 42, target: { kind: 'evidence', ref: 'flow.webm' } })
    expect(next.review.ui.currentFile).toBe(A)
  })

  it('never reuses an id after a delete', () => {
    const next = run(start(), [
      { type: 'ADD_COMMENT', target: { kind: 'overall', ref: null }, body: 'one', now: T1 },
      { type: 'DELETE_COMMENT', id: 'c1', now: T2 },
      { type: 'ADD_COMMENT', target: { kind: 'spec', ref: 'plan.md' }, body: 'two', now: T3 },
    ])
    expect(next.review.comments.map((c) => c.id)).toEqual(['c2'])
    expect(next.review.nextCommentId).toBe(3)
    expect(() => ReviewSchema.parse(next.review)).not.toThrow()
  })

  it('deleting a sent comment or an unknown id is a no-op', () => {
    const initial = start({ comments: [makeComment({ id: 'c1', sentAt: T0 })] })
    expect(reviewReducer(initial, { type: 'DELETE_COMMENT', id: 'c1', now: T1 }, ctx)).toBe(initial)
    expect(reviewReducer(initial, { type: 'DELETE_COMMENT', id: 'c9', now: T1 }, ctx)).toBe(initial)
  })

  it('edits set body and updatedAt; empty edits and unknown ids are ignored', () => {
    const initial = start({ comments: [makeComment({ id: 'c1' })] })
    const edited = reviewReducer(initial, { type: 'EDIT_COMMENT', id: 'c1', body: ' Better. ', now: T1 }, ctx)
    expect(edited.review.comments[0]).toMatchObject({ body: 'Better.', updatedAt: T1 })
    expect(reviewReducer(initial, { type: 'EDIT_COMMENT', id: 'c1', body: '  ', now: T1 }, ctx)).toBe(initial)
    expect(reviewReducer(initial, { type: 'EDIT_COMMENT', id: 'c9', body: 'x', now: T1 }, ctx)).toBe(initial)
  })

  it('resolve and reopen stamp the comment', () => {
    const initial = start({ comments: [makeComment({ id: 'c1' })] })
    const resolved = reviewReducer(initial, { type: 'RESOLVE_COMMENT', id: 'c1', now: T1 }, ctx)
    expect(resolved.review.comments[0]?.resolvedAt).toBe(T1)
    const reopened = reviewReducer(resolved, { type: 'REOPEN_COMMENT', id: 'c1', now: T2 }, ctx)
    expect(reopened.review.comments[0]).toMatchObject({ resolvedAt: T1, reopenedAt: T2 })
  })
})

describe('navigation', () => {
  it('wraps around once and reports atEnd when nothing is left', () => {
    const fromC = start({}, C)
    const wrapped = reviewReducer(fromC, { type: 'SET_VERDICT', path: C, verdict: 'approved', fingerprint: null, now: T1 }, ctx)
    expect(wrapped.review.ui.currentFile).toBe(A)
    expect(wrapped.atEnd).toBe(false)

    const last = run(wrapped, [
      { type: 'SET_VERDICT', path: A, verdict: 'approved', fingerprint: null, now: T2 },
      { type: 'SET_VERDICT', path: B, verdict: 'approved', fingerprint: null, now: T3 },
    ])
    expect(last.review.ui.currentFile).toBe(B)
    expect(last.atEnd).toBe(true)
    expect(reviewReducer(last, { type: 'ADVANCE', now: T3 }, ctx)).toBe(last)
  })

  it('advance skips files with an effective verdict or a file comment', () => {
    const state = start(
      {
        files: { [B]: { verdict: 'approved', fingerprint: fp(B), viewed: true } },
        comments: [makeComment({ id: 'c1', target: { kind: 'file', ref: C } })],
      },
      A,
    )
    expect(nextUnreviewedFile(state.review, files)).toBe(A)
    const advanced = reviewReducer(state, { type: 'ADVANCE', now: T1 }, ctx)
    expect(advanced).toBe(state)
  })

  it('advance comes back to a file that changed since its verdict', () => {
    const state = start(
      {
        files: {
          [A]: { verdict: 'approved', fingerprint: fp(A), viewed: true },
          [B]: { verdict: 'approved', fingerprint: fp('stale'), viewed: true },
          [C]: { verdict: 'rejected', fingerprint: fp(C), viewed: true },
        },
      },
      A,
    )
    expect(nextUnreviewedFile(state.review, files)).toBe(B)
  })

  it('advance starts from the first file when currentFile is null or unknown', () => {
    expect(nextUnreviewedFile(start({}, null).review, files)).toBe(A)
    expect(nextUnreviewedFile(start({}, 'gone.ts').review, files)).toBe(A)
    expect(nextUnreviewedFile(start({}, null).review, [])).toBeNull()
    const advanced = reviewReducer(start({}, null), { type: 'ADVANCE', now: T1 }, ctx)
    expect(advanced.review.ui.currentFile).toBe(A)
  })

  it('GO_TO sets the current file; null means the end', () => {
    const toC = reviewReducer(start(), { type: 'GO_TO', path: C, now: T1 }, ctx)
    expect(toC.review.ui.currentFile).toBe(C)
    expect(reviewReducer(toC, { type: 'GO_TO', path: C, now: T2 }, ctx)).toBe(toC)
    const end = reviewReducer(toC, { type: 'GO_TO', path: null, now: T2 }, ctx)
    expect(end.review.ui.currentFile).toBeNull()
    expect(end.atEnd).toBe(true)
    const back = reviewReducer(end, { type: 'ADVANCE', now: T3 }, ctx)
    expect(back.review.ui.currentFile).toBe(A)
    expect(back.atEnd).toBe(false)
  })

  it('MARK_VIEWED, SET_MODE and SET_DECISION are idempotent mutations', () => {
    const initial = start()
    const viewed = reviewReducer(initial, { type: 'MARK_VIEWED', path: B, now: T1 }, ctx)
    expect(viewed.review.files[B]).toEqual({ verdict: 'none', fingerprint: null, viewed: true })
    expect(reviewReducer(viewed, { type: 'MARK_VIEWED', path: B, now: T2 }, ctx)).toBe(viewed)

    const scroll = reviewReducer(viewed, { type: 'SET_MODE', mode: 'scroll', now: T2 }, ctx)
    expect(scroll.review.ui.mode).toBe('scroll')
    expect(reviewReducer(scroll, { type: 'SET_MODE', mode: 'scroll', now: T3 }, ctx)).toBe(scroll)

    const decided = reviewReducer(scroll, { type: 'SET_DECISION', decision: 'approve', now: T3 }, ctx)
    expect(decided.review.overall.decision).toBe('approve')
    expect(reviewReducer(decided, { type: 'SET_DECISION', decision: 'approve', now: T3 }, ctx)).toBe(decided)
  })
})

describe('LOAD and immutability', () => {
  it('LOAD replaces the review and keeps pendingReject and atEnd', () => {
    const pending = run(start(), [{ type: 'SET_VERDICT', path: A, verdict: 'rejected', fingerprint: null, now: T1 }])
    const reloaded = makeReview({ updatedAt: T2, files: { [B]: { verdict: 'approved', fingerprint: fp(B), viewed: true } } })
    const loaded = reviewReducer(pending, { type: 'LOAD', review: reloaded }, ctx)
    expect(loaded.review).toBe(reloaded)
    expect(loaded.pendingReject).toBe(A)
    expect(loaded.atEnd).toBe(pending.atEnd)
  })

  it('does not mutate the previous state', () => {
    const initial = start({ comments: [makeComment({ id: 'c1' })] })
    const snapshot = structuredClone(initial)
    run(initial, [
      { type: 'SET_VERDICT', path: A, verdict: 'approved', fingerprint: null, now: T1 },
      { type: 'ADD_COMMENT', target: { kind: 'file', ref: B }, body: 'x', now: T1 },
      { type: 'EDIT_COMMENT', id: 'c1', body: 'y', now: T1 },
      { type: 'DELETE_COMMENT', id: 'c1', now: T1 },
      { type: 'MARK_VIEWED', path: C, now: T1 },
    ])
    expect(initial).toEqual(snapshot)
  })
})

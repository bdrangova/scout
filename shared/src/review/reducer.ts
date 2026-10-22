import type { Comment, CommentKind, CommentTarget, Decision, FileReview, Mode, Review, Verdict } from '../schemas/review.ts'
import { effectiveVerdict, isItemComment } from './status.ts'
import type { ReviewItem } from './status.ts'

/**
 * In-memory review state for the dashboard. Only `review` is persisted; `pendingReject` (the file
 * waiting for a comment before its reject verdict is stored) and `atEnd` (the deck reached Submit)
 * are UI state that survives a `LOAD` after a 409 reload.
 */
export type ReviewState = {
  review: Review
  pendingReject: string | null
  atEnd: boolean
}

/** What the reducer needs from the live items (tree files or test scenarios), in display order. */
export type ReviewContext = {
  files: readonly ReviewItem[]
  /** The comment target kind of the items: a verdict's own comment uses it. Default `file`. */
  itemKind?: 'file' | 'scenario'
}

export type ReviewAction =
  /** `comment` rides along with the verdict (the draft typed before approving or rejecting): one file comment, and a reject is stored at once instead of waiting for one. */
  | { type: 'SET_VERDICT'; path: string; verdict: Verdict; fingerprint: string | null; comment?: string; now: string }
  /** A `file` target with an `anchor` adds a line comment: stored like a file comment, but it neither resolves a pending reject nor advances. */
  | { type: 'ADD_COMMENT'; target: CommentTarget; body: string; timestampSec?: number | null; kind?: CommentKind; now: string }
  | { type: 'EDIT_COMMENT'; id: string; body: string; now: string }
  | { type: 'DELETE_COMMENT'; id: string; now: string }
  | { type: 'REOPEN_COMMENT'; id: string; now: string }
  | { type: 'RESOLVE_COMMENT'; id: string; now: string }
  | { type: 'SET_DECISION'; decision: Decision; now: string }
  | { type: 'SET_MODE'; mode: Mode; now: string }
  | { type: 'MARK_VIEWED'; path: string; now: string }
  | { type: 'GO_TO'; path: string | null; now: string }
  | { type: 'CANCEL_REJECT' }
  | { type: 'ADVANCE'; now: string }
  | { type: 'LOAD'; review: Review }

export function initialReviewState(review: Review): ReviewState {
  return { review, pendingReject: null, atEnd: false }
}

const EMPTY_FILE_REVIEW: FileReview = { verdict: 'none', fingerprint: null, viewed: false }

function touch(review: Review, now: string, patch: Partial<Review>): Review {
  return { ...review, ...patch, updatedAt: now }
}

function withFile(review: Review, path: string, fileReview: FileReview): Partial<Review> {
  return { files: { ...review.files, [path]: fileReview } }
}

function fingerprintOf(ctx: ReviewContext, path: string): string | null {
  return ctx.files.find((file) => file.path === path)?.fingerprint ?? null
}

function patchComment(
  state: ReviewState,
  id: string,
  now: string,
  patch: (comment: Comment) => Comment,
): ReviewState {
  const index = state.review.comments.findIndex((comment) => comment.id === id)
  const existing = state.review.comments[index]
  if (!existing) return state
  const comments = state.review.comments.slice()
  comments[index] = patch(existing)
  return { ...state, review: touch(state.review, now, { comments }) }
}

function withComment(review: Review, target: CommentTarget, body: string, timestampSec: number | null, now: string, kind?: CommentKind): Partial<Review> {
  const comment: Comment = {
    id: `c${review.nextCommentId}`,
    target,
    body,
    ...(kind !== undefined && { kind }),
    timestampSec,
    createdAt: now,
    updatedAt: null,
    sentAt: null,
    resolvedAt: null,
    reopenedAt: null,
  }
  return { comments: [...review.comments, comment], nextCommentId: review.nextCommentId + 1 }
}

function commentedFiles(review: Review): Set<string> {
  const paths = new Set<string>()
  for (const comment of review.comments) {
    if (isItemComment(comment.target.kind) && comment.target.ref !== null) paths.add(comment.target.ref)
  }
  return paths
}

/**
 * The next file that still needs attention: starting after `review.ui.currentFile` in tree order
 * and wrapping around once (the current file is the last candidate), the first file whose
 * effective verdict is `none` (so a file updated since its verdict comes back) and that has no
 * file comment. `null` when every file has been reviewed.
 */
export function nextUnreviewedFile(review: Review, files: readonly ReviewItem[]): string | null {
  const count = files.length
  if (count === 0) return null
  const commented = commentedFiles(review)
  const start = review.ui.currentFile === null ? -1 : files.findIndex((file) => file.path === review.ui.currentFile)
  for (let step = 1; step <= count; step += 1) {
    const file = files[(start + step) % count]
    if (file === undefined) continue
    if (effectiveVerdict(review.files[file.path], file) === 'none' && !commented.has(file.path)) return file.path
  }
  return null
}

function advance(state: ReviewState, ctx: ReviewContext, now: string): ReviewState {
  const next = nextUnreviewedFile(state.review, ctx.files)
  if (next === null) {
    return state.atEnd ? state : { ...state, atEnd: true }
  }
  if (next === state.review.ui.currentFile && !state.atEnd) return state
  return {
    ...state,
    atEnd: false,
    review: touch(state.review, now, { ui: { ...state.review.ui, currentFile: next } }),
  }
}

export function reviewReducer(state: ReviewState, action: ReviewAction, ctx: ReviewContext): ReviewState {
  const { review } = state
  switch (action.type) {
    case 'SET_VERDICT': {
      const { path, verdict, now } = action
      const comment = action.comment?.trim() ?? ''
      if (verdict === 'rejected' && comment === '') {
        return state.pendingReject === path ? state : { ...state, pendingReject: path }
      }
      if (verdict === 'approved' || verdict === 'rejected') {
        const fingerprint = action.fingerprint ?? fingerprintOf(ctx, path)
        const stored: FileReview = { verdict, fingerprint, viewed: true }
        const patch: Partial<Review> = withFile(review, path, stored)
        if (comment !== '') Object.assign(patch, withComment(review, { kind: ctx.itemKind ?? 'file', ref: path }, comment, null, now))
        const next: ReviewState = {
          ...state,
          pendingReject: verdict === 'approved' || state.pendingReject === path ? null : state.pendingReject,
          review: touch(review, now, patch),
        }
        return advance(next, ctx, now)
      }
      const existing = review.files[path] ?? EMPTY_FILE_REVIEW
      const cleared: FileReview = { verdict: 'none', fingerprint: null, viewed: existing.viewed }
      return { ...state, pendingReject: null, review: touch(review, now, withFile(review, path, cleared)) }
    }

    case 'ADD_COMMENT': {
      const body = action.body.trim()
      if (body === '') return state
      const { target, now } = action
      const patch = withComment(review, target, body, action.timestampSec ?? null, now, action.kind)
      // A line comment never stands in for the reject's reason and never moves the deck:
      // the reviewer is still reading the file.
      if (!isItemComment(target.kind) || target.ref === null || target.anchor !== undefined) {
        return { ...state, review: touch(review, now, patch) }
      }
      let pendingReject = state.pendingReject
      if (pendingReject === target.ref) {
        const stored: FileReview = { verdict: 'rejected', fingerprint: fingerprintOf(ctx, target.ref), viewed: true }
        Object.assign(patch, withFile(review, target.ref, stored))
        pendingReject = null
      }
      return advance({ ...state, pendingReject, review: touch(review, now, patch) }, ctx, now)
    }

    case 'EDIT_COMMENT': {
      const body = action.body.trim()
      if (body === '') return state
      return patchComment(state, action.id, action.now, (comment) => ({ ...comment, body, updatedAt: action.now }))
    }

    case 'DELETE_COMMENT': {
      const existing = review.comments.find((comment) => comment.id === action.id)
      if (!existing || existing.sentAt !== null) return state
      const comments = review.comments.filter((comment) => comment.id !== action.id)
      return { ...state, review: touch(review, action.now, { comments }) }
    }

    case 'REOPEN_COMMENT':
      return patchComment(state, action.id, action.now, (comment) => ({ ...comment, reopenedAt: action.now }))

    case 'RESOLVE_COMMENT':
      return patchComment(state, action.id, action.now, (comment) => ({ ...comment, resolvedAt: action.now }))

    case 'SET_DECISION':
      if (review.overall.decision === action.decision) return state
      return { ...state, review: touch(review, action.now, { overall: { decision: action.decision } }) }

    case 'SET_MODE':
      if (review.ui.mode === action.mode) return state
      return { ...state, review: touch(review, action.now, { ui: { ...review.ui, mode: action.mode } }) }

    case 'MARK_VIEWED': {
      const existing = review.files[action.path] ?? EMPTY_FILE_REVIEW
      if (existing.viewed) return state
      return { ...state, review: touch(review, action.now, withFile(review, action.path, { ...existing, viewed: true })) }
    }

    case 'GO_TO': {
      const atEnd = action.path === null
      if (review.ui.currentFile === action.path && state.atEnd === atEnd) return state
      return {
        ...state,
        atEnd,
        review: touch(review, action.now, { ui: { ...review.ui, currentFile: action.path } }),
      }
    }

    case 'CANCEL_REJECT':
      return state.pendingReject === null ? state : { ...state, pendingReject: null }

    case 'ADVANCE':
      return advance(state, ctx, action.now)

    case 'LOAD':
      return { ...state, review: action.review }
  }
}

import type {
  CommentTarget,
  CommentWithStatus,
  FileReview,
  Resolutions,
  ReviewAction,
  ReviewState,
} from '@review-dash/shared'
import { createContext, useContext } from 'react'

type StripNow<A> = A extends { now: string } ? Omit<A, 'now'> : A

/** A `ReviewAction` without `now`: the provider stamps the time when dispatching. */
export type ReviewInput = StripNow<ReviewAction>

export type SaveStatus = 'idle' | 'saving' | 'error'

export interface ReviewContextValue {
  state: ReviewState
  dispatch: (action: ReviewInput) => void
  /** Every comment, merged with its open/resolved status and the agent's resolution. */
  comments: CommentWithStatus[]
  commentsFor: (target: CommentTarget) => CommentWithStatus[]
  fileReview: (path: string) => FileReview | null
  /** The unsent comment typed on a file (kept across cards, never saved). */
  draftFor: (path: string) => string
  setDraft: (path: string, text: string) => void
  /**
   * Approve or reject a file. A draft typed on it is sent along as its comment, so nothing typed is
   * lost, and a reject with a draft is final. Returns true when a comment went with the verdict.
   */
  setVerdict: (path: string, verdict: 'approved' | 'rejected', fingerprint: string | null) => boolean
  /** Over the live tree: files with an effective verdict or an open comment. */
  progress: { reviewed: number; total: number }
  resolutions: Resolutions | null
  saveStatus: SaveStatus
  /** Refetch the review from the server (after a send, or when `resolutions.json` changed). */
  reload: () => void
}

export const ReviewStateContext = createContext<ReviewContextValue | null>(null)

export function useReview(): ReviewContextValue {
  const value = useContext(ReviewStateContext)
  if (!value) throw new Error('useReview must be used inside ReviewProvider')
  return value
}

/** Same kind and same ref (`null` for overall). */
export function sameTarget(a: CommentTarget, b: CommentTarget): boolean {
  return a.kind === b.kind && a.ref === b.ref
}

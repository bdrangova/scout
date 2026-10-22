import type {
  CommentTarget,
  CommentWithStatus,
  FileReview,
  Resolutions,
  ReviewAction,
  ReviewItem,
  ReviewState,
} from '@review-dash/shared'
import { createContext, useContext } from 'react'
import type { UnsavedDraft } from '@/lib/comment-drafts'

type StripNow<A> = A extends { now: string } ? Omit<A, 'now'> : A

/** A `ReviewAction` without `now`: the provider stamps the time when dispatching. */
export type ReviewInput = StripNow<ReviewAction>

export type SaveStatus = 'idle' | 'saving' | 'error'

/** What a review's items are: the changed files of a code review, the scenarios of a test run. */
export type ItemKind = 'file' | 'scenario'

export interface ReviewContextValue {
  state: ReviewState
  /** The reviewable items, live: the tree's files (`path`) or the scenarios (`path` = scenario id), with their fingerprints. */
  items: readonly ReviewItem[]
  itemKind: ItemKind
  dispatch: (action: ReviewInput) => void
  /** Every comment, merged with its open/resolved status and the agent's resolution. */
  comments: CommentWithStatus[]
  commentsFor: (target: CommentTarget) => CommentWithStatus[]
  fileReview: (path: string) => FileReview | null
  /** The unsent comment typed on an item (kept across cards, never saved); `key` is a `draftKey` (a file's plain path). */
  draftFor: (key: string) => string
  setDraft: (key: string, text: string) => void
  /**
   * Composers with text typed and not added (file cards, spec, extras and evidence cards; not line
   * comment boxes, which close when the page is left). A send does not carry them.
   */
  unsavedDrafts: UnsavedDraft[]
  /**
   * Approve or reject an item (a file, or a scenario by its id). A draft typed on it (key `draftKey({ kind: itemKind, ref: path })`) is sent along as its comment, so nothing typed is
   * lost, and a reject with a draft is final. Returns true when a comment went with the verdict.
   */
  setVerdict: (path: string, verdict: 'approved' | 'rejected', fingerprint: string | null) => boolean
  /** Over the live items: those with an effective verdict or an open comment. */
  progress: { reviewed: number; total: number }
  resolutions: Resolutions | null
  saveStatus: SaveStatus
  /**
   * Commits the focused field, then saves the review and waits for the server to hold it. Resolves
   * false when the save failed or hit a conflict (the review was reloaded): do not act on stale data.
   */
  flushSave: () => Promise<boolean>
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

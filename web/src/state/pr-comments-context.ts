import type { PrCommentCounts, PrCommentsResponse, PrCommentView, PrIdentity, PrReplyKind, PutPrReplyResponse } from '@scout/shared'
import { createContext, useContext } from 'react'
import { queuedReplyCounts, type QueuedReplyCounts } from '@/lib/pr-replies'
import { groupPrThreads, prCountsByPath, threadsForPath, type PrFileCounts, type PrThread } from '@/lib/pr-threads'

/** The session's GitHub PR comments, read-only: what the Files page and Submit show. */
export interface PrCommentsValue {
  loading: boolean
  error: Error | null
  /** The PR this session is linked to; null when none is known (then everything below is empty). */
  pr: PrIdentity | null
  /** Roots only; null when the session was never synced. Never part of the review's counts. */
  counts: PrCommentCounts | null
  /** Every view in display order (line comments, then review summaries, then general ones), replies after their root. */
  comments: readonly PrCommentView[]
  threads: readonly PrThread[]
  /** The line threads of one file. */
  threadsFor: (path: string) => PrThread[]
  /** Thread counts per file path (files with none are absent). */
  fileCounts: ReadonlyMap<string, PrFileCounts>
  reload: () => void
  /** Drafts waiting for the next Submit (unposted instructions on open threads, replies on answered ones). */
  queued: QueuedReplyCounts
  /** Saves the instruction or reply text of a thread root (`PUT /pr-replies/:id`); a blank text deletes the draft. */
  saveReply: (commentId: string, body: string, kind?: PrReplyKind) => Promise<PutPrReplyResponse>
  /** A box registers its "save what is pending now" function; the returned function unregisters it. */
  registerReplyFlush: (flush: () => Promise<boolean>) => () => void
  /** Saves every pending box; false when one failed. Submit awaits it next to the review's own flush. */
  flushReplies: () => Promise<boolean>
}

export const NO_PR_COMMENTS: PrCommentsValue = {
  loading: false,
  error: null,
  pr: null,
  counts: null,
  comments: [],
  threads: [],
  threadsFor: () => [],
  fileCounts: new Map(),
  reload: () => {},
  queued: { instructions: 0, replies: 0 },
  saveReply: () => Promise.reject(new Error('No PR comments provider is mounted')),
  registerReplyFlush: () => () => {},
  flushReplies: () => Promise.resolve(true),
}

/** The context value for a loaded (or absent) response. */
export function prCommentsValueFrom(
  data: PrCommentsResponse | null,
  status: Pick<PrCommentsValue, 'loading' | 'error' | 'reload' | 'saveReply' | 'registerReplyFlush' | 'flushReplies'>,
): PrCommentsValue {
  const comments = data?.comments ?? []
  const threads = groupPrThreads(comments)
  return {
    ...status,
    pr: data?.pr ?? null,
    counts: data?.counts ?? null,
    comments,
    threads,
    threadsFor: (path) => threadsForPath(threads, path),
    fileCounts: prCountsByPath(threads),
    queued: queuedReplyCounts(threads),
  }
}

export const PrCommentsContext = createContext<PrCommentsValue>(NO_PR_COMMENTS)

/** The session's PR comments; empty (never throws) where no provider is mounted. */
export function usePrComments(): PrCommentsValue {
  return useContext(PrCommentsContext)
}

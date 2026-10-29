import type { PrCommentsResponse, PrCommentView, PrReplyKind, PutPrReplyResponse } from '@scout/shared'
import type { PrThread } from '@/lib/pr-threads'
import { ApiRequestError, apiPut } from './api'
import { prReplyPath, prResolvedPath } from './paths'

/** Saves the text for a thread root; a blank text deletes the draft (the server keeps an already posted one). */
export function putPrReply(sessionId: string, commentId: string, body: string, kind?: PrReplyKind): Promise<PutPrReplyResponse> {
  return apiPut<PutPrReplyResponse>(prReplyPath(sessionId, commentId), kind === undefined ? { body } : { body, kind })
}

/** Marks a thread root handled in Scout (`resolved`) or reopens it; nothing reaches GitHub. */
export function putPrResolved(sessionId: string, commentId: string, resolved: boolean): Promise<PrCommentsResponse> {
  return apiPut<PrCommentsResponse>(prResolvedPath(sessionId, commentId), { resolved })
}

/** True when the server refused a save because the draft's kind no longer fits its thread (409 `pr-reply-kind-mismatch`). */
export function isKindMismatch(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 409 &&
    typeof error.body === 'object' &&
    error.body !== null &&
    'reason' in error.body &&
    error.body.reason === 'pr-reply-kind-mismatch'
  )
}

/** An unposted draft whose kind no longer fits its thread's status (an instruction on an answered thread, a reply on an open one): never sent. */
export function isStaleDraft(root: Pick<PrCommentView, 'status' | 'draftReply'>): boolean {
  return root.draftReply != null && root.draftReply.postedAt === null && root.draftReply.kind !== replyKindFor(root)
}

/** What kind of text a thread's box takes: an instruction while it is open, a reply once answered; none for an outdated thread. */
export function replyKindFor(root: Pick<PrCommentView, 'status'>): PrReplyKind | null {
  if (root.status === 'open') return 'instruction'
  if (root.status === 'addressed' || root.status === 'declined') return 'reply'
  return null
}

/** True when the box shows for this root: an open thread always, an answered one when it has a proposal or a draft. */
export function hasReplyBox(root: PrCommentView): boolean {
  if (root.isReply || root.status === 'outdated') return false
  if (root.status === 'open') return true
  return root.draftReply != null || Boolean(root.proposedReply)
}

/** The draft is waiting to go out: saved, not posted yet. */
export function isQueuedDraft(root: Pick<PrCommentView, 'draftReply'>): boolean {
  return root.draftReply != null && root.draftReply.postedAt === null
}

/** An answered thread whose reply still needs the reviewer: a proposal not yet accepted, or an unposted draft. It stays visible in Open comments. */
export function needsReplyReview(thread: PrThread): boolean {
  const { root } = thread
  if (root.status !== 'addressed' && root.status !== 'declined') return false
  if (root.draftReply?.postedAt) return false
  return isQueuedDraft(root) || Boolean(root.proposedReply)
}

export interface QueuedReplyCounts {
  instructions: number
  replies: number
}

/** The drafts a Submit would carry, by the rule the server snapshot uses: an instruction while its thread is open, a reply once it is answered. */
export function queuedReplyCounts(threads: readonly PrThread[]): QueuedReplyCounts {
  const counts: QueuedReplyCounts = { instructions: 0, replies: 0 }
  for (const { root } of threads) {
    if (!isQueuedDraft(root) || root.draftReply == null) continue
    const wanted = replyKindFor(root)
    if (root.draftReply.kind !== wanted) continue
    if (wanted === 'instruction') counts.instructions += 1
    else counts.replies += 1
  }
  return counts
}

import type { AgentRunStatus } from '../schemas/agent.ts'
import type { Resolution, Resolutions } from '../schemas/resolutions.ts'
import type { Comment, CommentTargetKind, FileReview, Review, Verdict } from '../schemas/review.ts'

export const COMMENT_STATUSES = ['open', 'resolved'] as const
export type CommentStatus = (typeof COMMENT_STATUSES)[number]

export type CommentWithStatus = Comment & { status: CommentStatus; resolution: Resolution | null }

export const SESSION_STATUSES = [
  'unreviewed',
  'in-progress',
  'ready',
  'sent',
  'agent-working',
  'run-failed',
  'updated',
  'approved',
] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

/** What the review logic needs of a reviewable item: a changed file (`TreeFile`) or a test scenario (`path` = its id). */
export type ReviewItem = { path: string; fingerprint: string }

/** The items as an array or as anything carrying them in `files` (a `WorkingTree`). */
export type ReviewItems = readonly ReviewItem[] | { readonly files: readonly ReviewItem[] }

function itemsOf(source: ReviewItems): readonly ReviewItem[] {
  return 'files' in source ? source.files : source
}

/** A comment on a reviewable item (a file or a test scenario): the reviewer responded to it, so it counts as reviewed. */
export function isItemComment(kind: CommentTargetKind): boolean {
  return kind === 'file' || kind === 'scenario'
}

function timeOf(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
}

/**
 * The latest event wins: the agent's resolution (status as given), the reviewer marking the
 * comment resolved (`resolvedAt`) or the reviewer reopening it (`reopenedAt`). No event → open.
 * On equal timestamps a reopen wins, so the comment is never hidden by accident.
 */
export function commentStatus(comment: Comment, resolution: Resolution | null): CommentStatus {
  const events: { at: number; status: CommentStatus }[] = []
  if (resolution) events.push({ at: timeOf(resolution.at), status: resolution.status })
  if (comment.resolvedAt !== null) events.push({ at: timeOf(comment.resolvedAt), status: 'resolved' })
  if (comment.reopenedAt !== null) events.push({ at: timeOf(comment.reopenedAt), status: 'open' })

  let latest: { at: number; status: CommentStatus } | null = null
  for (const event of events) {
    if (latest === null || event.at >= latest.at) latest = event
  }
  return latest?.status ?? 'open'
}

export function mergeComments(review: Review, resolutions: Resolutions | null): CommentWithStatus[] {
  return review.comments.map((comment) => {
    const resolution = resolutions?.comments[comment.id] ?? null
    return { ...comment, status: commentStatus(comment, resolution), resolution }
  })
}

/** The reviewer judged a version of the file whose content has changed since. */
export function fileIsUpdated(entry: FileReview | null | undefined, file: ReviewItem): boolean {
  if (!entry || entry.verdict === 'none' || entry.fingerprint === null) return false
  return entry.fingerprint !== file.fingerprint
}

/** The stored verdict, unless the file changed since it was given (then `none`). */
export function effectiveVerdict(entry: FileReview | null | undefined, file: ReviewItem): Verdict {
  if (!entry) return 'none'
  return fileIsUpdated(entry, file) ? 'none' : entry.verdict
}

/** Paths of files with an open file comment: the reviewer responded to them, so they count as reviewed. */
export function commentedPaths(review: Review, resolutions: Resolutions | null = null): Set<string> {
  const paths = new Set<string>()
  for (const comment of mergeComments(review, resolutions)) {
    if (comment.status === 'open' && isItemComment(comment.target.kind) && comment.target.ref !== null) paths.add(comment.target.ref)
  }
  return paths
}

/**
 * Reviewed = files of the tree with an effective verdict, or an open comment (a comment is a
 * review too; once the agent resolves it the file needs another look unless it has a verdict).
 */
export function progress(
  review: Review | null,
  tree: ReviewItems,
  resolutions: Resolutions | null = null,
): { reviewed: number; total: number } {
  const items = itemsOf(tree)
  const total = items.length
  if (!review) return { reviewed: 0, total }
  const commented = commentedPaths(review, resolutions)
  let reviewed = 0
  for (const file of items) {
    if (effectiveVerdict(review.files[file.path], file) !== 'none' || commented.has(file.path)) reviewed += 1
  }
  return { reviewed, total }
}

/** True when any judged file of the tree has changed since its verdict. */
export function anyFileUpdated(review: Review, tree: ReviewItems): boolean {
  return itemsOf(tree).some((file) => fileIsUpdated(review.files[file.path], file))
}

/** True when every file of the tree has the effective verdict `approved` (vacuously true for an empty tree). */
export function allFilesApproved(review: Review, tree: ReviewItems): boolean {
  return itemsOf(tree).every((file) => effectiveVerdict(review.files[file.path], file) === 'approved')
}

/**
 * Verdicts count only while they are effective: a verdict pinned to an older fingerprint is `none`
 * (see `effectiveVerdict`), consistently with `progress`.
 *
 * - agent-working: a run is active
 * - run-failed: the latest run failed (a retry or a newer run replaces it)
 * - updated: a judged file changed on disk since its verdict (sent or not), or the agent wrote resolutions after the send
 * - approved: the last send approved and every file's effective verdict is approved
 * - sent: sent, nothing new since
 * - ready: every file is reviewed (nothing sent yet), so the next step is Submit
 * - in-progress: any effective verdict or any comment
 * - unreviewed: otherwise
 */
export function sessionStatus(input: {
  review: Review | null
  tree: ReviewItems
  resolutions: Resolutions | null
  activeRun: boolean
  /** Status of the newest run, when the caller knows it. */
  latestRunStatus?: AgentRunStatus | null
}): SessionStatus {
  const { review, tree, resolutions, activeRun, latestRunStatus = null } = input
  if (activeRun) return 'agent-working'
  if (latestRunStatus === 'failed') return 'run-failed'
  const sent = review?.sent ?? null
  if (review && anyFileUpdated(review, tree)) return 'updated'
  if (review && sent) {
    if (resolutions && timeOf(resolutions.updatedAt) > timeOf(sent.at)) return 'updated'
    if (sent.decision === 'approve' && allFilesApproved(review, tree)) return 'approved'
    return 'sent'
  }
  if (review) {
    const hasVerdict = itemsOf(tree).some((file) => effectiveVerdict(review.files[file.path], file) !== 'none')
    const { reviewed, total } = progress(review, tree, resolutions)
    if (total > 0 && reviewed === total) return 'ready'
    if (hasVerdict || review.comments.length > 0) return 'in-progress'
  }
  return 'unreviewed'
}

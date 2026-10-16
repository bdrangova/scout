import type { Resolution, Resolutions } from '../schemas/resolutions.ts'
import type { Comment, FileReview, Review, Verdict } from '../schemas/review.ts'
import type { TreeFile, WorkingTree } from '../schemas/tree.ts'

export const COMMENT_STATUSES = ['open', 'resolved'] as const
export type CommentStatus = (typeof COMMENT_STATUSES)[number]

export type CommentWithStatus = Comment & { status: CommentStatus; resolution: Resolution | null }

export const SESSION_STATUSES = [
  'unreviewed',
  'in-progress',
  'sent',
  'agent-working',
  'updated',
  'approved',
] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

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
export function fileIsUpdated(entry: FileReview | null | undefined, file: TreeFile): boolean {
  if (!entry || entry.verdict === 'none' || entry.fingerprint === null) return false
  return entry.fingerprint !== file.fingerprint
}

/** The stored verdict, unless the file changed since it was given (then `none`). */
export function effectiveVerdict(entry: FileReview | null | undefined, file: TreeFile): Verdict {
  if (!entry) return 'none'
  return fileIsUpdated(entry, file) ? 'none' : entry.verdict
}

/** Paths of files with an open file comment: the reviewer responded to them, so they count as reviewed. */
export function commentedPaths(review: Review, resolutions: Resolutions | null = null): Set<string> {
  const paths = new Set<string>()
  for (const comment of mergeComments(review, resolutions)) {
    if (comment.status === 'open' && comment.target.kind === 'file' && comment.target.ref !== null) paths.add(comment.target.ref)
  }
  return paths
}

/**
 * Reviewed = files of the tree with an effective verdict, or an open comment (a comment is a
 * review too; once the agent resolves it the file needs another look unless it has a verdict).
 */
export function progress(
  review: Review | null,
  tree: WorkingTree,
  resolutions: Resolutions | null = null,
): { reviewed: number; total: number } {
  const total = tree.files.length
  if (!review) return { reviewed: 0, total }
  const commented = commentedPaths(review, resolutions)
  let reviewed = 0
  for (const file of tree.files) {
    if (effectiveVerdict(review.files[file.path], file) !== 'none' || commented.has(file.path)) reviewed += 1
  }
  return { reviewed, total }
}

/** True when any judged file of the tree has changed since its verdict. */
export function anyFileUpdated(review: Review, tree: WorkingTree): boolean {
  return tree.files.some((file) => fileIsUpdated(review.files[file.path], file))
}

/** True when every file of the tree has the effective verdict `approved` (vacuously true for an empty tree). */
export function allFilesApproved(review: Review, tree: WorkingTree): boolean {
  return tree.files.every((file) => effectiveVerdict(review.files[file.path], file) === 'approved')
}

/**
 * Verdicts count only while they are effective: a verdict pinned to an older fingerprint is `none`
 * (see `effectiveVerdict`), consistently with `progress`.
 *
 * - agent-working: a run is active
 * - updated: a judged file changed on disk since its verdict (sent or not), or the agent wrote resolutions after the send
 * - approved: the last send approved and every file's effective verdict is approved
 * - sent: sent, nothing new since
 * - in-progress: any effective verdict or any comment
 * - unreviewed: otherwise
 */
export function sessionStatus(input: {
  review: Review | null
  tree: WorkingTree
  resolutions: Resolutions | null
  activeRun: boolean
}): SessionStatus {
  const { review, tree, resolutions, activeRun } = input
  if (activeRun) return 'agent-working'
  const sent = review?.sent ?? null
  if (review && anyFileUpdated(review, tree)) return 'updated'
  if (review && sent) {
    if (resolutions && timeOf(resolutions.updatedAt) > timeOf(sent.at)) return 'updated'
    if (sent.decision === 'approve' && allFilesApproved(review, tree)) return 'approved'
    return 'sent'
  }
  if (review) {
    const hasVerdict = tree.files.some((file) => effectiveVerdict(review.files[file.path], file) !== 'none')
    if (hasVerdict || review.comments.length > 0) return 'in-progress'
  }
  return 'unreviewed'
}

import type { Resolutions } from '../schemas/resolutions.ts'
import type { Comment, Decision, Review } from '../schemas/review.ts'
import type { SentPrReply } from '../schemas/pr-comments.ts'
import type { SentSnapshot } from '../schemas/sent.ts'
import type { WorkingTree } from '../schemas/tree.ts'
import { SCHEMA_VERSION } from '../constants.ts'
import { effectiveVerdict, mergeComments } from './status.ts'
import type { CommentWithStatus } from './status.ts'

/** `review/sent/<stem>.json|.md|.patch`: the ISO timestamp with `:` replaced by `-`. */
export function sentFileStem(sentAt: string): string {
  return sentAt.replaceAll(':', '-')
}

export function sentPatchPath(sentAt: string): string {
  return `review/sent/${sentFileStem(sentAt)}.patch`
}

function plainComment(comment: CommentWithStatus): Comment {
  const { status: _status, resolution: _resolution, ...rest } = comment
  return rest
}

/**
 * The immutable record of one Submit: the open comments (stamped with `sentAt = now`), the
 * effective file verdicts against the live tree, the tree's shas and the decision. Pure; the
 * server writes it to `review/sent/<stem>.json`, renders it with `renderSentMarkdown` and writes
 * the full patch to `patchPath`.
 */
export function buildSentSnapshot(input: {
  review: Review
  tree: WorkingTree
  decision: Decision
  resolutions: Resolutions | null
  /** The user's unposted PR-comment drafts (`buildSentPrReplies`). */
  prReplies?: readonly SentPrReply[]
  now: string
}): SentSnapshot {
  const { review, tree, decision, resolutions, now } = input
  const open = mergeComments(review, resolutions).filter((comment) => comment.status === 'open')
  const comments = open.map((comment) => ({ ...plainComment(comment), sentAt: now }))

  const commented = new Set<string>()
  for (const comment of comments) {
    if (comment.target.kind === 'file' && comment.target.ref !== null) commented.add(comment.target.ref)
  }

  const files: SentSnapshot['files'] = []
  const counts = { files: 0, approved: 0, rejected: 0, commented: 0, unreviewed: 0, openComments: comments.length }
  for (const file of tree.files) {
    counts.files += 1
    const verdict = effectiveVerdict(review.files[file.path], file)
    if (verdict === 'approved') counts.approved += 1
    else if (verdict === 'rejected') counts.rejected += 1
    else if (commented.has(file.path)) counts.commented += 1
    else counts.unreviewed += 1
    if (verdict !== 'none') {
      files.push({
        path: file.path,
        verdict,
        fingerprint: file.fingerprint,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
      })
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    sessionId: review.sessionId,
    sentAt: now,
    decision,
    tree: { baseSha: tree.baseSha, headSha: tree.headSha, branch: tree.branch },
    patchPath: sentPatchPath(now),
    files,
    comments,
    ...(input.prReplies !== undefined && input.prReplies.length > 0 ? { prReplies: [...input.prReplies] } : {}),
    counts,
  }
}

/** Marks a snapshot as sent on the live review: `sent`, `sentAt` on each included comment, the decision. */
export function stampSent(review: Review, sent: SentSnapshot, now: string): Review {
  const included = new Set(sent.comments.map((comment) => comment.id))
  return {
    ...review,
    comments: review.comments.map((comment) =>
      included.has(comment.id) ? { ...comment, sentAt: sent.sentAt } : comment,
    ),
    overall: { decision: sent.decision },
    sent: { at: sent.sentAt, decision: sent.decision },
    updatedAt: now,
  }
}

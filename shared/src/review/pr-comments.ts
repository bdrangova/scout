import { isTrustedPrComment, prTrustFor } from './pr-trust.ts'
import type { LineAnchor } from '../schemas/review.ts'
import type {
  PrComment,
  PrCommentCounts,
  PrComments,
  PrReplies,
  SentPrReply,
  PrSummary,
  PrCommentsResponse,
  PrCommentStatus,
  PrCommentView,
  PrClosedBy,
  PrResolution,
  PrResolutions,
  PrReplyKind,
} from '../schemas/pr-comments.ts'

function timeOf(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
}

/**
 * Why the comment needs no action, or null while it is live. Removed wins over outdated wins over resolved on GitHub;
 * a thread the user marked handled in Scout (`resolvedInScout`) comes last.
 */
export function prCommentClosedBy(comment: PrComment, resolvedInScout = false): PrClosedBy | null {
  if (comment.removedAt !== null) return 'removed'
  if (comment.outdated) return 'github-outdated'
  if (comment.resolvedOnGitHub) return 'github-resolved'
  return resolvedInScout ? 'scout-resolved' : null
}

/**
 * The agent's resolution wins (addressed or declined); otherwise a comment GitHub already closed
 * (outdated, resolved there, or deleted) is `outdated`, i.e. handled without action; otherwise `open`.
 */
export function prCommentStatus(comment: PrComment, resolution: PrResolution | null, resolvedInScout = false): PrCommentStatus {
  if (resolution !== null) return resolution.status
  return prCommentClosedBy(comment, resolvedInScout) === null ? 'open' : 'outdated'
}

/**
 * Whether a resolution answers the last Submit. Recorded resolutions carry `sentAt` (the `review.sent.at`
 * current when `pr-resolve` ran); one without it counts when it was written at or after the send.
 */
export function isAddressedInLastSend(resolution: PrResolution | null, lastSendAt: string | null): boolean {
  if (resolution === null || lastSendAt === null) return false
  if (resolution.sentAt !== null) return resolution.sentAt === lastSendAt
  return timeOf(resolution.at) >= timeOf(lastSendAt)
}

/** Where a line comment is drawn in the current diff; null when it has no current line (outdated, removed, file-level, not a line comment). */
export function prCommentAnchor(comment: PrComment): LineAnchor | null {
  if (comment.kind !== 'line' || comment.line === null || comment.side === null) return null
  if (comment.outdated || comment.removedAt !== null) return null
  const start = comment.startLine
  if (start !== null && start < comment.line) return { side: comment.side, line: start, endLine: comment.line }
  return { side: comment.side, line: comment.line }
}

function sortKey(view: PrCommentView): [number, string, number, number] {
  // anchored line comments first (by path, line), then file-level/outdated line comments, then review summaries, then general.
  const group = view.kind === 'line' ? (view.anchor === null ? 1 : 0) : view.kind === 'review-summary' ? 2 : 3
  return [group, view.path ?? '', view.anchor?.line ?? view.originalLine ?? 0, timeOf(view.createdAt)]
}

function compareViews(a: PrCommentView, b: PrCommentView): number {
  const [ag, ap, al, at] = sortKey(a)
  const [bg, bp, bl, bt] = sortKey(b)
  if (ag !== bg) return ag - bg
  if (ap !== bp) return ap < bp ? -1 : 1
  if (al !== bl) return al - bl
  return at - bt || a.githubId - b.githubId
}

/**
 * Merges `pr-comments.json` with `pr-resolutions.json` into views, in display order (roots by path and line, each followed by its replies). A reply takes its
 * thread root's status, resolution and closedBy (a reply never needs its own answer); an orphan reply whose
 * root vanished is treated as a root. `lastSendAt` is `review.sent.at`.
 */
export function derivePrComments(
  prComments: PrComments | null,
  resolutions: PrResolutions | null,
  lastSendAt: string | null,
  drafts: PrReplies | null = null,
): PrCommentView[] {
  if (prComments === null) return []
  const byId = new Map(prComments.comments.map((comment) => [comment.id, comment]))
  const trust = prTrustFor(prComments, resolutions)
  const views = prComments.comments.map((comment): PrCommentView => {
    const root = comment.inReplyTo === null ? undefined : byId.get(comment.inReplyTo)
    const owner = root ?? comment
    const resolution = resolutions?.comments[owner.id] ?? null
    const draft = root === undefined ? (drafts?.replies[comment.id] ?? null) : null
    const resolvedInScout = drafts?.resolved?.[owner.id] !== undefined
    return {
      ...comment,
      status: prCommentStatus(owner, resolution, resolvedInScout),
      trusted: isTrustedPrComment(comment, trust),
      resolution,
      closedBy: prCommentClosedBy(owner, resolvedInScout),
      isReply: root !== undefined,
      inLastSend: isAddressedInLastSend(resolution, lastSendAt),
      anchor: prCommentAnchor(comment),
      proposedReply: root === undefined ? (resolution?.proposedReply ?? null) : null,
      draftReply: draft === null ? null : { body: draft.body, kind: draft.kind, editedAt: draft.editedAt, postedAt: draft.postedAt },
    }
  })
  const roots = views.filter((view) => !view.isReply).sort(compareViews)
  const replies = views.filter((view) => view.isReply)
  // Replies follow their root, oldest first.
  return roots.flatMap((root) => [root, ...replies.filter((reply) => reply.inReplyTo === root.id).sort(compareViews)])
}

/** Counts roots only (replies share their root's status). `null` when never synced. */
export function prCommentCounts(prComments: PrComments | null, views: readonly PrCommentView[]): PrCommentCounts | null {
  if (prComments === null) return null
  const counts: PrCommentCounts = {
    prNumber: prComments.pr.number,
    fetchedAt: prComments.fetchedAt,
    total: 0,
    open: 0,
    addressed: 0,
    declined: 0,
    outdated: 0,
    addressedInLastSend: 0,
    declinedInLastSend: 0,
  }
  for (const view of views) {
    if (view.isReply) continue
    counts.total += 1
    counts[view.status] += 1
    if (view.inLastSend && view.status === 'addressed') counts.addressedInLastSend += 1
    if (view.inLastSend && view.status === 'declined') counts.declinedInLastSend += 1
  }
  return counts
}

/** The whole `GET /sessions/:id/pr-comments` payload; the server and the web share this so they cannot disagree. */
export function buildPrCommentsResponse(
  prComments: PrComments | null,
  resolutions: PrResolutions | null,
  lastSendAt: string | null,
  drafts: PrReplies | null = null,
): PrCommentsResponse {
  const comments = derivePrComments(prComments, resolutions, lastSendAt, drafts)
  return {
    pr: prComments?.pr ?? null,
    fetchedAt: prComments?.fetchedAt ?? null,
    lastSendAt,
    comments,
    resolutions,
    counts: prCommentCounts(prComments, comments),
  }
}

/** The session's current PR for the shell (`SessionSummary.pr`); null when no PR is known. */
export function prSummary(prComments: PrComments | null): PrSummary | null {
  if (prComments === null) return null
  const { pr } = prComments
  return {
    number: pr.number,
    url: pr.url,
    title: pr.title,
    state: pr.state === 'open' && pr.draft ? 'draft' : pr.state,
    baseRef: pr.baseRef,
    headRef: pr.headRef,
    updatedAt: prComments.fetchedAt,
  }
}

/** The kind a draft on this thread has: an instruction while it is open, a reply to post once Claude answered it; null when no draft makes sense (outdated, removed, a reply inside a thread). */
export function prReplyKindFor(view: PrCommentView): PrReplyKind | null {
  if (view.isReply) return null
  if (view.status === 'open') return 'instruction'
  return view.status === 'addressed' || view.status === 'declined' ? 'reply' : null
}

/**
 * The drafts a Submit sends: every unposted draft on a thread root whose status still matches its kind (an instruction
 * only while the comment is open, a reply only once it is addressed or declined). Posted drafts are never included again.
 */
export function buildSentPrReplies(views: readonly PrCommentView[]): SentPrReply[] {
  const out: SentPrReply[] = []
  for (const view of views) {
    const draft = view.draftReply
    if (draft === null || draft === undefined || draft.postedAt !== null || draft.body.trim() === '') continue
    if (prReplyKindFor(view) !== draft.kind) continue
    out.push({ commentId: view.id, kind: draft.kind, body: draft.body, url: view.url })
  }
  return out
}

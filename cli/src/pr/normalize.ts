// GitHub REST payloads → the shared `PrComment` shape, and the merge with what is already on disk.
import { z } from 'zod'
import { PrCommentSchema, isCopilotAccount, type PrAuthor, type PrComment, type PrReviewState } from '@review-dash/shared'

const nullableString = z.string().nullish().transform((value) => value ?? null)
const nullableInt = z.number().int().positive().nullish().transform((value) => value ?? null)

const GhUserSchema = z
  .object({ login: z.string(), type: nullableString })
  .nullish()
  .transform((user): { login: string; type: string | null } => user ?? { login: 'ghost', type: null })

export const GhReviewCommentSchema = z.object({
  id: z.number().int().positive(),
  node_id: nullableString,
  html_url: z.string(),
  body: z.string().nullish().transform((v) => v ?? ''),
  path: nullableString,
  line: nullableInt,
  start_line: nullableInt,
  side: nullableString,
  original_line: nullableInt,
  commit_id: nullableString,
  diff_hunk: nullableString,
  in_reply_to_id: nullableInt,
  user: GhUserSchema,
  author_association: nullableString,
  created_at: z.string(),
  updated_at: z.string(),
})
type GhReviewComment = z.infer<typeof GhReviewCommentSchema>

export const GhIssueCommentSchema = z.object({
  id: z.number().int().positive(),
  node_id: nullableString,
  html_url: z.string(),
  body: z.string().nullish().transform((v) => v ?? ''),
  user: GhUserSchema,
  author_association: nullableString,
  created_at: z.string(),
  updated_at: z.string(),
})
type GhIssueComment = z.infer<typeof GhIssueCommentSchema>

export const GhReviewSchema = z.object({
  id: z.number().int().positive(),
  node_id: nullableString,
  html_url: z.string(),
  body: z.string().nullish().transform((v) => v ?? ''),
  state: z.string(),
  user: GhUserSchema,
  author_association: nullableString,
  submitted_at: nullableString,
  commit_id: nullableString,
})
type GhReview = z.infer<typeof GhReviewSchema>

/** `Copilot` and `copilot-pull-request-reviewer[bot]` are Copilot; `type: Bot` or a `[bot]` login is a bot; the rest are people. */
export function classifyAuthor(user: { login: string; type: string | null }): PrAuthor {
  const isBot = user.type === 'Bot' || /\[bot\]$/i.test(user.login)
  // Copilot is one of a fixed set of exact bot logins (shared with the trust check); lookalikes are plain bots.
  const copilot = isCopilotAccount(user.login, user.type === 'Bot')
  return { login: user.login, isBot: isBot || copilot, kind: copilot ? 'copilot' : isBot ? 'bot' : 'human' }
}

export interface ThreadFlags {
  outdated: boolean
  resolved: boolean
}

export function lineComments(prNumber: number, raw: readonly GhReviewComment[], flags: ReadonlyMap<number, ThreadFlags>): PrComment[] {
  const byId = new Map(raw.map((comment) => [comment.id, comment]))
  const rootOf = (comment: GhReviewComment): number => {
    let current = comment
    for (let hops = 0; current.in_reply_to_id !== null && hops < 100; hops += 1) {
      const parent = byId.get(current.in_reply_to_id)
      if (parent === undefined) return current.in_reply_to_id
      current = parent
    }
    return current.id
  }
  return raw.map((comment) => {
    const root = rootOf(comment)
    const thread = flags.get(comment.id) ?? flags.get(root)
    const restOutdated = comment.line === null && comment.original_line !== null
    return PrCommentSchema.parse({
      id: `rc${comment.id}`,
      githubId: comment.id,
      nodeId: comment.node_id,
      url: comment.html_url,
      prNumber,
      kind: 'line',
      author: classifyAuthor(comment.user),
      authorAssociation: comment.author_association,
      body: comment.body,
      reviewState: null,
      path: comment.path,
      line: comment.line,
      startLine: comment.start_line,
      side: comment.side === 'LEFT' ? 'old' : comment.side === 'RIGHT' || comment.original_line !== null ? 'new' : null,
      originalLine: comment.original_line,
      commitSha: comment.commit_id,
      diffHunk: comment.diff_hunk,
      outdated: restOutdated || (thread?.outdated ?? false),
      resolvedOnGitHub: thread?.resolved ?? false,
      threadId: `rc${root}`,
      inReplyTo: comment.in_reply_to_id === null ? null : `rc${comment.in_reply_to_id}`,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      removedAt: null,
    })
  })
}

const REVIEW_STATES: Record<string, PrReviewState> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes-requested',
  COMMENTED: 'commented',
  DISMISSED: 'dismissed',
}

/** Reviews with a body (the summary); pending reviews and bodiless ones (only a container for line comments) are skipped. */
export function reviewSummaries(prNumber: number, raw: readonly GhReview[], fallbackTime: string): PrComment[] {
  const out: PrComment[] = []
  for (const review of raw) {
    const state = REVIEW_STATES[review.state.toUpperCase()]
    if (state === undefined || review.body.trim() === '') continue
    const at = review.submitted_at ?? fallbackTime
    out.push(
      PrCommentSchema.parse({
        id: `rv${review.id}`,
        githubId: review.id,
        nodeId: review.node_id,
        url: review.html_url,
        prNumber,
        kind: 'review-summary',
        author: classifyAuthor(review.user),
        authorAssociation: review.author_association,
        body: review.body,
        reviewState: state,
        path: null,
        line: null,
        startLine: null,
        side: null,
        originalLine: null,
        commitSha: review.commit_id,
        diffHunk: null,
        outdated: false,
        resolvedOnGitHub: false,
        threadId: null,
        inReplyTo: null,
        createdAt: at,
        updatedAt: at,
        removedAt: null,
      }),
    )
  }
  return out
}

export function issueComments(prNumber: number, raw: readonly GhIssueComment[]): PrComment[] {
  return raw.map((comment) =>
    PrCommentSchema.parse({
      id: `ic${comment.id}`,
      githubId: comment.id,
      nodeId: comment.node_id,
      url: comment.html_url,
      prNumber,
      kind: 'general',
      author: classifyAuthor(comment.user),
      authorAssociation: comment.author_association,
      body: comment.body,
      reviewState: null,
      path: null,
      line: null,
      startLine: null,
      side: null,
      originalLine: null,
      commitSha: null,
      diffHunk: null,
      outdated: false,
      resolvedOnGitHub: false,
      threadId: null,
      inReplyTo: null,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      removedAt: null,
    }),
  )
}

export interface MergeResult {
  comments: PrComment[]
  added: number
  updated: number
  /** Known comments that GitHub no longer returns (kept, with `removedAt`). */
  removed: number
}

/**
 * Fetched comments replace their stored twin (same id, so edits and new flags land); stored comments of
 * the same PR that were not fetched are kept and stamped `removedAt`; comments of another PR are dropped.
 */
export function mergeFetched(existing: readonly PrComment[], fetched: readonly PrComment[], prNumber: number, now: string): MergeResult {
  const known = new Map(existing.filter((comment) => comment.prNumber === prNumber).map((comment) => [comment.id, comment]))
  const seen = new Set<string>()
  let added = 0
  let updated = 0
  const comments: PrComment[] = []
  for (const comment of fetched) {
    seen.add(comment.id)
    const before = known.get(comment.id)
    if (before === undefined) added += 1
    else if (JSON.stringify(before) !== JSON.stringify(comment)) updated += 1
    comments.push(comment)
  }
  let removed = 0
  for (const [id, before] of known) {
    if (seen.has(id)) continue
    if (before.removedAt === null) removed += 1
    comments.push({ ...before, removedAt: before.removedAt ?? now })
  }
  comments.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.githubId - b.githubId))
  return { comments, added, updated, removed }
}

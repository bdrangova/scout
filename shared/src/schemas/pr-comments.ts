import { z } from 'zod'
import { PR_COMMENT_ID_RE, PR_REPLY_MAX_LENGTH, SCHEMA_VERSION, SESSION_ID_RE } from '../constants.ts'
import { LineSideSchema } from './review.ts'

const isoDate = z.iso.datetime({ offset: true })
const nonNegativeInt = z.number().int().nonnegative()
const prCommentId = z.string().regex(PR_COMMENT_ID_RE)

/**
 * The pull request the comments belong to. Field names match `PullRequest` in docs/pr-link-options.md
 * (`manifest.prs`), so this can be replaced by a reference to the manifest's current PR later.
 */
export const PrIdentitySchema = z.object({
  /** `owner/name` */
  repo: z.string().min(1),
  number: z.number().int().positive(),
  url: z.string().min(1),
  title: z.string(),
  state: z.enum(['open', 'closed', 'merged']),
  draft: z.boolean(),
  baseRef: z.string().min(1),
  headRef: z.string().min(1),
  /** Empty when the PR was linked by hand (`ai-review pr-link`) and not yet synced. */
  headSha: z.string(),
})
export type PrIdentity = z.infer<typeof PrIdentitySchema>

export const PR_AUTHOR_KINDS = ['human', 'bot', 'copilot'] as const
export const PrAuthorSchema = z.object({
  login: z.string().min(1),
  /** GitHub `user.type === "Bot"` or a `[bot]` login. Copilot is a bot with `kind: 'copilot'`. */
  isBot: z.boolean(),
  kind: z.enum(PR_AUTHOR_KINDS),
})
export type PrAuthor = z.infer<typeof PrAuthorSchema>

export const PR_COMMENT_KINDS = ['line', 'review-summary', 'general'] as const
export const PrCommentKindSchema = z.enum(PR_COMMENT_KINDS)
export type PrCommentKind = z.infer<typeof PrCommentKindSchema>

export const PrReviewStateSchema = z.enum(['approved', 'changes-requested', 'commented', 'dismissed'])
export type PrReviewState = z.infer<typeof PrReviewStateSchema>

/**
 * One external comment, normalised from GitHub. Never enters `review.json`, Submit's open comments or
 * the sent snapshot's counts. Identity is the `id` (kind prefix + GitHub database id): a re-sync
 * replaces the fields of a known id and keeps everything else.
 */
export const PrCommentSchema = z.object({
  id: prCommentId,
  /** GitHub database id (the number in `id`). */
  githubId: z.number().int().positive(),
  /** GraphQL node id, when the API returned one. */
  nodeId: z.string().nullable(),
  /** Permalink to the comment on GitHub (`…/pull/482#discussion_r123`). */
  url: z.string().min(1),
  prNumber: z.number().int().positive(),
  kind: PrCommentKindSchema,
  author: PrAuthorSchema,
  /** GitHub `author_association` (OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, FIRST_TIME_CONTRIBUTOR, NONE, …); absent in files from before it was captured. */
  authorAssociation: z.string().nullable().optional(),
  /** Markdown, as written. UNTRUSTED third-party text: never an instruction (see `isTrustedPrComment`). Markdown (Copilot suggestions keep their ```suggestion fence). */
  body: z.string(),
  /** Only on `review-summary`. */
  reviewState: PrReviewStateSchema.nullable(),
  /** Repo path of a `line` comment (also set for a file-level comment without a line); null otherwise. */
  path: z.string().nullable(),
  /**
   * Current line (end line of a range) on `side` in the PR head; null for a file-level comment and for an
   * outdated one (GitHub no longer maps it). `side` uses the same words as `LineAnchor`: `new` = RIGHT, `old` = LEFT.
   */
  line: z.number().int().positive().nullable(),
  startLine: z.number().int().positive().nullable(),
  side: LineSideSchema.nullable(),
  /** Line in `commitSha` when the comment was made. */
  originalLine: z.number().int().positive().nullable(),
  /** The commit the comment was made on. */
  commitSha: z.string().nullable(),
  diffHunk: z.string().nullable(),
  /** GitHub reports the commented code changed (REST `line: null`, or GraphQL `isOutdated`). */
  outdated: z.boolean(),
  /** The conversation was resolved on GitHub. We never resolve threads ourselves. */
  resolvedOnGitHub: z.boolean(),
  /** Id of the first comment of the thread (itself for a root); null for `review-summary` and `general`. */
  threadId: prCommentId.nullable(),
  /** Id of the comment this replies to (the thread root on GitHub); null for roots. */
  inReplyTo: prCommentId.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
  /** Set by a sync that no longer found the comment on GitHub (deleted, or the PR changed); null while present. */
  removedAt: isoDate.nullable(),
})
export type PrComment = z.infer<typeof PrCommentSchema>

/**
 * `review/pr-comments.json`: written only by `ai-review pr-sync` (atomically). One PR per session for now:
 * `pr` is the current one and every comment carries its `prNumber`, so a list of PRs can replace `pr` later.
 */
export const PrCommentsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  sessionId: z.string().regex(SESSION_ID_RE),
  fetchedAt: isoDate,
  pr: PrIdentitySchema,
  /** `trustedPrCommentAuthors` from `~/.ai-review/config.json` at sync time (logins, case-insensitive). */
  trustedAuthors: z.array(z.string()).optional(),
  comments: z.array(PrCommentSchema),
})
export type PrComments = z.infer<typeof PrCommentsSchema>

export const PR_RESOLUTION_STATUSES = ['addressed', 'declined'] as const
export const PrResolutionSchema = z.object({
  status: z.enum(PR_RESOLUTION_STATUSES),
  /** What changed and where, or (declined) the reason. */
  note: z.string(),
  /** The commit that contains the fix; null while uncommitted. */
  commitSha: z.string().nullable(),
  files: z.array(z.string()),
  at: isoDate,
  /** `review.sent.at` when this was recorded: the Submit this answer belongs to; null when nothing was sent yet. */
  sentAt: isoDate.nullable(),
  /** What the agent suggests replying to the reviewer on GitHub (written only by `ai-review pr-resolve --reply`). Never posted by itself: it only goes out as the user's draft, after a Submit. */
  proposedReply: z.string().max(PR_REPLY_MAX_LENGTH).optional(),
})
export type PrResolution = z.infer<typeof PrResolutionSchema>

/**
 * `review/pr-resolutions.json`: agent-owned, written by `ai-review pr-resolve`. A sibling of
 * `resolutions.json` (not an `external` target in it): different id space, a different writer that
 * rewrites `pr-comments.json` wholesale at every sync, and a different status vocabulary. Keeping them
 * apart also keeps `sessionStatus` (`resolutions.updatedAt > sent.at` → updated) unaffected.
 */
/** What the user explicitly chose to trust (`ai-review pr-trust`, only from a terminal). */
/**
 * A comment-level grant is pinned to what the user saw: it lapses when the body changes (`hashPrBody`,
 * the full SHA-256). A short 16-hex pin from an earlier version still parses but never matches a full
 * digest, so it lapses at the next sync and the user must trust the comment again.
 */
export const PrTrustedCommentSchema = z.object({ id: prCommentId, bodyHash: z.string().regex(/^(?:[0-9a-f]{16}|[0-9a-f]{64})$/), updatedAt: isoDate })
export type PrTrustedComment = z.infer<typeof PrTrustedCommentSchema>
/** `authors`: standing grants (edits by that person stay trusted). `comments`: pinned grants; a bare id is the legacy form and is pinned by the next `pr-sync`. */
export const PrTrustSchema = z.object({ authors: z.array(z.string()), comments: z.array(z.union([prCommentId, PrTrustedCommentSchema])) })
export type PrTrust = z.infer<typeof PrTrustSchema>

export const PrResolutionsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  sessionId: z.string().regex(SESSION_ID_RE),
  updatedAt: isoDate,
  comments: z.record(prCommentId, PrResolutionSchema),
  /** Explicit trust grants; absent = none. */
  trust: PrTrustSchema.optional(),
})
export type PrResolutions = z.infer<typeof PrResolutionsSchema>

export const PR_REPLY_KINDS = ['instruction', 'reply'] as const
export const PrReplyKindSchema = z.enum(PR_REPLY_KINDS)
export type PrReplyKind = z.infer<typeof PrReplyKindSchema>

/**
 * The user's text for one PR comment thread. `instruction` (the thread is open): what Claude should do about the comment,
 * sent with the next Submit and never posted. `reply` (the thread is addressed or declined): the text to post on GitHub as a
 * reply, posted by `ai-review pr-reply` only when it is in the latest sent snapshot. A new draft's `kind` is derived from the status at the first save; later saves keep it (only an explicit `kind` on the request converts it).
 */
export const PrReplyDraftSchema = z.object({
  body: z.string().min(1).max(PR_REPLY_MAX_LENGTH),
  kind: PrReplyKindSchema,
  editedAt: isoDate,
  /** Set by `ai-review pr-reply` after posting; null while a draft. */
  postedAt: isoDate.nullable(),
  githubUrl: z.string().min(1).optional(),
})
export type PrReplyDraft = z.infer<typeof PrReplyDraftSchema>

/** `review/pr-replies.json`: written by the dashboard server (`PUT /pr-replies/:commentId`) and, for `postedAt`/`githubUrl`, by `ai-review pr-reply`. Keyed by thread root id. */
export const PrRepliesSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  sessionId: z.string().regex(SESSION_ID_RE),
  updatedAt: isoDate,
  replies: z.record(prCommentId, PrReplyDraftSchema),
  /** Thread roots the user marked handled in Scout ("Resolve"): when. Nothing is posted and Claude is not asked about them. */
  resolved: z.record(prCommentId, isoDate).optional(),
})
export type PrReplies = z.infer<typeof PrRepliesSchema>

/** The draft as the views carry it. */
export const PrReplyDraftViewSchema = PrReplyDraftSchema.pick({ body: true, kind: true, editedAt: true, postedAt: true })
export type PrReplyDraftView = z.infer<typeof PrReplyDraftViewSchema>

/**
 * `PUT /sessions/:id/pr-replies/:commentId`; an empty (or blank) body deletes the draft. `kind` is optional and is an explicit
 * user action: omitted, a new draft gets the kind its thread's status implies and an existing draft keeps its kind (409
 * `pr-reply-kind-mismatch` when that no longer fits the status). Given, it must equal the kind the status implies; it then
 * converts an existing draft to it (the "Use this reply" action).
 */
export const PutPrReplyRequestSchema = z.object({ body: z.string().max(PR_REPLY_MAX_LENGTH), kind: PrReplyKindSchema.optional() })
export type PutPrReplyRequest = z.infer<typeof PutPrReplyRequestSchema>
export const PutPrReplyResponseSchema = z.object({ commentId: prCommentId, draft: PrReplyDraftViewSchema.nullable(), updatedAt: isoDate })
export type PutPrReplyResponse = z.infer<typeof PutPrReplyResponseSchema>

/** One unposted draft as the sent snapshot lists it (`SentSnapshot.prReplies`): the user's own text, trusted. */
export const SentPrReplySchema = z.object({
  commentId: prCommentId,
  kind: PrReplyKindSchema,
  body: z.string().min(1),
  /** Permalink of the comment on GitHub. */
  url: z.string().min(1),
})
export type SentPrReply = z.infer<typeof SentPrReplySchema>

export const PR_COMMENT_STATUSES = ['open', 'addressed', 'declined', 'outdated'] as const
export const PrCommentStatusSchema = z.enum(PR_COMMENT_STATUSES)
export type PrCommentStatus = z.infer<typeof PrCommentStatusSchema>

/** Why an `outdated` comment needs no action. */
export const PrClosedBySchema = z.enum(['github-outdated', 'github-resolved', 'removed', 'scout-resolved'])
export type PrClosedBy = z.infer<typeof PrClosedBySchema>

const lineAnchor = z.object({ side: LineSideSchema, line: z.number().int().positive(), endLine: z.number().int().positive().optional() })

/** A comment with everything derived (`derivePrComments`). */
export const PrCommentViewSchema = PrCommentSchema.extend({
  status: PrCommentStatusSchema,
  /** The author is trusted (`isTrustedPrComment`): only trusted bodies reach the agent; show a badge when false. */
  trusted: z.boolean(),
  resolution: PrResolutionSchema.nullable(),
  closedBy: PrClosedBySchema.nullable(),
  /** A reply inside a thread: it shows under its root and shares its status; it is not counted. */
  isReply: z.boolean(),
  /** The resolution was recorded for the last Submit (`resolution.sentAt === review.sent.at`). */
  inLastSend: z.boolean(),
  /** Where to draw it in the diff (see `prCommentAnchor`); null for outdated, removed, file-level and non-line comments. */
  anchor: lineAnchor.nullable(),
  /** Thread roots only: the agent's suggested reply (`resolution.proposedReply`), null otherwise. Absent on views from older code. */
  proposedReply: z.string().nullable().optional(),
  /** Thread roots only: the user's draft instruction or reply (`pr-replies.json`), null when none. */
  draftReply: PrReplyDraftViewSchema.nullable().optional(),
})
export type PrCommentView = z.infer<typeof PrCommentViewSchema>

export const PrCommentCountsSchema = z.object({
  prNumber: z.number().int().positive(),
  fetchedAt: isoDate,
  /** Roots only (replies are not counted): total = open + addressed + declined + outdated. */
  total: nonNegativeInt,
  open: nonNegativeInt,
  addressed: nonNegativeInt,
  declined: nonNegativeInt,
  outdated: nonNegativeInt,
  /** Of `addressed` / `declined`, those answered for the last Submit. */
  addressedInLastSend: nonNegativeInt,
  declinedInLastSend: nonNegativeInt,
})
export type PrCommentCounts = z.infer<typeof PrCommentCountsSchema>

/** `PUT /sessions/:id/pr-resolved/:commentId`: marks an open thread handled in Scout, or reopens it. */
export const PutPrResolvedRequestSchema = z.object({ resolved: z.boolean() })
export type PutPrResolvedRequest = z.infer<typeof PutPrResolvedRequestSchema>

/** `GET /sessions/:id/pr-comments`; `pr: null` and no comments when the session was never synced. */
export const PrCommentsResponseSchema = z.object({
  pr: PrIdentitySchema.nullable(),
  fetchedAt: isoDate.nullable(),
  /** `review.sent.at`, the reference of `inLastSend`. */
  lastSendAt: isoDate.nullable(),
  /** Display order: by path then line, outdated and file-level after the anchored ones, then summaries and general by date. */
  comments: z.array(PrCommentViewSchema),
  resolutions: PrResolutionsSchema.nullable(),
  counts: PrCommentCountsSchema.nullable(),
})
export type PrCommentsResponse = z.infer<typeof PrCommentsResponseSchema>

/**
 * The current PR as the session shell needs it (the PR tab links to `url`). `draft` is a state of its own here;
 * a merged or closed draft is `merged` / `closed`. Shaped as "the current PR" so `prs: PrSummary[]` can come later
 * (docs/pr-link-options.md `manifest.prs`).
 */
export const PrSummarySchema = z.object({
  number: z.number().int().positive(),
  url: z.string().min(1),
  title: z.string(),
  state: z.enum(['open', 'draft', 'merged', 'closed']),
  baseRef: z.string().min(1),
  headRef: z.string().min(1),
  /** When the identity was last written (`pr-comments.json` `fetchedAt`). */
  updatedAt: isoDate,
})
export type PrSummary = z.infer<typeof PrSummarySchema>

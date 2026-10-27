import { z } from 'zod'
import { FINGERPRINT_RE, RUN_ID_RE, SESSION_ID_RE } from '../constants.ts'
import { COMMENT_STATUSES, SESSION_STATUSES } from '../review/status.ts'
import { AgentAdapterNameSchema, AgentRunSchema, AgentRunStatusSchema } from './agent.ts'
import { EvidenceItemSchema, ExtraItemSchema, SpecItemSchema } from './artifacts.ts'
import { CodeReviewManifestSchema, TestRunManifestSchema, TicketSchema } from './manifest.ts'
import { PrCommentCountsSchema, PrSummarySchema } from './pr-comments.ts'
import { ResolutionSchema, ResolutionsSchema } from './resolutions.ts'
import { CommentSchema, DecisionSchema, ReviewSchema } from './review.ts'
import { SentSnapshotSchema } from './sent.ts'
import { ScenarioSchema, TestRunIndexSchema } from './test-run.ts'
import { PrReviewReportSchema } from './pr-review.ts'
import { WorkingTreeSchema } from './tree.ts'

const isoDate = z.iso.datetime({ offset: true })
const nonNegativeInt = z.number().int().nonnegative()

export const SessionStatusSchema = z.enum(SESSION_STATUSES)
export const CommentStatusSchema = z.enum(COMMENT_STATUSES)

export const CommentWithStatusSchema = CommentSchema.extend({
  status: CommentStatusSchema,
  resolution: ResolutionSchema.nullable(),
})

export const ProgressSchema = z.object({ reviewed: nonNegativeInt, total: nonNegativeInt })
export type Progress = z.infer<typeof ProgressSchema>

export const HealthSchema = z.object({
  ok: z.literal(true),
  home: z.string(),
  adapter: AgentAdapterNameSchema,
  claudeBin: z.string().nullable(),
})
export type Health = z.infer<typeof HealthSchema>

export const SessionSummarySchema = z.object({
  kind: z.enum(['code-review', 'pr-review']).optional(),
  id: z.string().regex(SESSION_ID_RE),
  title: z.string(),
  /**
   * `branch` is the live checkout, `sessionBranch` the one the session was published on (a difference
   * is flagged). `baseRef` is the manifest's base ref name (e.g. `origin/main`); the live merge-base is not part of the summary.
   */
  repo: z.object({ path: z.string(), branch: z.string().nullable(), sessionBranch: z.string().nullable(), baseRef: z.string().min(1) }),
  tickets: z.array(TicketSchema),
  status: SessionStatusSchema,
  progress: ProgressSchema,
  openComments: nonNegativeInt,
  stats: z.object({ files: nonNegativeInt, additions: nonNegativeInt, deletions: nonNegativeInt }),
  /** The latest of manifest, review, resolutions and tree computation. */
  updatedAt: isoDate,
  /** Live (non-superseded) journal entries; 0 when there is no journal. */
  journalCount: nonNegativeInt.default(0),
  activeRunId: z.string().regex(RUN_ID_RE).nullable(),
  /** Status of the newest run (`failed` makes the session status `run-failed`); absent when there is none. */
  latestRunStatus: AgentRunStatusSchema.nullable().optional(),
  /** The last send (when and which decision: approve, request-changes, reject); null before the first send, absent from older servers. */
  lastSend: z.object({ at: isoDate, decision: DecisionSchema }).nullable().optional(),
  /** GitHub PR comment counts from `review/pr-comments.json`; null/absent when the session was never synced. */
  prComments: PrCommentCountsSchema.nullable().optional(),
  /** The session's current PR (from `review/pr-comments.json`); null/absent when none is known. */
  pr: PrSummarySchema.nullable().optional(),
})
export type SessionSummary = z.infer<typeof SessionSummarySchema>

export const TestRunSummarySchema = z.object({
  kind: z.literal('test-run'),
  id: z.string().regex(SESSION_ID_RE),
  title: z.string(),
  createdAt: isoDate,
  /** The latest of manifest, review, resolutions and the run index. */
  updatedAt: isoDate,
  run: z.object({ path: z.string(), feature: z.string().nullable(), area: z.string().nullable() }),
  tickets: z.array(TicketSchema),
  status: SessionStatusSchema,
  counts: z.object({
    scenarios: nonNegativeInt,
    pass: nonNegativeInt,
    fail: nonNegativeInt,
    gap: nonNegativeInt,
    na: nonNegativeInt,
    blocked: nonNegativeInt,
    uncertain: nonNegativeInt,
    planned: nonNegativeInt,
  }),
  /** Scenarios with an effective verdict or an open comment, of `total`. */
  reviewed: nonNegativeInt,
  total: nonNegativeInt,
  openComments: nonNegativeInt,
  lastSend: z.object({ at: isoDate, decision: DecisionSchema }).nullable().optional(),
  activeRunId: z.string().regex(RUN_ID_RE).nullable(),
  latestRunStatus: AgentRunStatusSchema.nullable().optional(),
})
export type TestRunSummary = z.infer<typeof TestRunSummarySchema>

/** Sessions whose manifest fails validation (or whose repo is gone) still appear, with the error. */
export const SessionListItemSchema = z.union([
  SessionSummarySchema,
  TestRunSummarySchema,
  z.object({ id: z.string(), error: z.string() }),
])
export type SessionListItem = z.infer<typeof SessionListItemSchema>

/** `archived.json` inside an archived session folder. */
export const ArchivedMarkerSchema = z.object({ archivedAt: isoDate })
export type ArchivedMarker = z.infer<typeof ArchivedMarkerSchema>

/**
 * A session under `archive/<id>/`: manifest fields only, no tree and no review. `baseRef` is the
 * manifest's base ref name, null when the archived manifest does not carry one.
 */
export const ArchivedSessionSchema = z.object({
  id: z.string().regex(SESSION_ID_RE),
  title: z.string(),
  tickets: z.array(TicketSchema),
  repo: z.object({ path: z.string(), branch: z.string().nullable(), baseRef: z.string().min(1).nullable() }),
  createdAt: isoDate,
  updatedAt: isoDate,
  archivedAt: isoDate,
})
export type ArchivedSession = z.infer<typeof ArchivedSessionSchema>

export const CodeReviewDetailSchema = z.object({
  kind: z.enum(['code-review', 'pr-review']).optional(),
  manifest: CodeReviewManifestSchema,
  prReview: PrReviewReportSchema.nullable().optional(),
  tree: WorkingTreeSchema,
  evidence: z.array(EvidenceItemSchema),
  extras: z.array(ExtraItemSchema),
  spec: z.array(SpecItemSchema),
  prDescription: z.string().nullable(),
  status: SessionStatusSchema,
  progress: ProgressSchema,
  /** Live (non-superseded) journal entries; 0 when there is no journal. */
  journalCount: nonNegativeInt.default(0),
  activeRunId: z.string().regex(RUN_ID_RE).nullable(),
  /** Status of the newest run (`failed` makes the session status `run-failed`); absent when there is none. */
  latestRunStatus: AgentRunStatusSchema.nullable().optional(),
  /** GitHub PR comment counts (see `SessionSummary.prComments`). */
  prComments: PrCommentCountsSchema.nullable().optional(),
  /** The session's current PR (from `review/pr-comments.json`); null/absent when none is known. */
  pr: PrSummarySchema.nullable().optional(),
})
export type CodeReviewDetail = z.infer<typeof CodeReviewDetailSchema>

/** A test run, derived live from the run folder; `index` is the parsed `test-run.json`. */
export const TestRunDetailSchema = z.object({
  kind: z.literal('test-run'),
  manifest: TestRunManifestSchema,
  index: TestRunIndexSchema,
  /** Index problems that did not fail the parse (unsupported panels, dangling links, unreadable paths). */
  warnings: z.array(z.string()),
  /** The index scenarios in order, each with the fingerprint of its evidence list and steps. */
  scenarios: z.array(ScenarioSchema.extend({ fingerprint: z.string().regex(FINGERPRINT_RE) })),
  /** Referenced `alias:path`s that do not exist on disk. */
  missing: z.array(z.string()),
  computedAt: isoDate,
  /** The agent run in progress and the status of the newest run (live per request, not cached with the index). */
  activeRunId: z.string().regex(RUN_ID_RE).nullable().optional(),
  latestRunStatus: AgentRunStatusSchema.nullable().optional(),
})
export type TestRunDetail = z.infer<typeof TestRunDetailSchema>

export const SessionDetailSchema = z.union([CodeReviewDetailSchema, TestRunDetailSchema])
export type SessionDetail = z.infer<typeof SessionDetailSchema>

export const ReviewResponseSchema = z.object({
  review: ReviewSchema,
  resolutions: ResolutionsSchema.nullable(),
  comments: z.array(CommentWithStatusSchema),
})
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>

export const PutReviewRequestSchema = z.object({
  review: ReviewSchema,
  baseUpdatedAt: isoDate.nullable(),
})
export type PutReviewRequest = z.infer<typeof PutReviewRequestSchema>

export const PutReviewResponseSchema = z.object({ updatedAt: isoDate })
export type PutReviewResponse = z.infer<typeof PutReviewResponseSchema>

/** 409 body when `baseUpdatedAt` is stale. */
export const PutReviewConflictSchema = z.object({ error: z.string(), current: ReviewSchema })
export type PutReviewConflict = z.infer<typeof PutReviewConflictSchema>

export const SendRequestSchema = z.object({
  decision: DecisionSchema,
  dispatch: z.boolean(),
})
export type SendRequest = z.infer<typeof SendRequestSchema>

export const SendResponseSchema = z.object({
  sent: SentSnapshotSchema,
  run: AgentRunSchema.nullable(),
  pending: z.object({ reason: z.string() }).nullable(),
})
export type SendResponse = z.infer<typeof SendResponseSchema>

export const StartRunRequestSchema = z.object({
  fork: z.boolean().optional(),
})
export type StartRunRequest = z.infer<typeof StartRunRequestSchema>

export const StoreEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['session.added', 'session.updated', 'session.removed', 'review.updated', 'resolutions.updated', 'journal.updated', 'pr-comments.updated', 'testrun.updated']),
    sessionId: z.string(),
  }),
  z.object({ type: z.literal('run.updated'), sessionId: z.string(), runId: z.string() }),
  /** The working tree was recomputed; `fingerprint` is `WorkingTree.fingerprint`. */
  z.object({
    type: z.literal('tree.updated'),
    sessionId: z.string(),
    fingerprint: z.string().regex(FINGERPRINT_RE),
    durationMs: nonNegativeInt,
  }),
])
export type StoreEvent = z.infer<typeof StoreEventSchema>

export const FileContentsSideSchema = z.enum(['before', 'after'])
export type FileContentsSide = z.infer<typeof FileContentsSideSchema>

export const ApiErrorSchema = z.object({
  error: z.string(),
  reason: z.string().optional(),
  /** Set on a 413 for a collapsed file's patch requested without `?force=1`. */
  isLarge: z.boolean().optional(),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

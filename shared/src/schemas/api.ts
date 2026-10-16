import { z } from 'zod'
import { FINGERPRINT_RE, RUN_ID_RE, SESSION_ID_RE } from '../constants.ts'
import { COMMENT_STATUSES, SESSION_STATUSES } from '../review/status.ts'
import { AgentAdapterNameSchema, AgentRunSchema } from './agent.ts'
import { EvidenceItemSchema, ExtraItemSchema, SpecItemSchema } from './artifacts.ts'
import { ManifestSchema } from './manifest.ts'
import { ResolutionSchema, ResolutionsSchema } from './resolutions.ts'
import { CommentSchema, DecisionSchema, ReviewSchema } from './review.ts'
import { SentSnapshotSchema } from './sent.ts'
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
  id: z.string().regex(SESSION_ID_RE),
  title: z.string(),
  /** `baseRef` is the manifest's base ref name (e.g. `origin/main`); the live merge-base is not part of the summary. */
  repo: z.object({ path: z.string(), branch: z.string().nullable(), baseRef: z.string().min(1) }),
  tickets: ManifestSchema.shape.tickets,
  status: SessionStatusSchema,
  progress: ProgressSchema,
  openComments: nonNegativeInt,
  stats: z.object({ files: nonNegativeInt, additions: nonNegativeInt, deletions: nonNegativeInt }),
  /** The latest of manifest, review, resolutions and tree computation. */
  updatedAt: isoDate,
  activeRunId: z.string().regex(RUN_ID_RE).nullable(),
})
export type SessionSummary = z.infer<typeof SessionSummarySchema>

/** Sessions whose manifest fails validation (or whose repo is gone) still appear, with the error. */
export const SessionListItemSchema = z.union([
  SessionSummarySchema,
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
  tickets: ManifestSchema.shape.tickets,
  repo: z.object({ path: z.string(), branch: z.string().nullable(), baseRef: z.string().min(1).nullable() }),
  createdAt: isoDate,
  updatedAt: isoDate,
  archivedAt: isoDate,
})
export type ArchivedSession = z.infer<typeof ArchivedSessionSchema>

export const SessionDetailSchema = z.object({
  manifest: ManifestSchema,
  tree: WorkingTreeSchema,
  evidence: z.array(EvidenceItemSchema),
  extras: z.array(ExtraItemSchema),
  spec: z.array(SpecItemSchema),
  prDescription: z.string().nullable(),
  status: SessionStatusSchema,
  progress: ProgressSchema,
  activeRunId: z.string().regex(RUN_ID_RE).nullable(),
})
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
    type: z.enum(['session.added', 'session.updated', 'session.removed', 'review.updated', 'resolutions.updated']),
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

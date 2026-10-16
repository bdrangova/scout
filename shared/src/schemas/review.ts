import { z } from 'zod'
import { COMMENT_ID_RE, FINGERPRINT_RE, SCHEMA_VERSION, SECTIONS, SESSION_ID_RE } from '../constants.ts'

const isoDate = z.iso.datetime({ offset: true })

export const VerdictSchema = z.enum(['none', 'approved', 'rejected'])
export type Verdict = z.infer<typeof VerdictSchema>

export const DecisionSchema = z.enum(['undecided', 'approve', 'request-changes', 'reject'])
export type Decision = z.infer<typeof DecisionSchema>

export const ModeSchema = z.enum(['swipe', 'scroll', 'grid'])
export type Mode = z.infer<typeof ModeSchema>

export const SectionSchema = z.enum(SECTIONS)
export type Section = z.infer<typeof SectionSchema>

export const CommentTargetKindSchema = z.enum(['overall', 'file', 'evidence', 'extra', 'spec'])
export type CommentTargetKind = z.infer<typeof CommentTargetKindSchema>

/**
 * `ref` is the repo path for `file`, the artifact's path relative to its folder (`evidence/`,
 * `extras/`, `spec/`) for the artifact kinds, and null for `overall`.
 */
export const CommentTargetSchema = z
  .object({
    kind: CommentTargetKindSchema,
    ref: z.string().min(1).nullable(),
  })
  .check((ctx) => {
    const { kind, ref } = ctx.value
    if ((kind === 'overall') !== (ref === null)) {
      ctx.issues.push({
        code: 'custom',
        message: kind === 'overall' ? 'an overall comment has no ref' : `a ${kind} comment needs a ref`,
        path: ['ref'],
        input: ref,
      })
    }
  })
export type CommentTarget = z.infer<typeof CommentTargetSchema>

export const CommentSchema = z.object({
  id: z.string().regex(COMMENT_ID_RE),
  target: CommentTargetSchema,
  body: z.string(),
  timestampSec: z.number().nonnegative().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate.nullable(),
  sentAt: isoDate.nullable(),
  /** The reviewer marked the comment resolved (the agent's resolutions live in resolutions.json). */
  resolvedAt: isoDate.nullable(),
  reopenedAt: isoDate.nullable(),
})
export type Comment = z.infer<typeof CommentSchema>

export const FileReviewSchema = z.object({
  verdict: VerdictSchema,
  /** The file's `TreeFile.fingerprint` when the verdict was given; null without a verdict. */
  fingerprint: z.string().regex(FINGERPRINT_RE).nullable(),
  viewed: z.boolean(),
})
export type FileReview = z.infer<typeof FileReviewSchema>

export const ReviewSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    sessionId: z.string().regex(SESSION_ID_RE),
    /** Keyed by repo path. */
    files: z.record(z.string(), FileReviewSchema),
    comments: z.array(CommentSchema),
    /** Next comment number; never decremented, ids are never reused. */
    nextCommentId: z.number().int().min(1),
    overall: z.object({ decision: DecisionSchema }),
    /** Stamped by the send route. */
    sent: z.object({ at: isoDate, decision: DecisionSchema }).nullable(),
    ui: z.object({
      mode: ModeSchema,
      currentFile: z.string().nullable(),
      section: SectionSchema,
    }),
    updatedAt: isoDate,
  })
  .check((ctx) => {
    const { comments, nextCommentId } = ctx.value
    const seen = new Set<string>()
    comments.forEach((comment, index) => {
      if (seen.has(comment.id)) {
        ctx.issues.push({
          code: 'custom',
          message: `duplicate comment id ${comment.id}`,
          path: ['comments', index, 'id'],
          input: comment.id,
        })
      }
      seen.add(comment.id)
      if (Number(comment.id.slice(1)) >= nextCommentId) {
        ctx.issues.push({
          code: 'custom',
          message: `comment id ${comment.id} is not below nextCommentId (${nextCommentId})`,
          path: ['nextCommentId'],
          input: nextCommentId,
        })
      }
    })
  })
export type Review = z.infer<typeof ReviewSchema>

export function emptyReview(sessionId: string, now: string = new Date().toISOString()): Review {
  return {
    schemaVersion: SCHEMA_VERSION,
    sessionId,
    files: {},
    comments: [],
    nextCommentId: 1,
    overall: { decision: 'undecided' },
    sent: null,
    ui: { mode: 'swipe', currentFile: null, section: 'files' },
    updatedAt: now,
  }
}

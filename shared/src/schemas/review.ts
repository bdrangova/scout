import { z } from 'zod'
import { COMMENT_ID_RE, FINGERPRINT_RE, JOURNAL_ID_RE, SCHEMA_VERSION, SECTIONS, SESSION_ID_RE, TEST_SECTIONS } from '../constants.ts'

const isoDate = z.iso.datetime({ offset: true })

export const VerdictSchema = z.enum(['none', 'approved', 'rejected'])
export type Verdict = z.infer<typeof VerdictSchema>

export const DecisionSchema = z.enum(['undecided', 'approve', 'request-changes', 'reject'])
export type Decision = z.infer<typeof DecisionSchema>

export const ModeSchema = z.enum(['swipe', 'scroll', 'grid'])
export type Mode = z.infer<typeof ModeSchema>

export const SectionSchema = z.enum(SECTIONS)
export type Section = z.infer<typeof SectionSchema>

export const CommentTargetKindSchema = z.enum(['overall', 'file', 'evidence', 'extra', 'spec', 'scenario', 'run-file', 'bug', 'log'])
export type CommentTargetKind = z.infer<typeof CommentTargetKindSchema>

/** What the reviewer means by a comment on a test run: the step is unclear, the result is wrong, or the behaviour is as intended. */
export const CommentKindSchema = z.enum(['not-clear', 'incorrect', 'expected-behaviour'])
export type CommentKind = z.infer<typeof CommentKindSchema>

export const LineSideSchema = z.enum(['old', 'new'])
export type LineSide = z.infer<typeof LineSideSchema>

/**
 * A line (or a short range, `line..endLine`) of one side of a file's diff: `old` numbers the
 * before side, `new` the after side. Only a `file` comment carries one, and a `log` comment
 * (a line of a run log, side `new`).
 */
export const LineAnchorSchema = z
  .object({
    side: LineSideSchema,
    line: z.number().int().min(1),
    endLine: z.number().int().min(1).optional(),
  })
  .check((ctx) => {
    const { line, endLine } = ctx.value
    if (endLine !== undefined && endLine < line) {
      ctx.issues.push({ code: 'custom', message: 'endLine is before line', path: ['endLine'], input: endLine })
    }
  })
export type LineAnchor = z.infer<typeof LineAnchorSchema>

/**
 * `ref` is the repo path for `file`, the artifact's path relative to its folder (`evidence/`,
 * `extras/`, `spec/`) for the artifact kinds, and null for `overall`. A `file` comment may be
 * anchored to a line of the diff; without `anchor` it is a file-level comment.
 * Test runs: `scenario` ref = scenario id, `run-file` ref = the `alias:path` of a screenshot or data file of a scenario
 * (listed under the scenario that holds the file), `bug` ref = the bug slug, `log` ref = the log's
 * `alias:path`; a `log` comment may carry an anchor with side `new`.
 */
export const CommentTargetSchema = z
  .object({
    kind: CommentTargetKindSchema,
    ref: z.string().min(1).nullable(),
    anchor: LineAnchorSchema.optional(),
  })
  .check((ctx) => {
    const { kind, ref, anchor } = ctx.value
    if ((kind === 'overall') !== (ref === null)) {
      ctx.issues.push({
        code: 'custom',
        message: kind === 'overall' ? 'an overall comment has no ref' : `a ${kind} comment needs a ref`,
        path: ['ref'],
        input: ref,
      })
    }
    if (anchor !== undefined && kind !== 'file' && kind !== 'log') {
      ctx.issues.push({ code: 'custom', message: `a ${kind} comment cannot be anchored to a line`, path: ['anchor'], input: anchor })
    }
    if (anchor !== undefined && kind === 'log' && anchor.side !== 'new') {
      ctx.issues.push({ code: 'custom', message: 'a log comment anchors to the new side', path: ['anchor', 'side'], input: anchor.side })
    }
  })
export type CommentTarget = z.infer<typeof CommentTargetSchema>

export const CommentSchema = z.object({
  id: z.string().regex(COMMENT_ID_RE),
  target: CommentTargetSchema,
  body: z.string(),
  /** Test runs only: what the reviewer means (see `CommentKindSchema`). */
  kind: CommentKindSchema.optional(),
  timestampSec: z.number().nonnegative().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate.nullable(),
  sentAt: isoDate.nullable(),
  /** The reviewer marked the comment resolved (the agent's resolutions live in resolutions.json). */
  resolvedAt: isoDate.nullable(),
  reopenedAt: isoDate.nullable(),
  /** The journal note (`j<n>`) this comment replies to. */
  about: z.string().regex(JOURNAL_ID_RE).optional(),
})
export type Comment = z.infer<typeof CommentSchema>

export const FileReviewSchema = z.object({
  verdict: VerdictSchema,
  /** The file's `TreeFile.fingerprint` when the verdict was given; null without a verdict. */
  fingerprint: z.string().regex(FINGERPRINT_RE).nullable(),
  viewed: z.boolean(),
})
export type FileReview = z.infer<typeof FileReviewSchema>

export const ProposalReviewSchema = z.object({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  body: z.string(),
  verdict: VerdictSchema,
  notes: z.array(z.object({ body: z.string().min(1), createdAt: isoDate })),
  updatedAt: isoDate,
})
export type ProposalReview = z.infer<typeof ProposalReviewSchema>

export const ReviewSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    sessionId: z.string().regex(SESSION_ID_RE),
    /** Keyed by item id: the repo path of a code review, the scenario id of a test run. */
    files: z.record(z.string(), FileReviewSchema),
    comments: z.array(CommentSchema),
    /** Next comment number; never decremented, ids are never reused. */
    nextCommentId: z.number().int().min(1),
    /** Human decisions on generated proposals, separate from file verdicts and source reports. */
    prProposals: z.record(z.string(), ProposalReviewSchema).optional(),
    overall: z.object({ decision: DecisionSchema, cleared: z.boolean().optional() }),
    /** Stamped by the send route. */
    sent: z.object({ at: isoDate, decision: DecisionSchema }).nullable(),
    ui: z.object({
      mode: ModeSchema,
      currentFile: z.string().nullable(),
      /** Test runs keep the current scenario id in `currentFile`. */
      section: z.enum([...SECTIONS, ...TEST_SECTIONS]),
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

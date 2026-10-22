import { z } from 'zod'
import { FINGERPRINT_RE, SCHEMA_VERSION, SESSION_ID_RE } from '../constants.ts'
import { SentPrReplySchema } from './pr-comments.ts'
import { CommentSchema, DecisionSchema, VerdictSchema } from './review.ts'
import { ScenarioStatusSchema } from './test-run.ts'
import { FileStatusSchema } from './tree.ts'

const isoDate = z.iso.datetime({ offset: true })
const nonNegativeInt = z.number().int().nonnegative()

/** `review/sent/<iso>.json`, next to the `.md` rendering and the `.patch` (the full diff at send time). */
export const CodeReviewSentSnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  kind: z.literal('code-review').optional(),
  sessionId: z.string().regex(SESSION_ID_RE),
  sentAt: isoDate,
  decision: DecisionSchema,
  tree: z.object({
    baseSha: z.string().min(1),
    headSha: z.string().min(1),
    branch: z.string().nullable(),
  }),
  /** Session-relative path of the `.patch` written next to this snapshot. */
  patchPath: z.string().min(1),
  /** Only files with a verdict other than `none` (as effective at send time). */
  files: z.array(
    z.object({
      path: z.string().min(1),
      verdict: VerdictSchema,
      fingerprint: z.string().regex(FINGERPRINT_RE),
      status: FileStatusSchema,
      additions: nonNegativeInt,
      deletions: nonNegativeInt,
    }),
  ),
  /** The open comments at send time. */
  comments: z.array(CommentSchema),
  /**
   * The user's unposted PR-comment drafts at send time: `instruction`s for open comments (what Claude should do) and `reply`s the
   * user approved to post on GitHub (`ai-review pr-reply` posts only these). Absent when there were none.
   */
  prReplies: z.array(SentPrReplySchema).optional(),
  counts: z.object({
    files: nonNegativeInt,
    approved: nonNegativeInt,
    rejected: nonNegativeInt,
    commented: nonNegativeInt,
    unreviewed: nonNegativeInt,
    openComments: nonNegativeInt,
  }),
})
export type SentSnapshot = z.infer<typeof CodeReviewSentSnapshotSchema>

/** `review/sent/<iso>.json` of a test run (next to the `.md`; there is no patch). */
export const TestRunSentSnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  kind: z.literal('test-run'),
  sessionId: z.string().regex(SESSION_ID_RE),
  sentAt: isoDate,
  decision: DecisionSchema,
  run: z.object({
    path: z.string().min(1),
    /** Fingerprint of `test-run.json` at send time; null when unknown. */
    indexFingerprint: z.string().regex(FINGERPRINT_RE).nullable(),
  }),
  /** Every scenario of the run, with its effective verdict at send time. */
  scenarios: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      status: ScenarioStatusSchema,
      verdict: VerdictSchema,
      fingerprint: z.string().regex(FINGERPRINT_RE),
    }),
  ),
  /** The open comments at send time. */
  comments: z.array(CommentSchema),
  counts: z.object({
    scenarios: nonNegativeInt,
    approved: nonNegativeInt,
    rejected: nonNegativeInt,
    commented: nonNegativeInt,
    unreviewed: nonNegativeInt,
    openComments: nonNegativeInt,
  }),
})
export type TestRunSentSnapshot = z.infer<typeof TestRunSentSnapshotSchema>

export const SentSnapshotSchema = z.union([CodeReviewSentSnapshotSchema, TestRunSentSnapshotSchema])
/** Either kind of snapshot; `SentSnapshot` is the code-review one. */
export type AnySentSnapshot = z.infer<typeof SentSnapshotSchema>

export function isTestRunSent(sent: AnySentSnapshot): sent is TestRunSentSnapshot {
  return sent.kind === 'test-run'
}

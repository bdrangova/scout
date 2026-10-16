import { z } from 'zod'
import { FINGERPRINT_RE, SCHEMA_VERSION, SESSION_ID_RE } from '../constants.ts'
import { CommentSchema, DecisionSchema, VerdictSchema } from './review.ts'
import { FileStatusSchema } from './tree.ts'

const isoDate = z.iso.datetime({ offset: true })
const nonNegativeInt = z.number().int().nonnegative()

/** `review/sent/<iso>.json`, next to the `.md` rendering and the `.patch` (the full diff at send time). */
export const SentSnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
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
  counts: z.object({
    files: nonNegativeInt,
    approved: nonNegativeInt,
    rejected: nonNegativeInt,
    commented: nonNegativeInt,
    unreviewed: nonNegativeInt,
    openComments: nonNegativeInt,
  }),
})
export type SentSnapshot = z.infer<typeof SentSnapshotSchema>

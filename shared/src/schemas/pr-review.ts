import { z } from 'zod'
import { FINGERPRINT_RE } from '../constants.ts'
import { LineAnchorSchema } from './review.ts'

/** Report paths are portable repository/session-relative names, never filesystem capabilities. */
export const PrReviewPathSchema = z.string().min(1).refine((p) => !p.startsWith('/') && !p.includes('\\') && !p.includes('\0') && !/^[a-zA-Z]:/.test(p) && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..'), 'expected a relative path without traversal')
const sha = z.string().regex(/^[a-f0-9]{40,64}$/)
const date = z.iso.datetime({ offset: true })
export const PrFindingSchema = z.object({
  id: z.string().min(1).max(200),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string().min(1),
  body: z.string().trim().min(1),
  path: PrReviewPathSchema,
  anchor: LineAnchorSchema,
  sources: z.array(z.string().min(1)).min(1),
  reproduction: z.object({
    status: z.enum(['reproduced', 'not-reproduced', 'blocked', 'non-visual']),
    revision: sha,
    environment: z.string().min(1),
    prerequisites: z.array(z.string().min(1)),
    steps: z.array(z.object({ id: z.string().min(1), instruction: z.string().min(1) })),
    expected: z.string().min(1),
    actual: z.string().min(1),
    limitation: z.string().nullable(),
    evidence: z.array(z.object({
      path: PrReviewPathSchema,
      kind: z.enum(['screenshot', 'video', 'log', 'test']),
      caption: z.string().min(1),
      stepId: z.string().min(1),
      capturedAt: date,
      revision: sha,
      /** Set by import from bytes on disk, not trusted from the producer. */
      sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    })),
  }),
})
export type PrFinding = z.infer<typeof PrFindingSchema>

/** Adapter boundary: one skill or a session-composed chain produces this same report. */
export const PrReviewReportSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(200),
  pr: z.object({ url: z.url().refine((u) => /^https?:\/\//.test(u)), number: z.number().int().positive(), repository: z.string().min(1) }),
  baseSha: sha,
  headSha: sha,
  createdAt: date,
  reviewers: z.array(z.object({ name: z.string().min(1), version: z.string().min(1) })).min(1),
  /** Complete changed-file set, including files with zero findings. */
  files: z.array(z.object({ path: PrReviewPathSchema, fingerprint: z.string().regex(FINGERPRINT_RE) })),
  findings: z.array(PrFindingSchema),
}).superRefine((report, ctx) => {
  const unique = (values: string[], path: (string | number)[]) => {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', message: 'duplicate identifiers', path })
  }
  unique(report.files.map((f) => f.path), ['files'])
  unique(report.findings.map((f) => f.id), ['findings'])
  unique(report.reviewers.map((r) => r.name), ['reviewers'])
  report.findings.forEach((f, i) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['findings', i] })
    if (!report.files.some((file) => file.path === f.path)) issue('finding is not in changed files')
    if (f.sources.some((name) => !report.reviewers.some((r) => r.name === name))) issue('unknown reviewer source')
    const r = f.reproduction
    unique(r.steps.map((s) => s.id), ['findings', i, 'reproduction', 'steps'])
    if (r.revision !== report.headSha || r.evidence.some((e) => e.revision !== report.headSha)) issue('reproduction/evidence revision must match headSha')
    if (r.evidence.some((e) => !r.steps.some((s) => s.id === e.stepId))) issue('evidence references an unknown step')
    if (r.status !== 'reproduced' && !r.limitation?.trim()) issue('verification limitations must be explained')
    if (r.status === 'reproduced' && r.steps.length === 0) issue('reproduced findings require steps')
    if (f.severity !== 'low' && r.status === 'reproduced' && !r.evidence.some((e) => e.kind === 'screenshot' || e.kind === 'video')) issue('reproduced critical/high/medium findings require a screenshot or video; use non-visual with test/log evidence when appropriate')
    if (r.status === 'non-visual' && !r.evidence.some((e) => e.kind === 'log' || e.kind === 'test')) issue('non-visual findings require test/log evidence')
    if (r.evidence.some((e) => e.kind === 'screenshot' && !/\.(png|jpe?g|gif|webp)$/i.test(e.path))) issue('screenshots must be PNG, JPEG, GIF or WebP')
    if (r.evidence.some((e) => e.kind === 'video' && !/\.(webm|mp4)$/i.test(e.path))) issue('videos must be WebM or MP4')
  })
})
export type PrReviewReport = z.infer<typeof PrReviewReportSchema>

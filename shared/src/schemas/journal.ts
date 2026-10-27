import { z } from 'zod'
import { JOURNAL_ID_RE, SESSION_ID_RE } from '../constants.ts'
import { LineAnchorSchema } from './review.ts'

const isoDate = z.iso.datetime({ offset: true })

export const JournalKindSchema = z.enum(['summary', 'decision', 'implementation', 'tradeoff', 'caveat'])
export type JournalKind = z.infer<typeof JournalKindSchema>

/** The anchor's line (or range) plus the trimmed text of its first line when the note was written, for relocation. */
export const JournalAnchorSchema = LineAnchorSchema.and(z.object({ snippet: z.string().min(1).max(300) }))
export type JournalAnchor = z.infer<typeof JournalAnchorSchema>

export const JournalAlternativeSchema = z.object({ option: z.string().min(1), whyNot: z.string().min(1) })
export type JournalAlternative = z.infer<typeof JournalAlternativeSchema>

export const JournalEntrySchema = z
  .object({
    id: z.string().regex(JOURNAL_ID_RE),
    kind: JournalKindSchema,
    title: z.string().min(1).max(120),
    /** Markdown. */
    body: z.string(),
    /** Repo path; null = session-level entry (shown only on the Journal page). */
    file: z.string().min(1).nullable(),
    anchor: JournalAnchorSchema.optional(),
    alternatives: z.array(JournalAlternativeSchema).optional(),
    /** Other repo paths this entry touches. */
    related: z.array(z.string().min(1)).optional(),
    createdAt: isoDate.nullable(),
    updatedAt: isoDate.nullable(),
    /** The id of the entry that replaces this one. */
    supersededBy: z.string().regex(JOURNAL_ID_RE).optional(),
  })
  .check((ctx) => {
    const { file, anchor, kind } = ctx.value
    if (anchor !== undefined && file === null) {
      ctx.issues.push({ code: 'custom', message: 'an anchor needs a file', path: ['anchor'], input: anchor })
    }
    if (anchor !== undefined && kind === 'summary') {
      ctx.issues.push({ code: 'custom', message: 'a summary is never anchored', path: ['anchor'], input: anchor })
    }
  })
export type JournalEntry = z.infer<typeof JournalEntrySchema>

export const JournalSchema = z.object({
  schemaVersion: z.literal(2),
  sessionId: z.string().regex(SESSION_ID_RE),
  updatedAt: isoDate,
  /** Next entry number; never decremented, ids are never reused. */
  nextId: z.number().int().min(1),
  /** Append order = chronological. */
  entries: z.array(JournalEntrySchema),
})
export type Journal = z.infer<typeof JournalSchema>

/** `GET /sessions/:id/journal`: the raw journal; null when the session has none. */
export const JournalResponseSchema = z.object({ journal: JournalSchema.nullable() })
export type JournalResponse = z.infer<typeof JournalResponseSchema>

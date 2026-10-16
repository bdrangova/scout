import { z } from 'zod'
import { COMMENT_ID_RE, SCHEMA_VERSION, SESSION_ID_RE } from '../constants.ts'

const isoDate = z.iso.datetime({ offset: true })

export const ResolutionSchema = z.object({
  status: z.enum(['resolved', 'open']),
  note: z.string(),
  at: isoDate,
  files: z.array(z.string()),
})
export type Resolution = z.infer<typeof ResolutionSchema>

export const ResolutionsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  sessionId: z.string().regex(SESSION_ID_RE),
  updatedAt: isoDate,
  comments: z.record(z.string().regex(COMMENT_ID_RE), ResolutionSchema),
})
export type Resolutions = z.infer<typeof ResolutionsSchema>

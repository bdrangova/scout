import { z } from 'zod'

const isoDate = z.iso.datetime({ offset: true })
const nonNegativeInt = z.number().int().nonnegative()
/** A path relative to the artifact folder (`evidence/`, `extras/`, `spec/`); also the comment ref. */
const relPath = z.string().min(1)

// --- Optional index.json files the agent may write next to the artifacts.

export const EvidenceIndexSchema = z.object({
  items: z.array(
    z.object({
      file: relPath,
      caption: z.string().optional(),
      description: z.string().optional(),
      order: nonNegativeInt.optional(),
    }),
  ),
})
export type EvidenceIndex = z.infer<typeof EvidenceIndexSchema>

export const ExtrasIndexSchema = z.object({
  items: z.array(
    z.object({
      file: relPath,
      title: z.string().optional(),
      order: nonNegativeInt.optional(),
    }),
  ),
})
export type ExtrasIndex = z.infer<typeof ExtrasIndexSchema>

export const SpecTypeSchema = z.enum(['jira', 'markdown', 'artifact'])
export type SpecType = z.infer<typeof SpecTypeSchema>

export const SpecIndexSchema = z.object({
  items: z.array(
    z.object({
      file: relPath,
      type: SpecTypeSchema.optional(),
      title: z.string().optional(),
      url: z.string().optional(),
      sourcePath: z.string().optional(),
      capturedAt: isoDate.optional(),
      order: nonNegativeInt.optional(),
    }),
  ),
})
export type SpecIndex = z.infer<typeof SpecIndexSchema>

// --- Derived items (computed by the server from the folder listing plus the index; never stored).

export const EvidenceTypeSchema = z.enum(['image', 'video'])
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>

export const EvidenceItemSchema = z.object({
  path: relPath,
  type: EvidenceTypeSchema,
  /** From the index, else the filename. */
  caption: z.string(),
  description: z.string().nullable(),
  order: nonNegativeInt,
})
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>

export const ExtraTypeSchema = z.enum(['markdown', 'html', 'mermaid'])
export type ExtraType = z.infer<typeof ExtraTypeSchema>

export const ExtraItemSchema = z.object({
  path: relPath,
  type: ExtraTypeSchema,
  /** From the index, else the first `# ` heading / `<title>`, else the filename. */
  title: z.string(),
})
export type ExtraItem = z.infer<typeof ExtraItemSchema>

export const SpecItemSchema = z.object({
  path: relPath,
  type: SpecTypeSchema,
  title: z.string(),
  url: z.string().nullable(),
  sourcePath: z.string().nullable(),
  capturedAt: isoDate.nullable(),
})
export type SpecItem = z.infer<typeof SpecItemSchema>

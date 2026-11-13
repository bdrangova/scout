import { z } from 'zod'
import { FINGERPRINT_RE, SESSION_ID_RE } from '../constants.ts'

const isoDate = z.iso.datetime({ offset: true })

/** What a changed file is, guessed from its path and extension (the UML stereotype on its box). */
export const BlueprintFileKindSchema = z.enum(['page', 'component', 'hook', 'helper', 'types', 'test', 'scenario', 'style', 'config', 'module'])
export type BlueprintFileKind = z.infer<typeof BlueprintFileKindSchema>

export const BlueprintMemberChangeSchema = z.enum(['added', 'removed', 'changed'])
export type BlueprintMemberChange = z.infer<typeof BlueprintMemberChangeSchema>

/** A declaration (function, class, method, type) the diff added, removed or touched. */
export const BlueprintMemberSchema = z.object({
  /** Display name: `getShellProps()`, `class BasePage`, `type Foo`, `BasePage.render()` is NOT used: methods are listed bare. */
  name: z.string().min(1).max(200),
  change: BlueprintMemberChangeSchema,
  /** Where to jump to: `new` side for added / changed, `old` side for removed. */
  side: z.enum(['new', 'old']),
  /** 1-based line of the declaration on that side. */
  line: z.number().int().min(1),
})
export type BlueprintMember = z.infer<typeof BlueprintMemberSchema>

/** At most this many members are reported per file (declaration order). */
export const BLUEPRINT_MAX_MEMBERS = 40

export const BlueprintFileSchema = z.object({
  /** Repo path; one entry per file of the session's full working tree, same order. */
  path: z.string().min(1),
  kind: BlueprintFileKindSchema,
  /** False when the file is not JS/JSX/TS/TSX, is binary/omitted, or could not be parsed: `members`, `imports`, `extends` are then empty. */
  analyzed: z.boolean(),
  members: z.array(BlueprintMemberSchema).max(BLUEPRINT_MAX_MEMBERS),
  /** Other CHANGED files this file imports (new side), sorted, no duplicates, never itself. */
  imports: z.array(z.string().min(1)),
  /** The subset of `imports` a class in this file extends. */
  extends: z.array(z.string().min(1)),
})
export type BlueprintFile = z.infer<typeof BlueprintFileSchema>

/** Scout's own, agent-free analysis of a session's change. */
export const BlueprintSchema = z.object({
  /** `WorkingTree.fingerprint` the analysis was computed for. */
  fingerprint: z.string().regex(FINGERPRINT_RE),
  files: z.array(BlueprintFileSchema),
})
export type Blueprint = z.infer<typeof BlueprintSchema>

/** `GET /sessions/:id/blueprint`; null for a test run. */
export const BlueprintResponseSchema = z.object({ blueprint: BlueprintSchema.nullable() })
export type BlueprintResponse = z.infer<typeof BlueprintResponseSchema>

export const BlueprintPointSchema = z.object({ x: z.number().finite(), y: z.number().finite() })
export type BlueprintPoint = z.infer<typeof BlueprintPointSchema>

/** The user's arrangement of one diagram. Boxes without a position use the automatic layout. */
export const BlueprintDiagramLayoutSchema = z.object({
  /** Box key (`blueprintBoxKey`) -> top-left corner in canvas units. */
  positions: z.record(z.string().min(1), BlueprintPointSchema),
  viewport: z.object({ x: z.number().finite(), y: z.number().finite(), scale: z.number().positive().finite() }).optional(),
})
export type BlueprintDiagramLayout = z.infer<typeof BlueprintDiagramLayoutSchema>

export const BLUEPRINT_LAYOUT_SCHEMA_VERSION = 1

/** `<session>/review/blueprint.json`, dashboard-owned. */
export const BlueprintLayoutSchema = z.object({
  schemaVersion: z.literal(BLUEPRINT_LAYOUT_SCHEMA_VERSION),
  sessionId: z.string().regex(SESSION_ID_RE),
  updatedAt: isoDate,
  /** Diagram id (`blueprintDiagramId`) -> its layout. */
  diagrams: z.record(z.string().min(1), BlueprintDiagramLayoutSchema),
})
export type BlueprintLayout = z.infer<typeof BlueprintLayoutSchema>

/** `GET /sessions/:id/blueprint/layout`; null when nothing was arranged yet. */
export const BlueprintLayoutResponseSchema = z.object({ layout: BlueprintLayoutSchema.nullable() })
export type BlueprintLayoutResponse = z.infer<typeof BlueprintLayoutResponseSchema>

/** `PUT /sessions/:id/blueprint/layout`: replaces ONE diagram's layout (merge by diagram); `layout: null` forgets it (Tidy up). */
export const PutBlueprintLayoutRequestSchema = z.object({
  diagram: z.string().min(1).max(2000),
  layout: BlueprintDiagramLayoutSchema.nullable(),
})
export type PutBlueprintLayoutRequest = z.infer<typeof PutBlueprintLayoutRequestSchema>

export const PutBlueprintLayoutResponseSchema = z.object({ updatedAt: isoDate })
export type PutBlueprintLayoutResponse = z.infer<typeof PutBlueprintLayoutResponseSchema>

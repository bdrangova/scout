import { z } from 'zod'
import { SESSION_ID_RE } from '../constants.ts'

const isoDate = z.iso.datetime({ offset: true })

/** The ways the agent can group a change's files for the Blueprint page (folders need no agent and are not listed here). */
export const BlueprintGroupingTypeSchema = z.enum(['feature', 'layer', 'priority'])
export type BlueprintGroupingType = z.infer<typeof BlueprintGroupingTypeSchema>
export const BLUEPRINT_GROUPING_TYPES = BlueprintGroupingTypeSchema.options

/** A group's id: a short slug, unique among its siblings. */
export const BLUEPRINT_GROUP_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/
/** Sub-groups may nest this deep below a top-level group (top level = 1). */
export const BLUEPRINT_GROUP_MAX_DEPTH = 3

/** The fixed top-level groups of the `priority` grouping, in order; the agent sub-groups inside them. */
export const BLUEPRINT_PRIORITY_GROUPS = [
  { id: 'read-carefully', name: 'Read carefully' },
  { id: 'repeated-pattern', name: 'Repeated pattern' },
  { id: 'mechanical', name: 'Mechanical or generated' },
] as const

export interface BlueprintGroup {
  id: string
  /** Shown on the box. */
  name: string
  /** One line: what this group is for, in plain words. */
  purpose: string
  /** Repo paths directly in this group (not in a sub-group). */
  files: string[]
  /** Sub-groups, when the agent judged the group too big to read as one. */
  groups?: BlueprintGroup[]
}

export const BlueprintGroupSchema: z.ZodType<BlueprintGroup> = z.lazy(() =>
  z.object({
    id: z.string().regex(BLUEPRINT_GROUP_ID_RE),
    name: z.string().min(1).max(60),
    purpose: z.string().max(200),
    files: z.array(z.string().min(1)),
    groups: z.array(BlueprintGroupSchema).optional(),
  }),
)

/** One grouping of the change: ordered top-level groups. A changed file not named in any group is "ungrouped". */
export const BlueprintGroupingSchema = z.object({
  createdAt: isoDate,
  groups: z.array(BlueprintGroupSchema).min(1),
})
export type BlueprintGrouping = z.infer<typeof BlueprintGroupingSchema>

export const BLUEPRINT_GROUPS_SCHEMA_VERSION = 1

/** `<session>/review/groups.json`, agent-owned, written only by `scout groups set`. */
export const BlueprintGroupsSchema = z.object({
  schemaVersion: z.literal(BLUEPRINT_GROUPS_SCHEMA_VERSION),
  sessionId: z.string().regex(SESSION_ID_RE),
  updatedAt: isoDate,
  groupings: z.partialRecord(BlueprintGroupingTypeSchema, BlueprintGroupingSchema),
})
export type BlueprintGroups = z.infer<typeof BlueprintGroupsSchema>

/** `GET /sessions/:id/blueprint/groups`; null when the agent grouped nothing yet, and for a test run or PR review. */
export const BlueprintGroupsResponseSchema = z.object({ groups: BlueprintGroupsSchema.nullable() })
export type BlueprintGroupsResponse = z.infer<typeof BlueprintGroupsResponseSchema>

/** What `scout groups set <type> --from <file>` reads: the groups alone. */
export const BlueprintGroupsInputSchema = z.object({ groups: z.array(BlueprintGroupSchema).min(1) })
export type BlueprintGroupsInput = z.infer<typeof BlueprintGroupsInputSchema>

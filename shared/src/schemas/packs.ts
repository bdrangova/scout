import { z } from 'zod'

/**
 * A pack: a folder outside Scout that adds one company's or one repository's own skills and setup (its worktree flow,
 * its test-data rules, its per-checkout ports). Scout works without any; a registered pack that matches a repository
 * fills in what Scout would otherwise default or guess. `<pack>/scout-pack.json`.
 */
export const PACK_MANIFEST_FILE = 'scout-pack.json'

/** The jobs a pack's skill can take over from Scout's defaults; the generic skills look these up in `ai-review env`. */
export const PackSkillRoleSchema = z.enum(['worktree', 'testData'])
export type PackSkillRole = z.infer<typeof PackSkillRoleSchema>

export const PackHelpEntrySchema = z.object({
  /** Help panel group, e.g. `Worktrees`; an unknown group gets its own section. */
  group: z.string().min(1),
  command: z.string().min(1),
  when: z.string().min(1),
})
export type PackHelpEntry = z.infer<typeof PackHelpEntrySchema>

export const PackManifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, 'lowercase letters, digits, dots, dashes and underscores'),
  description: z.string().optional(),
  /** Origin repository names (`git@host:org/<name>.git`) the pack applies to; matched case-insensitively. */
  repos: z.array(z.string().min(1)).min(1),
  /** Folder inside the pack that mirrors paths inside the repository; `ai-review install` copies it there. */
  files: z.string().min(1).optional(),
  /** Shell command that prints a checkout's runtime JSON; run from the checkout with `SCOUT_PACK_DIR` set. A runtime command stored for the repo wins. */
  runtime: z.string().min(1).optional(),
  /** Skill name per job, e.g. `{ "worktree": "qbd-worktree" }`. */
  skills: z.partialRecord(PackSkillRoleSchema, z.string().min(1)).optional(),
  /** Shell command run from the repository after every `ai-review install`, with `SCOUT_PACK_DIR` set. */
  afterInstall: z.string().min(1).optional(),
  /** Extra entries for the dashboard's Skills help. */
  help: z.array(PackHelpEntrySchema).optional(),
})
export type PackManifest = z.infer<typeof PackManifestSchema>

/** A registered pack as read from disk: its folder, and either its manifest or why it could not be read. */
export type LoadedPack = { dir: string; manifest: PackManifest; error: null } | { dir: string; manifest: null; error: string }

/** `GET /packs`: the registered packs, for the help panel. */
export const PacksResponseSchema = z.object({
  packs: z.array(
    z.object({
      dir: z.string(),
      name: z.string().nullable(),
      repos: z.array(z.string()),
      help: z.array(PackHelpEntrySchema),
      error: z.string().nullable(),
    }),
  ),
})
export type PacksResponse = z.infer<typeof PacksResponseSchema>

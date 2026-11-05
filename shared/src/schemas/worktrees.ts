import { z } from 'zod'
import { SessionListItemSchema } from './api.ts'
import { GithubSettingsSchema } from './github.ts'
import { PrSummarySchema } from './pr-comments.ts'

const nonNegativeInt = z.number().int().nonnegative()

/** Scout's own settings, `<home>/config.json` (`CONFIG_FILE`). A missing file reads as the defaults. */
export const SettingsSchema = z.object({
  /** Absolute folders scanned for git worktrees (`~` is expanded by the server on save). */
  worktreeFolders: z.array(z.string().min(1)).default([]),
  /** Followed repos and reviewing teams for the PR reviews' Assigned PRs tab. */
  github: GithubSettingsSchema.default({ repos: [], teams: [] }),
})
export type Settings = z.infer<typeof SettingsSchema>

/** `PUT /settings` body: the whole settings object. */
export const PutSettingsRequestSchema = SettingsSchema
export type PutSettingsRequest = z.infer<typeof PutSettingsRequestSchema>

/** `POST /settings/pick-folder`: opens the native folder chooser on the machine running Scout (macOS only, 501 elsewhere); `path` is null when cancelled. */
export const PickFolderResponseSchema = z.object({ path: z.string().min(1).nullable() })
export type PickFolderResponse = z.infer<typeof PickFolderResponseSchema>

/** Live, non-archived Scout sessions whose working directory is the worktree, counted per kind. */
export const WorktreeSessionCountsSchema = z.object({
  'code-review': nonNegativeInt,
  'pr-review': nonNegativeInt,
  'test-run': nonNegativeInt,
})
export type WorktreeSessionCounts = z.infer<typeof WorktreeSessionCountsSchema>

/**
 * One linked git worktree found directly inside a configured folder (a child directory whose `.git` is a
 * file), or listed by `git worktree list` of a configured folder that is itself a main checkout.
 * Main checkouts are never listed. Computed live, never stored.
 */
export const WorktreeSummarySchema = z.object({
  /** First 12 hex chars of sha256(path); stable while the path is. */
  id: z.string().regex(/^[0-9a-f]{12}$/),
  /** Absolute path of the worktree (posix separators). */
  path: z.string().min(1),
  /** Last segment of `path`. */
  name: z.string().min(1),
  /** The configured folder it was found through. */
  folder: z.string().min(1),
  /** Absolute path of the main checkout (from the shared git dir); null when it can't be resolved. */
  mainRepo: z.string().nullable(),
  /** Checked-out branch; null on a detached HEAD. */
  branch: z.string().nullable(),
  /** First Jira-style key in the branch name (`qi-15472-foo` → `QI-15472`), upper-cased; null when none. */
  ticket: z.string().nullable(),
  /** Resolved base ref (same order as sessions: origin/master → master → origin/main → main → origin/HEAD); null when none resolves. */
  baseRef: z.string().nullable(),
  /** Commits on HEAD not on the base, and on the base not on HEAD; null without a base. */
  ahead: nonNegativeInt.nullable(),
  behind: nonNegativeInt.nullable(),
  /** Working tree vs the merge base (committed + uncommitted, untracked files counted as added); zeros without a base. */
  stats: z.object({ files: nonNegativeInt, additions: nonNegativeInt, deletions: nonNegativeInt }),
  /** Uncommitted entries of `git status --porcelain` (staged, unstaged and untracked). Delete is refused while > 0. */
  uncommitted: nonNegativeInt,
  /** The PR of the newest linked session that knows one; null when none does. */
  pr: PrSummarySchema.nullable(),
  sessions: WorktreeSessionCountsSchema,
})
export type WorktreeSummary = z.infer<typeof WorktreeSummarySchema>

/** `GET /worktrees`. Items sorted by name. A folder that is missing or unreadable is reported, not fatal. */
export const WorktreeListResponseSchema = z.object({
  folders: z.array(z.string()),
  items: z.array(WorktreeSummarySchema),
  errors: z.array(z.object({ folder: z.string(), error: z.string() })),
})
export type WorktreeListResponse = z.infer<typeof WorktreeListResponseSchema>

/** `GET /worktrees/:id`: the summary plus its live linked sessions (same items as `GET /sessions`, newest first). */
export const WorktreeDetailSchema = WorktreeSummarySchema.extend({
  linkedSessions: z.array(SessionListItemSchema),
})
export type WorktreeDetail = z.infer<typeof WorktreeDetailSchema>

/**
 * `DELETE /worktrees/:id` refusals (409, `ApiError.reason`): `dirty` while `uncommitted > 0`, `sessions` while
 * live linked sessions exist (archive them first). Success is 204; the branch is kept (plain `git worktree remove`, never `--force`).
 */
export const WORKTREE_DELETE_REFUSALS = ['dirty', 'sessions'] as const
export type WorktreeDeleteRefusal = (typeof WORKTREE_DELETE_REFUSALS)[number]

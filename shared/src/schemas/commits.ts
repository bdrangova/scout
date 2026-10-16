import { z } from 'zod'
import { FINGERPRINT_RE } from '../constants.ts'

const isoDate = z.iso.datetime({ offset: true })
const nonNegativeInt = z.number().int().nonnegative()
const sha = z.string().regex(/^[0-9a-f]{40,64}$/)

/** The diff scopes besides the full diff: the uncommitted changes, or one commit's own changes. */
export const UNCOMMITTED_SCOPE = 'uncommitted'
export const ScopeSchema = z.union([z.literal(UNCOMMITTED_SCOPE), sha])
export type Scope = z.infer<typeof ScopeSchema>

const ChangeStatsSchema = z.object({ files: nonNegativeInt, additions: nonNegativeInt, deletions: nonNegativeInt })
export type ChangeStats = z.infer<typeof ChangeStatsSchema>

/** One commit of `git log <baseSha>..HEAD`. Computed, never stored. */
export const CommitSchema = z.object({
  sha,
  /** `git rev-parse --short`, at least 7 chars. */
  shortSha: z.string().min(7).max(12),
  subject: z.string(),
  author: z.string(),
  authoredAt: isoDate,
  parents: z.array(sha),
  /** More than one parent; its diff is taken against the first parent. */
  merge: z.boolean(),
  /** Reachable from the remote branch ref (`CommitList.remote.ref`); false for every commit when there is none. */
  pushed: z.boolean(),
  stats: ChangeStatsSchema,
})
export type Commit = z.infer<typeof CommitSchema>

export const RemoteSchema = z.object({
  /** The upstream of the current branch, else `origin/<branch>` when that ref exists, else null. */
  ref: z.string().nullable(),
  /** Commits on HEAD that the remote ref does not have (`git rev-list <ref>..HEAD`); every commit since the base when `ref` is null. */
  ahead: nonNegativeInt,
  /** Commits on the remote ref that HEAD does not have; 0 when `ref` is null. */
  behind: nonNegativeInt,
})
export type Remote = z.infer<typeof RemoteSchema>

/** `GET /sessions/:id/commits`. */
export const CommitListSchema = z.object({
  baseRef: z.string().min(1),
  baseSha: sha,
  headSha: sha,
  branch: z.string().nullable(),
  remote: RemoteSchema,
  /** Oldest first (the order they were made), `<baseSha>..HEAD`. */
  commits: z.array(CommitSchema),
  /** Changes of the index and working tree against HEAD (untracked files included); null when the tree is clean. */
  uncommitted: ChangeStatsSchema.nullable(),
  /** sha1 over headSha, the remote ref's sha, every commit sha with its `pushed` flag and the uncommitted stats; 16 hex. */
  fingerprint: z.string().regex(FINGERPRINT_RE),
})
export type CommitList = z.infer<typeof CommitListSchema>

import { z } from 'zod'
import { FINGERPRINT_RE } from '../constants.ts'

const isoDate = z.iso.datetime({ offset: true })
const nonNegativeInt = z.number().int().nonnegative()
const sha = z.string().regex(/^[0-9a-f]{40,64}$/)

export const FileStatusSchema = z.enum(['added', 'modified', 'deleted', 'renamed', 'copied', 'typechange'])
export type FileStatus = z.infer<typeof FileStatusSchema>

/** One changed file of the live working tree against the merge-base. Computed, never stored. */
export const TreeFileSchema = z.object({
  path: z.string().min(1),
  oldPath: z.string().min(1).nullable(),
  status: FileStatusSchema,
  additions: nonNegativeInt,
  deletions: nonNegativeInt,
  binary: z.boolean(),
  sizeBefore: nonNegativeInt.nullable(),
  sizeAfter: nonNegativeInt.nullable(),
  /** Shown folded until the reviewer expands it (lockfiles, huge diffs, large files). */
  collapsed: z.boolean(),
  collapseReason: z.string().nullable(),
  /** Left out of the patch entirely; only its metadata is known. */
  omitted: z.boolean(),
  omitReason: z.string().nullable(),
  /** Exists on disk but is unknown to git (not ignored). */
  untracked: z.boolean(),
  /**
   * 16 hex chars derived from the change's content: sha1 of the per-file patch, or for binary and
   * omitted files sha1 over status, sizes and blob ids. Identical across recomputes when nothing changed.
   */
  fingerprint: z.string().regex(FINGERPRINT_RE),
})
export type TreeFile = z.infer<typeof TreeFileSchema>

export const TreeStatsSchema = z.object({
  files: nonNegativeInt,
  additions: nonNegativeInt,
  deletions: nonNegativeInt,
  added: nonNegativeInt,
  modified: nonNegativeInt,
  deleted: nonNegativeInt,
  renamed: nonNegativeInt,
  binary: nonNegativeInt,
  collapsed: nonNegativeInt,
  omitted: nonNegativeInt,
})
export type TreeStats = z.infer<typeof TreeStatsSchema>

export const WorkingTreeSchema = z.object({
  computedAt: isoDate,
  baseRef: z.string().min(1),
  /** `git merge-base <baseRef> HEAD` at compute time. */
  baseSha: sha,
  /**
   * True when `baseSha` is a tree id, not a commit: the base ref and HEAD have several merge bases (criss-cross
   * merges), so the diff is taken against the virtual merge base git itself would build for a merge.
   */
  baseVirtual: z.boolean(),
  headSha: sha,
  branch: z.string().nullable(),
  /** The index or working tree differs from HEAD, or untracked files exist. */
  dirty: z.boolean(),
  durationMs: nonNegativeInt,
  /** sha1 over baseSha, headSha and every file's path and fingerprint; what `tree.updated` carries. */
  fingerprint: z.string().regex(FINGERPRINT_RE),
  stats: TreeStatsSchema,
  /** Sorted by path. */
  files: z.array(TreeFileSchema),
})
export type WorkingTree = z.infer<typeof WorkingTreeSchema>

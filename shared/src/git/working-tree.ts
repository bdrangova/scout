// NODE ONLY (see run.ts). Computes the live working tree of a repo against the base resolved by
// `base.ts` (the merge base, or a virtual one): `git diff <base>` for tracked changes plus a `--no-index` patch per untracked
// file (honouring .gitignore), numstat, name-status, sizes, collapse/omit rules and fingerprints.
// The diff core (`computeDiffFiles`) is shared with `scope-tree.ts`, which points the after side
// at a commit instead of the files on disk.
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import type { FileStatus, TreeFile, TreeStats, WorkingTree } from '../schemas/tree.ts'
import { OMIT_MAX_BYTES } from '../constants.ts'
import { resolveBase } from './base.ts'
import { metadataFingerprint, patchFingerprint, treeFingerprint } from './fingerprint.ts'
import { parseNameStatusZ, parseNumstatZ, type NameStatusCode, type NameStatusEntry, type NumstatEntry } from './parse.ts'
import { blobInfo, currentBranch, hashFiles, headSha, isDirty, untrackedFiles } from './repo.ts'
import { COLLAPSE_REASON_OMITTED, decideFile, OMIT_REASON_TOO_LARGE } from './rules.ts'
import { git, gitText, type RunOptions } from './run.ts'
import { splitPatch } from './split-patch.ts'

export interface ComputeWorkingTreeOptions {
  /** Repository top level. */
  repo: string
  /** Ref name; the base is `resolveBase(repo, baseRef)` (the merge base, or a virtual one). */
  baseRef: string
  /** Overlay object directory for virtual merge bases (see `base.ts`). */
  overlayDir?: string
  signal?: AbortSignal
  /** Injectable clock for tests. */
  now?: () => Date
}

export interface WorkingTreeResult {
  tree: WorkingTree
  /** Per-file patch text keyed by `TreeFile.path`; absent for omitted files. */
  patches: Map<string, string>
}

const STATUS_BY_CODE: Readonly<Record<NameStatusCode, FileStatus>> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'typechange',
}

/** Flags shared by every diff so the output is stable whatever the user's git config says. */
export const DIFF_COMMON = [
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--ignore-submodules=all',
  '--src-prefix=a/',
  '--dst-prefix=b/',
]
const PATCH_FLAGS = ['--full-index', '--unified=3', '-M50%']

function repoAbs(repo: string, repoPath: string): string {
  return path.join(repo, ...repoPath.split('/'))
}

function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0)
}

/** Line count the way `git diff --numstat` counts an added file (a final partial line counts). */
function countLines(buffer: Buffer): number {
  if (buffer.length === 0) return 0
  let lines = 0
  for (const byte of buffer) if (byte === 10) lines += 1
  if (buffer[buffer.length - 1] !== 10) lines += 1
  return lines
}

function excludeSpecs(paths: readonly string[]): string[] {
  return ['--', '.', ...paths.map((p) => `:(exclude,literal)${p}`)]
}

export interface UntrackedFile {
  path: string
  size: number
  binary: boolean
  lines: number
  /** Larger than OMIT_MAX_BYTES: never read, never diffed. */
  tooLarge: boolean
}

/** Untracked, not ignored files with their size and line count (the stats `git diff` cannot give). */
export async function collectUntracked(repo: string, run: RunOptions): Promise<UntrackedFile[]> {
  const files: UntrackedFile[] = []
  for (const file of await untrackedFiles(repo, run)) {
    const info = await stat(repoAbs(repo, file)).catch(() => null)
    if (info === null || !info.isFile()) continue
    if (info.size > OMIT_MAX_BYTES) {
      files.push({ path: file, size: info.size, binary: false, lines: 0, tooLarge: true })
      continue
    }
    const content = await readFile(repoAbs(repo, file))
    const binary = looksBinary(content)
    files.push({ path: file, size: content.length, binary, lines: binary ? 0 : countLines(content), tooLarge: false })
  }
  return files
}

async function sizesOnDisk(repo: string, paths: readonly string[]): Promise<Map<string, number | null>> {
  const sizes = new Map<string, number | null>()
  for (const p of paths) {
    const info = await stat(repoAbs(repo, p)).catch(() => null)
    sizes.set(p, info === null ? null : info.size)
  }
  return sizes
}

function emptyStats(): TreeStats {
  return { files: 0, additions: 0, deletions: 0, added: 0, modified: 0, deleted: 0, renamed: 0, binary: 0, collapsed: 0, omitted: 0 }
}

function accumulate(stats: TreeStats, file: TreeFile): void {
  stats.files += 1
  stats.additions += file.additions
  stats.deletions += file.deletions
  if (file.status === 'added') stats.added += 1
  else if (file.status === 'modified' || file.status === 'typechange') stats.modified += 1
  else if (file.status === 'deleted') stats.deleted += 1
  else stats.renamed += 1
  if (file.binary) stats.binary += 1
  if (file.collapsed) stats.collapsed += 1
  if (file.omitted) stats.omitted += 1
}

/** Where the after side of a diff lives: the files on disk, or the blobs of a commit. */
export interface AfterSide {
  sizes(paths: readonly string[]): Promise<Map<string, number | null>>
  /** Blob ids, only asked for files whose fingerprint cannot come from a patch (binary or omitted). */
  blobIds(paths: readonly string[]): Promise<Map<string, string>>
}

function diskAfterSide(repo: string, run: RunOptions): AfterSide {
  return {
    sizes: (paths) => sizesOnDisk(repo, paths),
    blobIds: (paths) => hashFiles(repo, paths, run),
  }
}

export interface DiffInput {
  repo: string
  run: RunOptions
  /** Before-side revision (also the first `git diff` argument). */
  baseSha: string
  /** After-side revision, or null for the working tree. */
  afterSha: string | null
  /** Untracked files to add as additions (working tree only). */
  untracked: readonly UntrackedFile[]
  after: AfterSide
}

export interface DiffFiles {
  /** Sorted by path. */
  files: TreeFile[]
  patches: Map<string, string>
}

/**
 * The diff core: name-status, numstat, sizes on both sides, collapse/omit decisions, one patch
 * (omitted files excluded by pathspec) split per file, and fingerprints.
 */
export async function computeDiffFiles(input: DiffInput): Promise<DiffFiles> {
  const { repo, run, baseSha, untracked, after } = input
  const revs = input.afterSha === null ? [baseSha] : [baseSha, input.afterSha]

  const [statusText, numstatText] = await Promise.all([
    gitText(repo, ['diff', ...DIFF_COMMON, '-M50%', '--name-status', '-z', ...revs], run),
    gitText(repo, ['diff', ...DIFF_COMMON, '-M50%', '--numstat', '-z', ...revs], run),
  ])
  const statuses: NameStatusEntry[] = parseNameStatusZ(statusText)
  const numstat = new Map<string, NumstatEntry>(parseNumstatZ(numstatText).map((entry) => [entry.path, entry]))
  for (const file of untracked) {
    statuses.push({ code: 'A', score: null, path: file.path, oldPath: null })
    numstat.set(file.path, { path: file.path, oldPath: null, additions: file.lines, deletions: 0, binary: file.binary })
  }
  const untrackedByPath = new Map(untracked.map((file) => [file.path, file]))

  const [sizesAfter, before] = await Promise.all([
    after.sizes(statuses.filter((s) => s.code !== 'D').map((s) => s.path)),
    blobInfo(repo, baseSha, statuses.filter((s) => s.code !== 'A').map((s) => s.oldPath ?? s.path), run),
  ])

  // Decide collapse/omit first: omitted files are excluded from the patch by pathspec.
  type Decided = { entry: NameStatusEntry; status: FileStatus; counts: NumstatEntry | undefined; sizeBefore: number | null; sizeAfter: number | null; collapsed: boolean; collapseReason: string | null; omitted: boolean; omitReason: string | null }
  const decided: Decided[] = []
  const excludeFromDiff: string[] = []
  for (const entry of statuses) {
    const status = STATUS_BY_CODE[entry.code]
    const counts = numstat.get(entry.path)
    const sizeAfter = status === 'deleted' ? null : (sizesAfter.get(entry.path) ?? null)
    const sizeBefore = status === 'added' ? null : (before.get(entry.oldPath ?? entry.path)?.size ?? null)
    const tooLargeUntracked = untrackedByPath.get(entry.path)?.tooLarge === true
    const decision = tooLargeUntracked
      ? { collapsed: true, collapseReason: COLLAPSE_REASON_OMITTED, omitted: true, omitReason: OMIT_REASON_TOO_LARGE }
      : decideFile({
          path: entry.path,
          status,
          additions: counts?.additions ?? 0,
          deletions: counts?.deletions ?? 0,
          binary: counts?.binary ?? false,
          sizeBefore,
          sizeAfter,
        })
    if (decision.omitted) {
      excludeFromDiff.push(entry.path)
      if (entry.oldPath !== null) excludeFromDiff.push(entry.oldPath)
    }
    decided.push({ entry, status, counts, sizeBefore, sizeAfter, ...decision })
  }

  const excluded = new Set(excludeFromDiff)
  const parts: Buffer[] = [await git(repo, ['diff', ...DIFF_COMMON, ...PATCH_FLAGS, ...revs, ...excludeSpecs(excludeFromDiff)], run)]
  for (const file of untracked) {
    if (excluded.has(file.path)) continue
    parts.push(
      await git(repo, ['diff', ...DIFF_COMMON, '--full-index', '--unified=3', '--no-index', '--', '/dev/null', file.path], {
        ...run,
        okExitCodes: [1],
      }),
    )
  }
  const patches = splitPatch(Buffer.concat(parts).toString('utf8'))

  // Blob ids on the after side only for files whose fingerprint cannot come from a patch.
  const needsAfterBlob = decided.filter((d) => d.status !== 'deleted' && ((d.counts?.binary ?? false) || d.omitted)).map((d) => d.entry.path)
  const afterBlobs = await after.blobIds(needsAfterBlob)

  const files: TreeFile[] = decided.map((d) => {
    const binary = d.counts?.binary ?? false
    const patch = patches.get(d.entry.path)
    const fingerprint =
      !binary && !d.omitted && patch !== undefined
        ? patchFingerprint(patch)
        : metadataFingerprint({
            status: d.status,
            sizeBefore: d.sizeBefore,
            sizeAfter: d.sizeAfter,
            beforeBlob: d.status === 'added' ? null : (before.get(d.entry.oldPath ?? d.entry.path)?.id ?? null),
            afterBlob: d.status === 'deleted' ? null : (afterBlobs.get(d.entry.path) ?? null),
          })
    return {
      path: d.entry.path,
      oldPath: d.entry.oldPath,
      status: d.status,
      additions: d.omitted ? 0 : (d.counts?.additions ?? 0),
      deletions: d.omitted ? 0 : (d.counts?.deletions ?? 0),
      binary,
      sizeBefore: d.sizeBefore,
      sizeAfter: d.sizeAfter,
      collapsed: d.collapsed,
      collapseReason: d.collapseReason,
      omitted: d.omitted,
      omitReason: d.omitReason,
      untracked: untrackedByPath.has(d.entry.path),
      fingerprint,
    }
  })
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { files, patches }
}

/** The identity of a tree; `computeDiffFiles` supplies the files. */
export interface TreeHead {
  baseRef: string
  baseSha: string
  /** `baseSha` is a virtual merge base tree, not a commit (see `WorkingTree.baseVirtual`). */
  baseVirtual?: boolean
  headSha: string
  branch: string | null
  dirty: boolean
}

export function assembleTree(head: TreeHead, files: TreeFile[], computedAt: string, startedAt: number): WorkingTree {
  const stats = emptyStats()
  for (const file of files) accumulate(stats, file)
  return {
    computedAt,
    ...head,
    baseVirtual: head.baseVirtual ?? false,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    fingerprint: treeFingerprint(head.baseSha, head.headSha, files),
    stats,
    files,
  }
}

export async function computeWorkingTree(options: ComputeWorkingTreeOptions): Promise<WorkingTreeResult> {
  const { repo, baseRef } = options
  const run: RunOptions = options.signal ? { signal: options.signal } : {}
  const started = performance.now()
  const computedAt = (options.now ?? (() => new Date()))().toISOString()

  const [base, head, branch, dirty, untracked] = await Promise.all([
    resolveBase({ repo, baseRef, ...(options.overlayDir ? { overlayDir: options.overlayDir } : {}), ...run }),
    headSha(repo, run),
    currentBranch(repo, run),
    isDirty(repo, run),
    collectUntracked(repo, run),
  ])

  // A virtual base lives in the overlay object directory: every git call that reads it needs its env.
  const baseRun: RunOptions = base.env ? { ...run, env: base.env } : run
  const { files, patches } = await computeDiffFiles({ repo, run: baseRun, baseSha: base.sha, afterSha: null, untracked, after: diskAfterSide(repo, baseRun) })
  return { tree: assembleTree({ baseRef, baseSha: base.sha, baseVirtual: base.virtual, headSha: head, branch, dirty }, files, computedAt, started), patches }
}

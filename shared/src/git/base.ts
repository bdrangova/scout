// NODE ONLY (see run.ts). Resolves the commit (or tree) the working tree is diffed against.
//
// `git merge-base <baseRef> HEAD` is the answer when there is one merge base. With several
// (criss-cross merges: both branches merged master separately and HEAD also contains an older
// tip of the base branch) any single one is wrong: one makes the diff "everything since master",
// another hides the branch's own work. Git's recursive merge strategy folds the merge bases into a
// virtual ancestor; diffing HEAD against that tree yields exactly the branch's own changes, so the
// same is done here with `git merge-tree --write-tree`. Nothing is ever written into the user's
// repository: new objects go to an overlay object directory (`GIT_OBJECT_DIRECTORY`) that reads
// the repo's objects through `GIT_ALTERNATE_OBJECT_DIRECTORIES`; the returned `env` must be passed
// to every later git call that reads the virtual tree. Where the merge bases conflict, the hunks are
// joined with git's `union` merge driver (a throwaway attributes file in the overlay), so the virtual
// tree never carries conflict markers: a review must not show markers no human wrote.
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { GitError, gitText, type RunOptions } from './run.ts'

export interface ResolveBaseOptions {
  /** Repository top level. */
  repo: string
  baseRef: string
  /** Where virtual merge-base objects are written (default `overlayDirFor(os.tmpdir()/scout-objects, repo)`). */
  overlayDir?: string
  signal?: AbortSignal
}

export interface ResolvedBase {
  /** A commit sha, or a tree id when `virtual`. */
  sha: string
  virtual: boolean
  /** Environment for every git call that reads `sha`; null when `sha` is a commit of the repo. */
  env: NodeJS.ProcessEnv | null
  /** Why a virtual base could not be built and the first merge base was used instead; null otherwise. */
  reason: string | null
}

/** `<root>/<sha1 of the repo path>`: one overlay per repository. */
export function overlayDirFor(root: string, repo: string): string {
  return path.join(root, createHash('sha1').update(repo).digest('hex'))
}

/** Fixed identity and dates so the synthetic commits that wrap intermediate trees are deterministic. */
const SYNTHETIC_COMMIT_ENV: NodeJS.ProcessEnv = {
  GIT_AUTHOR_NAME: 'scout',
  GIT_AUTHOR_EMAIL: 'scout@localhost',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00+0000',
  GIT_COMMITTER_NAME: 'scout',
  GIT_COMMITTER_EMAIL: 'scout@localhost',
  GIT_COMMITTER_DATE: '2000-01-01T00:00:00+0000',
}

/** Folded trees per process, keyed by repo path and the sorted merge bases (the tree depends only on them). */
const folded = new Map<string, Promise<ResolvedBase>>()

async function mergeBases(repo: string, baseRef: string, run: RunOptions): Promise<string[]> {
  const out = await gitText(repo, ['merge-base', '--all', baseRef, 'HEAD'], run)
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .sort()
}

interface Overlay {
  env: NodeJS.ProcessEnv
  /** `* merge=union`, applied with `-c core.attributesFile` to every merge-tree call. */
  attributesFile: string
}

async function prepareOverlay(repo: string, overlayDir: string, run: RunOptions): Promise<Overlay> {
  const objects = path.resolve(repo, (await gitText(repo, ['rev-parse', '--git-path', 'objects'], run)).trim())
  await mkdir(overlayDir, { recursive: true })
  const attributesFile = path.join(overlayDir, 'attributes')
  await writeFile(attributesFile, '* merge=union\n')
  return { env: { ...process.env, GIT_OBJECT_DIRECTORY: overlayDir, GIT_ALTERNATE_OBJECT_DIRECTORIES: objects }, attributesFile }
}

/**
 * `git merge-tree --write-tree` with the `union` driver: the tree id is the first line; exit 1 means the bases
 * conflicted somewhere, which is fine: text conflicts come out as the union of both sides' lines (no markers),
 * and a conflicting binary path keeps the blob of the first argument (`a`: the fold so far, i.e. the first
 * sorted base) since the union driver only applies to text. Either way the tree is complete and valid.
 */
async function mergeTrees(repo: string, overlay: Overlay, a: string, b: string, run: RunOptions): Promise<string> {
  const args = ['-c', `core.attributesFile=${overlay.attributesFile}`, 'merge-tree', '--write-tree', '--no-messages', a, b]
  const out = await gitText(repo, args, { ...run, okExitCodes: [1] })
  const tree = out.split('\n')[0]?.trim() ?? ''
  if (!/^[0-9a-f]{40,64}$/.test(tree)) throw new Error(`merge-tree printed no tree id: ${JSON.stringify(out.slice(0, 80))}`)
  return tree
}

async function wrapInCommit(repo: string, tree: string, parents: readonly string[], run: RunOptions): Promise<string> {
  const args = ['commit-tree', tree, ...parents.flatMap((p) => ['-p', p]), '-m', 'Scout virtual merge base']
  return (await gitText(repo, args, { ...run, env: { ...run.env, ...SYNTHETIC_COMMIT_ENV } })).trim()
}

async function fold(repo: string, bases: readonly string[], overlayDir: string, signal: AbortSignal | undefined): Promise<ResolvedBase> {
  const run: RunOptions = signal ? { signal } : {}
  const fallback = (reason: string): ResolvedBase => ({ sha: bases[0] ?? '', virtual: false, env: null, reason })
  try {
    const overlay = await prepareOverlay(repo, overlayDir, run)
    const overlayRun: RunOptions = { ...run, env: overlay.env }
    let acc = bases[0] ?? ''
    let tree = acc
    for (const [index, next] of bases.slice(1).entries()) {
      tree = await mergeTrees(repo, overlay, acc, next, overlayRun)
      if (index < bases.length - 2) acc = await wrapInCommit(repo, tree, [acc, next], overlayRun)
    }
    return { sha: tree, virtual: true, env: overlay.env, reason: null }
  } catch (error) {
    if (signal?.aborted) throw error
    const detail = error instanceof GitError ? error.message : error instanceof Error ? error.message : String(error)
    return fallback(`virtual merge base not built, using ${bases[0]?.slice(0, 12) ?? '?'}: ${detail}`)
  }
}

/**
 * The base of the diff: `git merge-base --all <baseRef> HEAD`. One result is returned as is. Several are folded
 * into one virtual tree the way git's recursive merge strategy does (`merge-tree --write-tree`, intermediate
 * trees wrapped in synthetic commits for three or more bases, conflicts joined by the `union` driver so no
 * markers appear), written to the overlay object directory. If
 * the fold fails, the first merge base is used with `reason` set. The folded result is memoized per process.
 */
export async function resolveBase(options: ResolveBaseOptions): Promise<ResolvedBase> {
  const { repo, baseRef } = options
  const run: RunOptions = options.signal ? { signal: options.signal } : {}
  const bases = await mergeBases(repo, baseRef, run)
  const [single] = bases
  if (bases.length === 0 || single === undefined) throw new Error(`git merge-base ${baseRef} HEAD: no merge base`)
  if (bases.length === 1) return { sha: single, virtual: false, env: null, reason: null }

  const overlayDir = options.overlayDir ?? overlayDirFor(path.join(os.tmpdir(), 'scout-objects'), repo)
  const key = `${repo}\0${overlayDir}\0${bases.join(',')}`
  const hit = folded.get(key)
  if (hit) {
    const resolved = await hit
    // The overlay may have been cleaned up since; rebuild when the tree is gone.
    if (!resolved.virtual || (await treeExists(repo, resolved, run))) return resolved
    folded.delete(key)
  }
  const promise = fold(repo, bases, overlayDir, options.signal)
  folded.set(key, promise)
  try {
    return await promise
  } catch (error) {
    folded.delete(key)
    throw error
  }
}

async function treeExists(repo: string, resolved: ResolvedBase, run: RunOptions): Promise<boolean> {
  try {
    await gitText(repo, ['cat-file', '-e', `${resolved.sha}^{tree}`], { ...run, ...(resolved.env ? { env: resolved.env } : {}) })
    return true
  } catch {
    return false
  }
}

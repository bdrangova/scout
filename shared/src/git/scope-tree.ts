// NODE ONLY (see run.ts). A `WorkingTree` for one scope: the uncommitted changes (HEAD → working
// tree, untracked files included) or one commit's own changes (first parent → commit, read from
// blobs only; a root commit diffs against the empty tree).
import { performance } from 'node:perf_hooks'
import { UNCOMMITTED_SCOPE, type Scope } from '../schemas/commits.ts'
import { blobInfo, type BlobInfo } from './repo.ts'
import { gitText, gitTry, type RunOptions } from './run.ts'
import { assembleTree, computeDiffFiles, computeWorkingTree, type AfterSide, type WorkingTreeResult } from './working-tree.ts'

export interface ComputeScopeTreeOptions {
  /** Repository top level. */
  repo: string
  scope: Scope
  signal?: AbortSignal
  /** Injectable clock for tests. */
  now?: () => Date
}

/** Blob sizes and ids of one commit, fetched with as few `cat-file --batch-check` calls as possible. */
function commitAfterSide(repo: string, sha: string, run: RunOptions): AfterSide {
  const known = new Map<string, BlobInfo | null>()
  async function lookup(paths: readonly string[]): Promise<Map<string, BlobInfo | null>> {
    const missing = paths.filter((p) => !known.has(p))
    if (missing.length > 0) for (const [p, info] of await blobInfo(repo, sha, missing, run)) known.set(p, info)
    return new Map(paths.map((p) => [p, known.get(p) ?? null]))
  }
  return {
    sizes: async (paths) => new Map([...(await lookup(paths))].map(([p, info]) => [p, info?.size ?? null])),
    blobIds: async (paths) => {
      const ids = new Map<string, string>()
      for (const [p, info] of await lookup(paths)) if (info !== null) ids.set(p, info.id)
      return ids
    },
  }
}

/** The first parent of a commit, or the empty tree for a root commit. */
async function firstParent(repo: string, sha: string, run: RunOptions): Promise<string> {
  const parent = await gitTry(repo, ['rev-parse', '--verify', '-q', `${sha}^1^{commit}`], run)
  if (parent !== null && parent.trim() !== '') return parent.trim()
  return (await gitText(repo, ['hash-object', '-t', 'tree', '/dev/null'], run)).trim()
}

export async function computeScopeTree(options: ComputeScopeTreeOptions): Promise<WorkingTreeResult> {
  const { repo, scope } = options
  const run: RunOptions = options.signal ? { signal: options.signal } : {}
  if (scope === UNCOMMITTED_SCOPE) {
    return computeWorkingTree({ repo, baseRef: 'HEAD', ...(options.signal ? { signal: options.signal } : {}), ...(options.now ? { now: options.now } : {}) })
  }
  const started = performance.now()
  const computedAt = (options.now ?? (() => new Date()))().toISOString()
  const sha = (await gitText(repo, ['rev-parse', '--verify', `${scope}^{commit}`], run)).trim()
  const parent = await firstParent(repo, sha, run)
  const { files, patches } = await computeDiffFiles({ repo, run, baseSha: parent, afterSha: sha, untracked: [], after: commitAfterSide(repo, sha, run) })
  return {
    tree: assembleTree({ baseRef: `${sha}^1`, baseSha: parent, headSha: sha, branch: null, dirty: false }, files, computedAt, started),
    patches,
  }
}

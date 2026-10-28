import fs from 'node:fs/promises'
import type { CommitList } from '@scout/shared'
import { overlayDirFor } from '@scout/shared/git/base'
import { computeCommitList } from '@scout/shared/git/commits'
import { computeWorkingTree } from '@scout/shared/git/working-tree'
import type { WorkingTreeResult } from '@scout/shared/git/working-tree'
import { HttpError, errorMessage } from '../errors.ts'
import type { StoreEventBus } from '../events.ts'
import { isMissing } from './fs.ts'

/** Repo watcher bursts are coalesced into one recompute per this window. */
export const TREE_DEBOUNCE_MS = 300

/** What a tree is computed from: the manifest's repo path and base ref. */
export interface TreeSource {
  id: string
  repo: string
  baseRef: string
}

/** The full diff of a session plus its commit list, computed together and cached together. */
export interface SessionTree extends WorkingTreeResult {
  commits: CommitList
}

export interface ComputeInput {
  repo: string
  baseRef: string
  /** Overlay object directory for virtual merge bases (`base.ts`); absent in tests that inject the computes. */
  overlayDir?: string
  signal: AbortSignal
}

export type ComputeTree = (input: ComputeInput) => Promise<WorkingTreeResult>
export type ComputeCommits = (input: ComputeInput) => Promise<CommitList>

export interface TreeCacheOptions {
  bus: StoreEventBus
  /** Injectable for tests (default `computeWorkingTree`). */
  compute?: ComputeTree
  /**
   * Injectable for tests (default `computeCommitList`). A test that injects `compute` alone gets
   * a commit list with no commits, derived from the tree, so no git runs.
   */
  computeCommits?: ComputeCommits
  /** Root of the per-repo overlay object directories for virtual merge bases (`<home>/cache/objects`); default under `os.tmpdir()`. */
  overlayRoot?: string
  debounceMs?: number
  log?: (message: string) => void
}

interface Entry {
  id: string
  repo: string
  baseRef: string
  value: SessionTree | null
  inflight: Promise<SessionTree> | null
  abort: AbortController | null
  timer: NodeJS.Timeout | null
  /** An invalidation arrived that no finished compute has covered yet: `value` is known to be stale. */
  dirty: boolean
}

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err
  return new HttpError(422, `git failed: ${errorMessage(err)}`)
}

/** The commit list of a tree whose commits were not computed (injected tree computes in tests). */
function commitsOfTreeOnly({ tree }: WorkingTreeResult): CommitList {
  return {
    baseRef: tree.baseRef,
    baseSha: tree.baseSha,
    headSha: tree.headSha,
    branch: tree.branch,
    remote: { ref: null, ahead: 0, behind: 0 },
    commits: [],
    uncommitted: null,
    fingerprint: tree.fingerprint,
  }
}

/**
 * Per-session cache of `computeWorkingTree` and `computeCommitList`. The first request computes
 * and later ones are served from the cache; concurrent requests during a compute share one
 * promise. The repo watcher calls `invalidate`, which recomputes in the background after a 300 ms
 * debounce (aborting an older compute still in flight), logs the timing and emits `tree.updated`
 * only when the tree fingerprint or the commit list fingerprint changed (a push or fetch moves the
 * remote ref, which changes the latter). A read between an invalidation and the finished recompute never gets
 * the old tree: it starts the pending recompute at once (or joins the running one) and waits. Failures (missing repo, git errors) are never cached.
 */
export class TreeCache {
  private readonly entries = new Map<string, Entry>()
  private readonly bus: StoreEventBus
  private readonly compute: (input: ComputeInput) => Promise<SessionTree>
  private readonly overlayRoot: string | null
  private readonly debounceMs: number
  private readonly log: (message: string) => void

  constructor(options: TreeCacheOptions) {
    this.bus = options.bus
    this.compute = combinedCompute(options)
    this.overlayRoot = options.overlayRoot ?? null
    this.debounceMs = options.debounceMs ?? TREE_DEBOUNCE_MS
    this.log = options.log ?? ((message) => console.info(message))
    // The server only reads repos. Without this, `git status`/`git diff` opportunistically rewrite
    // `.git/index`, which the repo watcher would see as a change and recompute once more.
    process.env.GIT_OPTIONAL_LOCKS ??= '0'
  }

  /** The cached tree, patches and commits, computed on a miss (or when the repo/base ref changed). */
  get(source: TreeSource): Promise<SessionTree> {
    let entry = this.entries.get(source.id)
    if (entry && (entry.repo !== source.repo || entry.baseRef !== source.baseRef)) {
      this.drop(source.id)
      entry = undefined
    }
    if (!entry) {
      entry = { ...source, value: null, inflight: null, abort: null, timer: null, dirty: false }
      this.entries.set(source.id, entry)
    }
    if (entry.value && !entry.dirty) return Promise.resolve(entry.value)
    if (entry.timer) {
      // The repo changed and the debounced recompute has not started: run it now instead of serving the old tree.
      clearTimeout(entry.timer)
      entry.timer = null
      return this.start(entry, 'watch')
    }
    if (entry.inflight) return entry.inflight
    return this.start(entry, 'request')
  }

  /** The cached value without computing, or null. */
  peek(id: string): SessionTree | null {
    return this.entries.get(id)?.value ?? null
  }

  /** Schedules a background recompute (debounced); a no-op for sessions never requested. */
  invalidate(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    entry.dirty = true
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = null
      this.start(entry, 'watch').catch((err: unknown) => this.log(`tree ${id}: recompute failed: ${errorMessage(err)}`))
    }, this.debounceMs)
  }

  drop(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    if (entry.timer) clearTimeout(entry.timer)
    entry.abort?.abort()
    this.entries.delete(id)
  }

  close(): void {
    for (const id of [...this.entries.keys()]) this.drop(id)
  }

  private start(entry: Entry, origin: 'request' | 'watch'): Promise<SessionTree> {
    entry.abort?.abort()
    const controller = new AbortController()
    entry.abort = controller
    const promise: Promise<SessionTree> = this.run(entry, controller, origin, () => promise)
    entry.inflight = promise
    return promise
  }

  private async run(entry: Entry, controller: AbortController, origin: 'request' | 'watch', self: () => Promise<SessionTree>): Promise<SessionTree> {
    try {
      await ensureRepo(entry.repo)
      const overlayDir = this.overlayRoot ? overlayDirFor(this.overlayRoot, entry.repo) : null
      const result = await this.compute({ repo: entry.repo, baseRef: entry.baseRef, ...(overlayDir ? { overlayDir } : {}), signal: controller.signal })
      if (controller.signal.aborted) {
        // Superseded by a newer compute (or dropped): hand the caller the newer result.
        return entry.inflight && entry.inflight !== self() ? entry.inflight : result
      }
      const previous = entry.value
      entry.value = result
      // An invalidation that came in while this compute ran is still waiting on its timer.
      entry.dirty = entry.timer !== null
      entry.inflight = null
      entry.abort = null
      this.log(`tree ${entry.id}: ${result.tree.stats.files} files in ${result.tree.durationMs} ms`)
      const changed = previous?.tree.fingerprint !== result.tree.fingerprint || previous.commits.fingerprint !== result.commits.fingerprint
      if (origin === 'watch' && changed) {
        this.bus.emit({ type: 'tree.updated', sessionId: entry.id, fingerprint: result.tree.fingerprint, durationMs: result.tree.durationMs })
      }
      return result
    } catch (err) {
      if (controller.signal.aborted && entry.inflight && entry.inflight !== self()) return entry.inflight
      if (entry.inflight === self()) {
        entry.inflight = null
        entry.abort = null
      }
      throw toHttpError(err)
    }
  }
}

/** Tree and commits in parallel; see `TreeCacheOptions.computeCommits` for the test fallback. */
function combinedCompute(options: TreeCacheOptions): (input: ComputeInput) => Promise<SessionTree> {
  const computeTree: ComputeTree = options.compute ?? ((input) => computeWorkingTree(input))
  const computeCommits: ComputeCommits | null = options.computeCommits ?? (options.compute ? null : (input) => computeCommitList(input))
  return async (input) => {
    const [result, commits] = await Promise.all([computeTree(input), computeCommits ? computeCommits(input) : null])
    return { ...result, commits: commits ?? commitsOfTreeOnly(result) }
  }
}

async function ensureRepo(repo: string): Promise<void> {
  try {
    if ((await fs.stat(repo)).isDirectory()) return
  } catch (err) {
    if (!isMissing(err)) throw err
  }
  throw new HttpError(422, `repo-missing: ${repo}`)
}

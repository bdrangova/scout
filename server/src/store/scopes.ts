import type { Scope } from '@review-dash/shared'
import { UNCOMMITTED_SCOPE } from '@review-dash/shared'
import { computeScopeTree } from '@review-dash/shared/git/scope-tree'
import type { WorkingTreeResult } from '@review-dash/shared/git/working-tree'

/** Commit scopes kept per server; a commit's diff never changes, so the oldest entry is simply evicted. */
export const COMMIT_SCOPE_CACHE_SIZE = 24

export type ComputeScope = (input: { repo: string; scope: Scope }) => Promise<WorkingTreeResult>

export interface ScopeCacheOptions {
  /** Injectable for tests (default `computeScopeTree`). */
  compute?: ComputeScope
  maxCommits?: number
}

/**
 * Scoped diffs. Commit scopes live in a small LRU keyed by repo path and sha (immutable once
 * computed). The `uncommitted` scope of a session is cached until `invalidate` (called with the
 * tree cache on every repo change) and recomputed lazily on the next request. Failures are never cached.
 */
export class ScopeCache {
  private readonly commits = new Map<string, Promise<WorkingTreeResult>>()
  private readonly uncommitted = new Map<string, { repo: string; promise: Promise<WorkingTreeResult> }>()
  private readonly compute: ComputeScope
  private readonly maxCommits: number

  constructor(options: ScopeCacheOptions = {}) {
    this.compute = options.compute ?? ((input) => computeScopeTree(input))
    this.maxCommits = options.maxCommits ?? COMMIT_SCOPE_CACHE_SIZE
  }

  get(sessionId: string, repo: string, scope: Scope): Promise<WorkingTreeResult> {
    return scope === UNCOMMITTED_SCOPE ? this.uncommittedOf(sessionId, repo) : this.commitOf(repo, scope)
  }

  /** Drops the session's `uncommitted` scope so the next request recomputes it. */
  invalidate(sessionId: string): void {
    this.uncommitted.delete(sessionId)
  }

  /** Number of commit scopes held (for tests). */
  get commitCount(): number {
    return this.commits.size
  }

  private commitOf(repo: string, sha: string): Promise<WorkingTreeResult> {
    const key = `${repo}\0${sha}`
    const cached = this.commits.get(key)
    if (cached) {
      // Re-insert to mark it most recently used.
      this.commits.delete(key)
      this.commits.set(key, cached)
      return cached
    }
    const promise = this.compute({ repo, scope: sha }).catch((err: unknown) => {
      if (this.commits.get(key) === promise) this.commits.delete(key)
      throw err
    })
    this.commits.set(key, promise)
    while (this.commits.size > this.maxCommits) {
      const oldest = this.commits.keys().next().value
      if (oldest === undefined) break
      this.commits.delete(oldest)
    }
    return promise
  }

  private uncommittedOf(sessionId: string, repo: string): Promise<WorkingTreeResult> {
    const cached = this.uncommitted.get(sessionId)
    if (cached && cached.repo === repo) return cached.promise
    const promise = this.compute({ repo, scope: UNCOMMITTED_SCOPE }).catch((err: unknown) => {
      if (this.uncommitted.get(sessionId)?.promise === promise) this.uncommitted.delete(sessionId)
      throw err
    })
    this.uncommitted.set(sessionId, { repo, promise })
    return promise
  }
}

import fs from 'node:fs'
import path from 'node:path'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { RUN_ID_RE, SESSION_ID_RE, SESSION_PR_DESCRIPTION_FILE, isTestRun } from '@review-dash/shared'
import type { StoreEvent } from '@review-dash/shared'
import { errorMessage } from './errors.ts'
import type { StoreEventBus } from './events.ts'
import { RepoWatcher } from './repo-watcher.ts'
import { RunWatcher } from './run-watcher.ts'
import type { Store } from './store/index.ts'

export interface WatcherOptions {
  /** `awaitWriteFinish.stabilityThreshold` for the session store (default 200 ms). */
  stabilityThreshold?: number
  pollInterval?: number
  /** Debounce for `session.updated` after artifact writes (default 300 ms). */
  debounceMs?: number
  /** Debounce for `testrun.updated` after run-folder writes (default 200 ms). */
  runDebounceMs?: number
  log?: (message: string) => void
}

export const SESSION_DEBOUNCE_MS = 300

const ARTIFACT_FOLDERS: ReadonlySet<string> = new Set(['evidence', 'extras', 'spec'])

type Target =
  | { kind: 'manifest'; sessionId: string }
  | { kind: 'review'; sessionId: string }
  | { kind: 'resolutions'; sessionId: string }
  | { kind: 'journal'; sessionId: string }
  | { kind: 'pr-comments'; sessionId: string; file: 'pr-comments.json' | 'pr-resolutions.json' | 'pr-replies.json' }
  | { kind: 'run'; sessionId: string; runId: string }
  | { kind: 'artifact'; sessionId: string }

/**
 * Watches `<home>/sessions` with chokidar and every session's repo with a `RepoWatcher`, turning
 * file events into `StoreEvent`s and tree-cache invalidations. Session folder: `manifest.json`
 * (session.added/updated/removed, and the repo watch follows the manifest), `review/review.json`,
 * `review/resolutions.json`, `review/journal.json` (`journal.updated` + `session.updated`), `review/pr-comments.json` and `review/pr-resolutions.json` and `review/pr-replies.json` (`pr-comments.updated`, plus `session.updated` for the first: the session's PR changed), `review/runs/*.json` (own writes are not reported), and the
 * artifacts (`evidence/`, `extras/`, `spec/`, `pr-description.md` → one debounced `session.updated`).
 */
export class StoreWatcher {
  private watcher: FSWatcher | null = null
  private readyPromise: Promise<void> = Promise.resolve()
  private readonly repos: RepoWatcher
  private readonly runs: RunWatcher
  private readonly sessionTimers = new Map<string, NodeJS.Timeout>()
  /** Sessions reported removed and not yet back: a manifest event for one of them is a `session.added`. */
  private readonly removedIds = new Set<string>()
  private readonly log: (message: string) => void

  constructor(
    private readonly store: Store,
    private readonly bus: StoreEventBus,
    private readonly options: WatcherOptions = {},
  ) {
    this.log = options.log ?? ((message) => console.warn(message))
    this.repos = new RepoWatcher((sessionId) => this.store.invalidateTree(sessionId), this.log)
    this.runs = new RunWatcher({
      bus,
      invalidate: (sessionId) => {
        this.store.invalidateRun(sessionId)
        // The index may have moved a root: follow it.
        void this.syncRun(sessionId)
      },
      log: this.log,
      ...(options.stabilityThreshold !== undefined ? { stabilityThreshold: options.stabilityThreshold } : {}),
      ...(options.pollInterval !== undefined ? { pollInterval: options.pollInterval } : {}),
      ...(options.runDebounceMs !== undefined ? { debounceMs: options.runDebounceMs } : {}),
    })
  }

  get active(): boolean {
    return this.watcher !== null
  }

  /** Resolves once the store scan finished and every session's repo is watched. */
  get ready(): Promise<void> {
    return this.readyPromise
  }

  /** The repos currently watched, by session id. */
  get watchedRepos(): ReadonlyMap<string, string> {
    return this.repos.active
  }

  /** Idempotent. */
  start(): void {
    if (this.watcher !== null) return
    const root = this.store.paths.sessionsDir
    fs.mkdirSync(root, { recursive: true })
    const watcher = chokidar.watch(root, {
      ignoreInitial: true,
      depth: 8,
      awaitWriteFinish: {
        stabilityThreshold: this.options.stabilityThreshold ?? 200,
        pollInterval: this.options.pollInterval ?? 50,
      },
      ignored: (file) => this.ignored(root, file),
    })
    watcher.on('add', (file) => void this.handle('add', root, file))
    watcher.on('change', (file) => void this.handle('change', root, file))
    watcher.on('unlink', (file) => void this.handle('unlink', root, file))
    watcher.on('unlinkDir', (dir) => this.handleDir(root, dir))
    watcher.on('error', (err) => this.log(`store watcher error: ${errorMessage(err)}`))
    const scanned = new Promise<void>((resolve) => watcher.once('ready', () => resolve()))
    this.watcher = watcher
    this.readyPromise = Promise.all([scanned, this.syncRepos()]).then(() => undefined)
  }

  async close(): Promise<void> {
    for (const timer of this.sessionTimers.values()) clearTimeout(timer)
    this.sessionTimers.clear()
    this.repos.close()
    await this.runs.close()
    const watcher = this.watcher
    this.watcher = null
    if (watcher) await watcher.close()
  }

  /** The run folders currently watched (test runs), by session id. */
  get watchedRuns(): ReadonlyMap<string, readonly string[]> {
    return this.runs.active
  }

  /** Starts a repo watch (code review) or a run watch (test run) for every session whose manifest reads. */
  private async syncRepos(): Promise<void> {
    for (const id of await this.store.sessionIds()) await this.syncRepo(id)
  }

  private async syncRepo(sessionId: string): Promise<void> {
    try {
      const result = await this.store.readManifest(sessionId)
      if (!result.ok) {
        this.repos.unwatch(sessionId)
        this.runs.unwatch(sessionId)
      } else if (isTestRun(result.manifest)) {
        this.repos.unwatch(sessionId)
        await this.runs.watch(sessionId, await this.store.runWatchPaths(result.manifest))
      } else {
        this.runs.unwatch(sessionId)
        this.repos.watch(sessionId, result.manifest.repo.path)
      }
    } catch (err) {
      this.log(`could not read manifest of ${sessionId}: ${errorMessage(err)}`)
    }
  }

  /** Re-resolves the roots of a test run after its index changed. */
  private async syncRun(sessionId: string): Promise<void> {
    if (!this.runs.active.has(sessionId)) return
    await this.syncRepo(sessionId)
  }

  /** Prunes the traversal to the folders and files that matter. */
  private ignored(root: string, file: string): boolean {
    const rel = path.relative(root, file)
    if (rel === '' || rel.startsWith('..')) return false
    const parts = rel.split(path.sep)
    const [, second = '', third = '', fourth = ''] = parts
    if (parts.length === 1) return false
    if (parts.some((part) => part.startsWith('.'))) return true
    if (ARTIFACT_FOLDERS.has(second)) return false
    if (parts.length === 2) return second !== 'manifest.json' && second !== 'pr-review.json' && second !== SESSION_PR_DESCRIPTION_FILE && second !== 'review'
    if (second !== 'review') return true
    if (parts.length === 3) return third !== 'review.json' && third !== 'resolutions.json' && third !== 'pr-comments.json' && third !== 'pr-resolutions.json' && third !== 'pr-replies.json' && third !== 'journal.json' && third !== 'runs'
    if (parts.length === 4) return third !== 'runs' || !fourth.endsWith('.json')
    return true
  }

  private classify(root: string, file: string): Target | null {
    const parts = path.relative(root, file).split(path.sep)
    const [sessionId, second, third, fourth] = parts
    if (!sessionId || !SESSION_ID_RE.test(sessionId) || second === undefined) return null
    if (parts.length === 2 && second === 'manifest.json') return { kind: 'manifest', sessionId }
    if (parts.length === 2 && (second === SESSION_PR_DESCRIPTION_FILE || second === 'pr-review.json')) return { kind: 'artifact', sessionId }
    if (ARTIFACT_FOLDERS.has(second)) return { kind: 'artifact', sessionId }
    if (second !== 'review') return null
    if (parts.length === 3 && third === 'review.json') return { kind: 'review', sessionId }
    if (parts.length === 3 && third === 'resolutions.json') return { kind: 'resolutions', sessionId }
    if (parts.length === 3 && third === 'journal.json') return { kind: 'journal', sessionId }
    if (parts.length === 3 && (third === 'pr-comments.json' || third === 'pr-resolutions.json' || third === 'pr-replies.json')) return { kind: 'pr-comments', sessionId, file: third }
    if (parts.length === 4 && third === 'runs' && fourth?.endsWith('.json')) {
      const runId = fourth.slice(0, -'.json'.length)
      return RUN_ID_RE.test(runId) ? { kind: 'run', sessionId, runId } : null
    }
    return null
  }

  private handleDir(root: string, dir: string): void {
    const parts = path.relative(root, dir).split(path.sep)
    const [sessionId, second] = parts
    if (!sessionId || !SESSION_ID_RE.test(sessionId)) return
    if (parts.length === 1) {
      this.removed(sessionId)
      return
    }
    if (second !== undefined && ARTIFACT_FOLDERS.has(second)) this.sessionUpdated(sessionId)
  }

  /** Reported once per disappearance (a folder move yields both `unlinkDir` and the manifest's `unlink`). */
  private removed(sessionId: string): void {
    const timer = this.sessionTimers.get(sessionId)
    if (timer) clearTimeout(timer)
    this.sessionTimers.delete(sessionId)
    this.repos.unwatch(sessionId)
    this.runs.unwatch(sessionId)
    this.store.dropTree(sessionId)
    if (this.removedIds.has(sessionId)) return
    this.removedIds.add(sessionId)
    this.bus.emit({ type: 'session.removed', sessionId })
  }

  private sessionUpdated(sessionId: string): void {
    const existing = this.sessionTimers.get(sessionId)
    if (existing) clearTimeout(existing)
    this.sessionTimers.set(
      sessionId,
      setTimeout(() => {
        this.sessionTimers.delete(sessionId)
        this.bus.emit({ type: 'session.updated', sessionId })
      }, this.options.debounceMs ?? SESSION_DEBOUNCE_MS),
    )
  }

  private async handle(change: 'add' | 'change' | 'unlink', root: string, file: string): Promise<void> {
    const target = this.classify(root, file)
    if (!target) return
    const { sessionId } = target
    if (target.kind === 'manifest') {
      if (change === 'unlink') {
        this.removed(sessionId)
        return
      }
      await this.syncRepo(sessionId)
      this.store.invalidateTree(sessionId)
      this.store.invalidateRun(sessionId)
      // A folder moved back quickly (unarchive) can surface as a `change` of a manifest chokidar
      // had not yet reported unlinked: it is still a session coming back.
      const wasRemoved = this.removedIds.delete(sessionId)
      const added = change === 'add' || wasRemoved
      const type: StoreEvent['type'] = added ? 'session.added' : 'session.updated'
      this.bus.emit({ type, sessionId })
      return
    }
    if (target.kind === 'artifact') {
      this.sessionUpdated(sessionId)
      return
    }
    if (target.kind === 'pr-comments') {
      // The PR identity (tab, list row) comes from pr-comments.json; a removal also changes it.
      this.bus.emit({ type: 'pr-comments.updated', sessionId })
      if (target.file === 'pr-comments.json') this.bus.emit({ type: 'session.updated', sessionId })
      return
    }
    if (target.kind === 'journal') {
      // The nav badge (journalCount) comes from journal.json; a removal changes it too. The dashboard never writes the file.
      this.bus.emit({ type: 'journal.updated', sessionId })
      this.bus.emit({ type: 'session.updated', sessionId })
      return
    }
    if (change === 'unlink') return
    if (await this.store.isOwnWrite(file)) return
    if (target.kind === 'review') this.bus.emit({ type: 'review.updated', sessionId })
    else if (target.kind === 'resolutions') this.bus.emit({ type: 'resolutions.updated', sessionId })
    else this.bus.emit({ type: 'run.updated', sessionId, runId: target.runId })
  }
}

import path from 'node:path'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { errorMessage } from './errors.ts'
import type { StoreEventBus } from './events.ts'

export const RUN_DEBOUNCE_MS = 200

export interface RunWatcherOptions {
  bus: StoreEventBus
  /** Drops the cached derived detail of the session. */
  invalidate: (sessionId: string) => void
  log?: (message: string) => void
  /** `awaitWriteFinish.stabilityThreshold` (default 200 ms). */
  stabilityThreshold?: number
  pollInterval?: number
  /** Collapses a burst of writes into one `testrun.updated` (default 200 ms). */
  debounceMs?: number
}

const IGNORED_SEGMENTS: ReadonlySet<string> = new Set(['node_modules', '.git'])

/** Raw screenshots are big, written in bursts and never part of a fingerprint's trigger: `screenshots/raw/**` is skipped. */
export function runPathMatters(file: string): boolean {
  const segments = file.split(path.sep)
  if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) return false
  for (let i = 0; i + 1 < segments.length; i += 1) {
    if (segments[i] === 'screenshots' && segments[i + 1] === 'raw') return false
  }
  return segments[segments.length - 1] !== '.DS_Store'
}

/** Keeps the paths that no other path contains: a watch on the parent already covers the child. */
export function outermostPaths(paths: readonly string[]): string[] {
  const unique = [...new Set(paths.map((p) => path.resolve(p)))]
  return unique.filter((p) => !unique.some((other) => other !== p && p.startsWith(other + path.sep)))
}

interface Entry {
  key: string
  watcher: FSWatcher
}

/**
 * One chokidar watch per test run over the run folder and the resolved roots (plan, bugs, ...). A change drops the cached
 * derived detail and emits `testrun.updated { sessionId }`, debounced per session.
 */
export class RunWatcher {
  private readonly entries = new Map<string, Entry>()
  private readonly timers = new Map<string, NodeJS.Timeout>()
  private readonly log: (message: string) => void

  constructor(private readonly options: RunWatcherOptions) {
    this.log = options.log ?? ((message) => console.warn(message))
  }

  /** The watched paths by session id. */
  get active(): ReadonlyMap<string, readonly string[]> {
    return new Map([...this.entries].map(([id, entry]) => [id, entry.key.split('\n')]))
  }

  /** Starts (or replaces, when the paths changed) the watch of a session; resolves once the initial scan is done. */
  async watch(sessionId: string, paths: readonly string[]): Promise<void> {
    const roots = outermostPaths(paths)
    const key = roots.join('\n')
    if (this.entries.get(sessionId)?.key === key) return
    this.unwatch(sessionId)
    const watcher = chokidar.watch(roots, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: this.options.stabilityThreshold ?? 200,
        pollInterval: this.options.pollInterval ?? 50,
      },
      ignored: (file) => !runPathMatters(file),
    })
    const changed = (): void => this.changed(sessionId)
    watcher.on('add', changed).on('change', changed).on('unlink', changed).on('addDir', changed).on('unlinkDir', changed)
    watcher.on('error', (err) => this.log(`run watcher for ${sessionId} failed: ${errorMessage(err)}`))
    this.entries.set(sessionId, { key, watcher })
    await new Promise<void>((resolve) => watcher.once('ready', () => resolve()))
  }

  unwatch(sessionId: string): void {
    const timer = this.timers.get(sessionId)
    if (timer) clearTimeout(timer)
    this.timers.delete(sessionId)
    const entry = this.entries.get(sessionId)
    if (!entry) return
    this.entries.delete(sessionId)
    void entry.watcher.close()
  }

  async close(): Promise<void> {
    const open = [...this.entries.values()]
    for (const id of [...this.entries.keys()]) this.unwatch(id)
    await Promise.all(open.map((entry) => entry.watcher.close()))
  }

  private changed(sessionId: string): void {
    this.options.invalidate(sessionId)
    const existing = this.timers.get(sessionId)
    if (existing) clearTimeout(existing)
    this.timers.set(
      sessionId,
      setTimeout(() => {
        this.timers.delete(sessionId)
        this.options.bus.emit({ type: 'testrun.updated', sessionId })
      }, this.options.debounceMs ?? RUN_DEBOUNCE_MS),
    )
  }
}

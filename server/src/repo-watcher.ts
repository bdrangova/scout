import fs from 'node:fs'
import type { FSWatcher } from 'node:fs'
import path from 'node:path'
import { errorMessage } from './errors.ts'

/** Folders whose contents never change the diff and are expensive to walk. */
const IGNORED_SEGMENTS: ReadonlySet<string> = new Set(['node_modules', 'dist', 'build', 'coverage', '.cache'])
/** The parts of `.git/` whose changes mean a commit, checkout, rebase or staging happened. */
const GIT_FILES: ReadonlySet<string> = new Set(['HEAD', 'index', 'ORIG_HEAD', 'packed-refs'])

/**
 * Whether a repo-relative posix path may affect the working tree. Everything under `.git/` is
 * ignored except `HEAD`, `index`, `ORIG_HEAD`, `packed-refs` and `refs/**`; `node_modules`,
 * `dist`, `build`, `coverage`, `.cache` and `.DS_Store` are ignored anywhere.
 */
export function repoPathMatters(rel: string): boolean {
  if (rel === '') return true
  const segments = rel.split('/')
  const [first = ''] = segments
  if (first === '.git') {
    const inner = segments.slice(1).join('/')
    return GIT_FILES.has(inner) || inner.startsWith('refs/')
  }
  if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) return false
  return segments[segments.length - 1] !== '.DS_Store'
}

/**
 * One recursive `fs.watch` per session repo (FSEvents/ReadDirectoryChangesW/inotify through
 * Node: a single handle, no per-file stats or descriptors, which matters on a 10,000-file repo).
 * Events are filtered with `repoPathMatters` and reported per session; the tree cache debounces.
 */
export class RepoWatcher {
  private readonly watchers = new Map<string, { repo: string; watcher: FSWatcher }>()

  constructor(
    private readonly onChange: (sessionId: string, rel: string | null) => void,
    private readonly log: (message: string) => void = (message) => console.warn(message),
  ) {}

  /** The repos currently watched, by session id. */
  get active(): ReadonlyMap<string, string> {
    return new Map([...this.watchers].map(([id, { repo }]) => [id, repo]))
  }

  /** Starts (or replaces, when the path changed) the watch for a session. */
  watch(sessionId: string, repo: string): void {
    const existing = this.watchers.get(sessionId)
    if (existing?.repo === repo) return
    this.unwatch(sessionId)
    let watcher: FSWatcher
    try {
      watcher = fs.watch(repo, { recursive: true, persistent: true }, (_eventType, filename) => {
        const rel = filename === null ? null : filename.toString().split(path.sep).join('/')
        if (rel !== null && !repoPathMatters(rel)) return
        this.onChange(sessionId, rel)
      })
    } catch (err) {
      this.log(`repo watcher for ${sessionId} could not start on ${repo}: ${errorMessage(err)}`)
      return
    }
    watcher.on('error', (err) => {
      this.log(`repo watcher for ${sessionId} (${repo}) failed: ${errorMessage(err)}`)
      this.unwatch(sessionId)
    })
    this.watchers.set(sessionId, { repo, watcher })
  }

  unwatch(sessionId: string): void {
    const existing = this.watchers.get(sessionId)
    if (!existing) return
    this.watchers.delete(sessionId)
    existing.watcher.close()
  }

  close(): void {
    for (const id of [...this.watchers.keys()]) this.unwatch(id)
  }
}

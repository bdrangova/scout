import path from 'node:path'
import { ARCHIVE_DIR, SESSIONS_DIR, SESSION_ID_RE } from '@review-dash/shared'
import { notFound } from '../errors.ts'

export interface StorePaths {
  /** Absolute store root (`AI_REVIEW_HOME`). */
  readonly home: string
  /** `<home>/sessions` */
  readonly sessionsDir: string
  /** `<home>/archive` */
  readonly archiveDir: string
  /** `<home>/sessions/<id>`; throws a 404 `HttpError` when `id` fails `SESSION_ID_RE`. */
  sessionDir(id: string): string
  /** `<home>/archive/<id>`; throws a 404 `HttpError` when `id` fails `SESSION_ID_RE`. */
  archivedSessionDir(id: string): string
}

function checkId(id: string): string {
  if (!SESSION_ID_RE.test(id)) throw notFound(`invalid session id ${JSON.stringify(id)}`)
  return id
}

export function storePaths(config: { home: string }): StorePaths {
  const home = path.resolve(config.home)
  const sessionsDir = path.join(home, SESSIONS_DIR)
  const archiveDir = path.join(home, ARCHIVE_DIR)
  return {
    home,
    sessionsDir,
    archiveDir,
    sessionDir: (id) => path.join(sessionsDir, checkId(id)),
    archivedSessionDir: (id) => path.join(archiveDir, checkId(id)),
  }
}

function rejectPath(relative: string): never {
  throw notFound(`path ${JSON.stringify(relative)} is not inside the session folder`)
}

/**
 * Resolves `relative` under `root` and returns the absolute path. Throws a 404 `HttpError` for
 * anything that could escape `root`: empty paths, absolute paths (POSIX or Windows), `..`
 * segments, null bytes, or a resolved path outside `root`.
 */
export function safeJoin(root: string, relative: string): string {
  if (relative.length === 0 || relative.includes('\0')) rejectPath(relative)
  if (path.isAbsolute(relative) || /^[\\/]/.test(relative) || /^[a-zA-Z]:/.test(relative)) rejectPath(relative)
  if (relative.split(/[\\/]+/).some((segment) => segment === '..')) rejectPath(relative)
  const base = path.resolve(root)
  const resolved = path.resolve(base, relative)
  if (resolved === base || !resolved.startsWith(base + path.sep)) rejectPath(relative)
  return resolved
}

/** URL helpers for the API's `*path` routes and the web's `/s/:id/files/*path` route. */
import type { Scope } from '@review-dash/shared'

/** Encode a relative path segment by segment so `/` survives and everything else is escaped. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** `src/a/b.ts` → `{ dir: 'src/a/', name: 'b.ts' }` (the directory keeps its trailing slash). */
export function splitPath(path: string): { dir: string; name: string } {
  const slash = path.lastIndexOf('/')
  if (slash === -1) return { dir: '', name: path }
  return { dir: path.slice(0, slash + 1), name: path.slice(slash + 1) }
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])

export function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return false
  return IMAGE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase())
}

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])

export function isMarkdownPath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return false
  return MARKDOWN_EXTENSIONS.has(path.slice(dot + 1).toLowerCase())
}

function sessionApiPath(sessionId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}`
}

/** `GET /sessions/:id/commits`: the commits since the base, the remote and the uncommitted stats. */
export function commitsPath(sessionId: string): string {
  return `${sessionApiPath(sessionId)}/commits`
}

/** `GET /sessions/:id/pr-comments`: the GitHub PR comments with their status (`PrCommentsResponse`). */
export function prCommentsPath(sessionId: string): string {
  return `${sessionApiPath(sessionId)}/pr-comments`
}

/** `PUT /sessions/:id/pr-replies/:commentId`: saves the user's instruction or reply text for a PR comment thread (`PutPrReplyRequest`). */
export function prReplyPath(sessionId: string, commentId: string): string {
  return `${sessionApiPath(sessionId)}/pr-replies/${encodeURIComponent(commentId)}`
}

/** `GET /sessions/:id/scopes/:scope`: the `WorkingTree` of one commit or of the uncommitted changes. */
export function scopeTreePath(sessionId: string, scope: Scope): string {
  return `${sessionApiPath(sessionId)}/scopes/${encodeURIComponent(scope)}`
}

/** The `files` route prefix of the full diff, or of a scope's own patches. */
function filesApiPath(sessionId: string, scope: Scope | null): string {
  return scope === null ? `${sessionApiPath(sessionId)}/files` : `${scopeTreePath(sessionId, scope)}/files`
}

/**
 * API path (relative to `/api`) of a file's live patch: `GET /sessions/:id/files/*path/patch[?force=1]`,
 * or the scope's `GET /sessions/:id/scopes/:scope/files/*path/patch`.
 */
export function filePatchPath(sessionId: string, path: string, force = false, scope: Scope | null = null): string {
  return `${filesApiPath(sessionId, scope)}/${encodePath(path)}/patch${force ? '?force=1' : ''}`
}

export type DiffSide = 'before' | 'after'

/**
 * API path (relative to `/api`) of a file's contents on one side: `GET /sessions/:id/files/*path/contents?side=`
 * (or the scope's `/scopes/:scope/files/*path/contents`).
 */
export function fileContentsPath(sessionId: string, path: string, side: DiffSide, scope: Scope | null = null): string {
  return `${filesApiPath(sessionId, scope)}/${encodePath(path)}/contents?side=${side}`
}

/** Absolute URL of a file's contents on one side of the diff, usable as an `<img src>`. */
export function fileContentsUrl(sessionId: string, path: string, side: DiffSide, scope: Scope | null = null): string {
  return `/api${fileContentsPath(sessionId, path, side, scope)}`
}

export type ArtifactKind = 'evidence' | 'extras' | 'spec'

/** API path (relative to `/api`) of an artifact file: `GET /sessions/:id/<evidence|extras|spec>/*path`. */
export function artifactPath(sessionId: string, kind: ArtifactKind, path: string): string {
  return `${sessionApiPath(sessionId)}/${kind}/${encodePath(path)}`
}

/** Absolute URL of an evidence file (`<img src>`, `<video src>`). */
export function evidenceUrl(sessionId: string, path: string): string {
  return `/api${artifactPath(sessionId, 'evidence', path)}`
}

/** Web route of a file inside a session. */
export function fileRoute(sessionId: string, path: string): string {
  return `/s/${encodeURIComponent(sessionId)}/files/${encodePath(path)}`
}

/** Web route of an evidence item inside a session. */
export function evidenceRoute(sessionId: string, path: string): string {
  return `/s/${encodeURIComponent(sessionId)}/evidence/${encodePath(path)}`
}

/** The session's index route: it redirects to the step the review should open on (`lib/landing-section.ts`). */
export function sessionIndexRoute(sessionId: string): string {
  return `/s/${encodeURIComponent(sessionId)}`
}

/** The Files page, the base of the file routes. */
export function sessionRoute(sessionId: string): string {
  return `/s/${encodeURIComponent(sessionId)}/files`
}

/** Last path segment of the repo path (`/Users/x/Projects/qbdvision` → `qbdvision`). */
export function repoName(repoPath: string): string {
  const trimmed = repoPath.replace(/\/+$/, '')
  const slash = trimmed.lastIndexOf('/')
  return slash === -1 ? trimmed : trimmed.slice(slash + 1)
}

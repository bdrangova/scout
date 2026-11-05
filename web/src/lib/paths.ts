/** URL helpers for the API's `*path` routes and the web's `/s/:id/files/*path` route. */
import type { Scope } from '@scout/shared'

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

/** `GET /sessions/:id/journal`: Scout's journal (`JournalResponse`). */
export function journalPath(sessionId: string): string {
  return `${sessionApiPath(sessionId)}/journal`
}

/** `PUT /sessions/:id/pr-replies/:commentId`: saves the user's instruction or reply text for a PR comment thread (`PutPrReplyRequest`). */
export function prReplyPath(sessionId: string, commentId: string): string {
  return `${sessionApiPath(sessionId)}/pr-replies/${encodeURIComponent(commentId)}`
}

/** `PUT /sessions/:id/pr-resolved/:commentId`: marks a PR comment thread handled in Scout, or reopens it. */
export function prResolvedPath(sessionId: string, commentId: string): string {
  return `${sessionApiPath(sessionId)}/pr-resolved/${encodeURIComponent(commentId)}`
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

/** Content search: the changed files' patches, or every file of the repository. */
export function searchPath(sessionId: string, query: string, scope: 'diff' | 'repo'): string {
  return `${sessionApiPath(sessionId)}/search?q=${encodeURIComponent(query)}${scope === 'repo' ? '&scope=repo' : ''}`
}

/** Any file of the session's repository as text (for search hits outside the diff). */
export function repoFilePath(sessionId: string, path: string): string {
  return `${sessionApiPath(sessionId)}/repo-files/${encodePath(path)}`
}

/** Web route of an evidence item inside a session. */
export function evidenceRoute(sessionId: string, path: string): string {
  return `/s/${encodeURIComponent(sessionId)}/evidence/${encodePath(path)}`
}

export type SessionKind = 'code-review' | 'test-run' | 'pr-review'

/** The route prefix of a session kind: `/s` for code reviews, `/t` for test runs. */
export function basePathOf(kind: SessionKind): '/s' | '/t' {
  return kind === 'test-run' ? '/t' : '/s'
}

/** The session's own route (`/s/:id` or `/t/:id`), optionally on one section; the bare route redirects to the step the review should open on (`lib/landing-section.ts`). */
export function sessionRoute(kind: SessionKind, sessionId: string, section?: string): string {
  const base = `${basePathOf(kind)}/${encodeURIComponent(sessionId)}`
  return section === undefined ? base : `${base}/${section}`
}

/** Route inside a test run: `/t/:id/<section>[/<sub>]` (`sub` is encoded, e.g. a scenario id on `review`). */
export function testRunRoute(sessionId: string, section: string, sub?: string): string {
  const base = sessionRoute('test-run', sessionId, section)
  return sub === undefined ? base : `${base}/${encodePath(sub)}`
}

/** The code review's index route: it redirects to the step the review should open on (`lib/landing-section.ts`). */
export function sessionIndexRoute(sessionId: string): string {
  return sessionRoute('code-review', sessionId)
}

/** The Files page, the base of the file routes. */
export function sessionFilesRoute(sessionId: string): string {
  return sessionRoute('code-review', sessionId, 'files')
}

/**
 * URL of a file of a test run's folder, from an index ref `alias:rel/path`: `/api/sessions/:id/run/file/<alias>/<rel/path>`
 * (usable as `<img src>` / `<video src>`). A value without `alias:` is returned as one path under the `run` alias.
 */
export function runFileUrl(sessionId: string, ref: string): string {
  return `/api${sessionApiPath(sessionId)}/run/file/${runRefPath(ref)}`
}

/** URL of a slice of a run log: `/api/sessions/:id/run/log/<alias>/<path>?from=&to=` (1-based, inclusive lines). */
export function runLogUrl(sessionId: string, ref: string, from?: number, to?: number): string {
  const query = new URLSearchParams()
  if (from !== undefined) query.set('from', String(from))
  if (to !== undefined) query.set('to', String(to))
  const search = query.size > 0 ? `?${query.toString()}` : ''
  return `/api${sessionApiPath(sessionId)}/run/log/${runRefPath(ref)}${search}`
}

/** `alias:rel/path` → `alias/rel/path`, each segment escaped. */
function runRefPath(ref: string): string {
  const colon = ref.indexOf(':')
  const alias = colon === -1 ? 'run' : ref.slice(0, colon)
  const path = colon === -1 ? ref : ref.slice(colon + 1)
  return `${encodeURIComponent(alias)}/${encodePath(path)}`
}

/** Last path segment of the repo path (`/Users/x/Projects/qbdvision` → `qbdvision`). */
export function repoName(repoPath: string): string {
  const trimmed = repoPath.replace(/\/+$/, '')
  const slash = trimmed.lastIndexOf('/')
  return slash === -1 ? trimmed : trimmed.slice(slash + 1)
}

/** The list of a session kind: `/d` for code reviews (Development), `/t` for test runs, `/pr` for PR reviews. */
export function sessionListRoute(kind: SessionKind): string {
  return kind === 'pr-review' ? '/pr' : kind === 'test-run' ? '/t' : '/d'
}

/** A top-level list: the worktrees or one of the session kinds. */
export type ListKind = SessionKind | 'worktrees'

/** The next list in the `T` cycle: Worktrees, Development, Test runs, PR reviews, then back. */
export function otherKindRoute(kind: ListKind): string {
  return kind === 'worktrees' ? '/d' : kind === 'code-review' ? '/t' : kind === 'test-run' ? '/pr' : '/'
}

/** The worktrees list route, the app's home (`/w` redirects here). */
export const WORKTREES_ROUTE = '/'

/** A worktree's own route (`/w/:id`). */
export function worktreeRoute(id: string): string {
  return `/w/${encodeURIComponent(id)}`
}

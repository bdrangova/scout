import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { RUN_ID_RE, SESSION_ID_RE, SESSION_PR_DESCRIPTION_FILE, emptyReview, mergeComments, mimeFromPath, progress, sessionStatus } from '@review-dash/shared'
import type {
  AgentRun,
  ArchivedSession,
  CommitList,
  FileContentsSide,
  Manifest,
  PutReviewConflict,
  PutReviewRequest,
  Resolutions,
  Review,
  ReviewResponse,
  Scope,
  SentSnapshot,
  SessionDetail,
  SessionListItem,
  SessionSummary,
  TreeFile,
  WorkingTree,
} from '@review-dash/shared'
import { overlayDirFor, resolveBase } from '@review-dash/shared/git/base'
import { showFile } from '@review-dash/shared/git/repo'
import type { RunOptions } from '@review-dash/shared/git/run'
import type { WorkingTreeResult } from '@review-dash/shared/git/working-tree'
import { HttpError, badRequest, errorMessage, invalidStoreFile, notFound } from '../errors.ts'
import { StoreEventBus } from '../events.ts'
import { archiveEntryKind, archivedSession, isDir, moveDir, readArchivedAt, removeArchivedDir, removeArchivedMarker, writeArchivedMarker } from './archive.ts'
import { ARTIFACT_DIRS, artifactPaths, deriveArtifacts } from './artifacts.ts'
import type { ArtifactKind, SessionArtifacts } from './artifacts.ts'
import { isFile, isMissing, readTextIfExists, writeFileAtomic } from './fs.ts'
import { KeyedLock } from './lock.ts'
import { ManifestReader } from './manifest.ts'
import type { ManifestResult } from './manifest.ts'
import { safeJoin, storePaths } from './paths.ts'
import type { StorePaths } from './paths.ts'
import { REVIEW_FILE, activeRunId, listRuns, readResolutions, readReview, readRun, runFile, runLogFile, sentFiles } from './review.ts'
import { ScopeCache } from './scopes.ts'
import type { ScopeCacheOptions } from './scopes.ts'
import { TreeCache } from './tree.ts'
import type { SessionTree, TreeCacheOptions } from './tree.ts'

export { safeJoin, storePaths } from './paths.ts'
export { activeRunId, listRuns, readResolutions, readReview, readRun, runFile, runLogFile, writeReview } from './review.ts'

export interface LoadedSession {
  id: string
  /** Absolute session folder. */
  dir: string
  manifest: Manifest
}

export interface ReviewState {
  review: Review | null
  resolutions: Resolutions | null
  activeRunId: string | null
}

export type PutReviewResult = { ok: true; updatedAt: string } | { ok: false; conflict: PutReviewConflict }

export type ReviewMutation = (current: Review | null, resolutions: Resolutions | null) => Review | Promise<Review>

/** A file to answer with `res.sendFile(relative, { root })`. */
export interface ServedFile {
  root: string
  relative: string
  contentType: string | null
}

/** One side of a changed file, read into memory (binary-safe). */
export interface FileContents {
  body: Buffer
  contentType: string
}

export interface StoreOptions {
  bus?: StoreEventBus
  trees?: Omit<TreeCacheOptions, 'bus'>
  scopes?: ScopeCacheOptions
  log?: (message: string) => void
}

function timeOf(iso: string | undefined): number {
  if (iso === undefined) return Number.NEGATIVE_INFINITY
  const t = Date.parse(iso)
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
}

/** The latest of the manifest, the review, the resolutions and the tree computation. */
export function latestUpdatedAt(manifest: Manifest, state: ReviewState, tree: WorkingTree): string {
  const candidates = [manifest.updatedAt, state.review?.updatedAt, state.resolutions?.updatedAt, tree.computedAt]
  let best = manifest.updatedAt
  for (const candidate of candidates) {
    if (candidate !== undefined && timeOf(candidate) > timeOf(best)) best = candidate
  }
  return best
}

export function sessionSummary(manifest: Manifest, state: ReviewState, tree: WorkingTree): SessionSummary {
  const openComments = state.review === null ? 0 : mergeComments(state.review, state.resolutions).filter((c) => c.status === 'open').length
  return {
    id: manifest.id,
    title: manifest.title,
    repo: { path: manifest.repo.path, branch: tree.branch ?? manifest.repo.branch, baseRef: manifest.repo.baseRef },
    tickets: manifest.tickets,
    status: sessionStatus({ review: state.review, tree, resolutions: state.resolutions, activeRun: state.activeRunId !== null }),
    progress: progress(state.review, tree, state.resolutions),
    openComments,
    stats: { files: tree.stats.files, additions: tree.stats.additions, deletions: tree.stats.deletions },
    updatedAt: latestUpdatedAt(manifest, state, tree),
    activeRunId: state.activeRunId,
  }
}

/** Newest first: `updatedAt` for valid sessions, the timestamp in the folder name otherwise. */
function listSortKey(item: SessionListItem): number {
  if ('updatedAt' in item) {
    const t = Date.parse(item.updatedAt)
    if (!Number.isNaN(t)) return t
  }
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(item.id)
  if (!m) return Number.NEGATIVE_INFINITY
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
}

/** A timestamp strictly after `previous` (same-millisecond saves must still differ). */
function nextUpdatedAt(previous: string | null): string {
  let t = Date.now()
  if (previous !== null) {
    const p = Date.parse(previous)
    if (!Number.isNaN(p) && t <= p) t = p + 1
  }
  return new Date(t).toISOString()
}

/** Every per-file patch of the tree, in tree order (omitted files have none). */
export function concatPatches(tree: WorkingTree, patches: ReadonlyMap<string, string>): string {
  let text = ''
  for (const file of tree.files) {
    const patch = patches.get(file.path)
    if (patch !== undefined) text += patch
  }
  return text
}

function isMedia(mime: string | null): mime is string {
  return mime !== null && (mime.startsWith('image/') || mime.startsWith('video/'))
}

/**
 * The file as it is on disk. A symlink answers its link target, as `git show` does, and is never
 * followed: a tracked link must not read files outside the repo. The leaf is opened with
 * `O_NOFOLLOW`, so it cannot be swapped for a link between the check and the read; links in the
 * directories are refused up front (swapping those needs write access to the repo, which already reads anything).
 */
async function readWorkingFile(repo: string, relative: string): Promise<Buffer> {
  const absolute = safeJoin(repo, relative)
  const [root, parent] = await Promise.all([fs.realpath(repo), fs.realpath(path.dirname(absolute))])
  if (parent !== root && !parent.startsWith(root + path.sep)) throw notFound(`${JSON.stringify(relative)} is not inside the repository`)
  let handle: Awaited<ReturnType<typeof fs.open>>
  try {
    handle = await fs.open(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ELOOP') return Buffer.from(await fs.readlink(absolute))
    throw err
  }
  try {
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}

/** Images and videos keep their type; other text is plain, other binary is an octet stream. */
export function contentsType(file: TreeFile): string {
  const mime = mimeFromPath(file.path)
  if (isMedia(mime)) return mime
  return file.binary ? 'application/octet-stream' : 'text/plain; charset=utf-8'
}

/**
 * The `AI_REVIEW_HOME` store: manifests and review files on disk, plus the live working tree of
 * each session's repo (`TreeCache`) and the artifacts derived from the session folder.
 */
export class Store {
  readonly paths: StorePaths
  readonly bus: StoreEventBus
  readonly trees: TreeCache
  readonly scopes: ScopeCache
  /** `<home>/cache/objects`: where virtual merge-base objects go (never the user's repo). */
  private readonly overlayRoot: string
  private readonly manifests = new ManifestReader()
  private readonly reviewLock = new KeyedLock()
  private readonly log: (message: string) => void
  /** Artifact index warnings already logged, so a broken `index.json` is reported once, not on every request. */
  private readonly loggedOnce = new Set<string>()
  /** mtime of the last file this process wrote, so the watcher can tell our writes from external ones. */
  private readonly ownWrites = new Map<string, number>()

  constructor(home: string, options: StoreOptions = {}) {
    this.paths = storePaths({ home })
    this.overlayRoot = path.join(this.paths.home, 'cache', 'objects')
    this.bus = options.bus ?? new StoreEventBus()
    this.log = options.log ?? ((message) => console.info(message))
    this.trees = new TreeCache({ bus: this.bus, log: this.log, overlayRoot: this.overlayRoot, ...options.trees })
    this.scopes = new ScopeCache(options.scopes)
  }

  /** The repo changed: recompute the tree (debounced) and forget the `uncommitted` scope. */
  invalidateTree(id: string): void {
    this.trees.invalidate(id)
    this.scopes.invalidate(id)
  }

  dropTree(id: string): void {
    this.trees.drop(id)
    this.scopes.invalidate(id)
  }

  /** Folder names under `sessions/` that look like session ids (unsorted). */
  async sessionIds(): Promise<string[]> {
    return (await this.sessionFolders()).filter((id) => SESSION_ID_RE.test(id))
  }

  private async sessionFolders(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.paths.sessionsDir, { withFileTypes: true })
      return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
    } catch (err) {
      if (isMissing(err)) return []
      throw err
    }
  }

  /** The validated manifest of a session folder, or why it could not be read. */
  readManifest(id: string): Promise<ManifestResult> {
    return this.manifests.read(path.join(this.paths.sessionsDir, id), id)
  }

  /** Every folder under `sessions/`, newest first; broken folders and unreadable repos appear as `{ id, error }`. */
  async listSessions(): Promise<SessionListItem[]> {
    const items = await Promise.all((await this.sessionFolders()).map((id) => this.listItem(id)))
    return items.sort((a, b) => listSortKey(b) - listSortKey(a) || b.id.localeCompare(a.id))
  }

  private async listItem(id: string): Promise<SessionListItem> {
    if (!SESSION_ID_RE.test(id)) return { id, error: 'folder name is not a valid session id' }
    const result = await this.readManifest(id)
    if (!result.ok) return { id, error: result.error }
    const session: LoadedSession = { id, dir: path.join(this.paths.sessionsDir, id), manifest: result.manifest }
    try {
      const [state, { tree }] = await Promise.all([this.reviewState(session), this.tree(session)])
      return sessionSummary(result.manifest, state, tree)
    } catch (err) {
      return { id, error: errorMessage(err) }
    }
  }

  /** 404 when the folder or manifest is missing (or the id is malformed), 422 when the manifest is invalid. */
  async loadSession(id: string): Promise<LoadedSession> {
    const dir = this.paths.sessionDir(id)
    const result = await this.manifests.read(dir, id)
    if (!result.ok) {
      if (result.missing) throw notFound(`session ${id} not found`)
      throw invalidStoreFile(`session ${id}: ${result.error}`)
    }
    return { id, dir, manifest: result.manifest }
  }

  /** `review.json`, `resolutions.json` and the active run, read together. */
  async reviewState(session: LoadedSession): Promise<ReviewState> {
    const [review, resolutions, runs] = await Promise.all([
      readReview(session.dir, session.id),
      readResolutions(session.dir, session.id),
      listRuns(session.dir),
    ])
    return { review, resolutions, activeRunId: activeRunId(runs) }
  }

  /** The live working tree, per-file patches and commit list (cached; 422 `repo-missing: <path>` when the repo is gone). */
  tree(session: LoadedSession): Promise<SessionTree> {
    return this.trees.get({ id: session.id, repo: session.manifest.repo.path, baseRef: session.manifest.repo.baseRef })
  }

  async commits(id: string): Promise<CommitList> {
    return (await this.tree(await this.loadSession(id))).commits
  }

  /**
   * The tree of one scope: `uncommitted`, or a commit that is in the session's current
   * `baseSha..HEAD` list (404 otherwise, so a stale or foreign sha never reaches git).
   */
  async scopeTree(id: string, scope: Scope): Promise<{ session: LoadedSession; result: WorkingTreeResult }> {
    const session = await this.loadSession(id)
    const { commits } = await this.tree(session)
    if (scope !== 'uncommitted' && !commits.commits.some((commit) => commit.sha === scope)) {
      throw notFound(`commit ${scope.slice(0, 12)} is not in ${commits.baseSha.slice(0, 12)}..${commits.headSha.slice(0, 12)} of session ${id}`)
    }
    try {
      return { session, result: await this.scopes.get(id, session.manifest.repo.path, scope) }
    } catch (err) {
      if (err instanceof HttpError) throw err
      throw new HttpError(422, `git failed: ${errorMessage(err)}`)
    }
  }

  /** The per-file patch of a scope; same rules as `filePatch`. */
  async scopePatch(id: string, scope: Scope, filePath: string): Promise<{ file: TreeFile; patch: string }> {
    const { result } = await this.scopeTree(id, scope)
    return this.patchOf(result, filePath)
  }

  /** `before` is the scope's base blob; `after` is the commit's blob, or the file on disk for `uncommitted`. */
  async scopeContents(id: string, scope: Scope, filePath: string, side: FileContentsSide): Promise<FileContents> {
    const { session, result } = await this.scopeTree(id, scope)
    return this.contentsOf(session.manifest.repo.path, result.tree, this.treeFile(result.tree, filePath), side, scope === 'uncommitted' ? null : scope)
  }

  artifacts(session: LoadedSession): Promise<SessionArtifacts> {
    return deriveArtifacts(session.dir, (message) => {
      const line = `session ${session.id}: ${message}`
      if (this.loggedOnce.has(line)) return
      this.loggedOnce.add(line)
      this.log(line)
    })
  }

  prDescription(session: LoadedSession): Promise<string | null> {
    return readTextIfExists(path.join(session.dir, SESSION_PR_DESCRIPTION_FILE))
  }

  async getSession(id: string): Promise<SessionDetail> {
    const session = await this.loadSession(id)
    const [state, { tree }, artifacts, prDescription] = await Promise.all([
      this.reviewState(session),
      this.tree(session),
      this.artifacts(session),
      this.prDescription(session),
    ])
    return {
      manifest: session.manifest,
      tree,
      ...artifacts,
      prDescription,
      status: sessionStatus({ review: state.review, tree, resolutions: state.resolutions, activeRun: state.activeRunId !== null }),
      progress: progress(state.review, tree, state.resolutions),
      activeRunId: state.activeRunId,
    }
  }

  /** The whole working-tree patch: every per-file patch in tree order. */
  async fullPatch(id: string): Promise<string> {
    const { tree, patches } = await this.tree(await this.loadSession(id))
    return concatPatches(tree, patches)
  }

  private treeFile(tree: WorkingTree, filePath: string): TreeFile {
    const file = tree.files.find((f) => f.path === filePath)
    if (!file) throw notFound(`no file ${JSON.stringify(filePath)} in the working tree`)
    return file
  }

  /** The per-file patch; 404 for unknown files, 410 for omitted ones. The caller decides what to do with `collapsed`. */
  async filePatch(id: string, filePath: string): Promise<{ file: TreeFile; patch: string }> {
    return this.patchOf(await this.tree(await this.loadSession(id)), filePath)
  }

  private patchOf({ tree, patches }: WorkingTreeResult, filePath: string): { file: TreeFile; patch: string } {
    const file = this.treeFile(tree, filePath)
    const patch = patches.get(file.path)
    if (file.omitted || patch === undefined) {
      throw new HttpError(410, `file ${JSON.stringify(filePath)} was omitted from the patch${file.omitReason ? `: ${file.omitReason}` : ''}`)
    }
    return { file, patch }
  }

  /**
   * `before` is `git show <baseSha>:<oldPath ?? path>` (read through the overlay object directory when
   * the base is virtual), `after` is the file on disk; 404 for the side an added or deleted file does not have.
   */
  async fileContents(id: string, filePath: string, side: FileContentsSide): Promise<FileContents> {
    const session = await this.loadSession(id)
    const { tree } = await this.tree(session)
    return this.contentsOf(session.manifest.repo.path, tree, this.treeFile(tree, filePath), side, null)
  }

  /** The env that reads a virtual base tree (memoized in `resolveBase`); nothing for a commit base. */
  private async baseRun(repo: string, tree: WorkingTree): Promise<RunOptions> {
    if (!tree.baseVirtual) return {}
    const resolved = await resolveBase({ repo, baseRef: tree.baseRef, overlayDir: overlayDirFor(this.overlayRoot, repo) })
    return resolved.env ? { env: resolved.env } : {}
  }

  /** `afterRev` null reads the after side from disk, else from that commit's blob. */
  private async contentsOf(repo: string, tree: WorkingTree, file: TreeFile, side: FileContentsSide, afterRev: string | null): Promise<FileContents> {
    const contentType = contentsType(file)
    const shown = JSON.stringify(file.path)
    if (side === 'before') {
      if (file.status === 'added') throw notFound(`${shown} was added; it has no before side`)
      try {
        return { body: await showFile(repo, tree.baseSha, file.oldPath ?? file.path, await this.baseRun(repo, tree)), contentType }
      } catch (err) {
        throw notFound(`${shown} has no before side at ${tree.baseSha.slice(0, 12)}: ${errorMessage(err)}`)
      }
    }
    if (file.status === 'deleted') throw notFound(`${shown} was deleted; it has no after side`)
    if (afterRev !== null) {
      try {
        return { body: await showFile(repo, afterRev, file.path), contentType }
      } catch (err) {
        throw notFound(`${shown} has no after side at ${afterRev.slice(0, 12)}: ${errorMessage(err)}`)
      }
    }
    try {
      return { body: await readWorkingFile(repo, file.path), contentType }
    } catch (err) {
      if (isMissing(err)) throw notFound(`${shown} is no longer on disk`)
      throw err
    }
  }

  /** An evidence, extras or spec file, only when the derived items list it; served from the session folder. */
  async artifactFile(id: string, kind: ArtifactKind, relPath: string): Promise<ServedFile> {
    const session = await this.loadSession(id)
    const allowed = artifactPaths(await this.artifacts(session), kind)
    if (!allowed.has(relPath)) throw notFound(`${JSON.stringify(relPath)} is not a ${kind} file of session ${id}`)
    const root = path.join(session.dir, ARTIFACT_DIRS[kind])
    const absolute = safeJoin(root, relPath)
    if (!(await isFile(absolute))) throw notFound(`${JSON.stringify(relPath)} is missing from session ${id}`)
    return { root, relative: path.relative(root, absolute), contentType: mimeFromPath(relPath) }
  }

  /** `review.json` merged with `resolutions.json`; an in-memory empty review when none was saved. */
  async getReview(id: string): Promise<ReviewResponse> {
    const session = await this.loadSession(id)
    const [stored, resolutions] = await Promise.all([readReview(session.dir, id), readResolutions(session.dir, id)])
    const review = stored ?? emptyReview(id)
    return { review, resolutions, comments: mergeComments(review, resolutions) }
  }

  /**
   * Saves the review when `baseUpdatedAt` matches the stored `updatedAt` (any base is accepted
   * while no file exists; a `null` base conflicts once one does). The server stamps `updatedAt`.
   */
  async putReview(id: string, body: PutReviewRequest): Promise<PutReviewResult> {
    if (body.review.sessionId !== id) {
      throw badRequest(`review.sessionId ${body.review.sessionId} does not match the route (${id})`)
    }
    return this.reviewLock.run(id, async () => {
      const session = await this.loadSession(id)
      const current = await readReview(session.dir, id)
      if (current !== null && body.baseUpdatedAt !== current.updatedAt) {
        return {
          ok: false,
          conflict: { error: `review changed since ${body.baseUpdatedAt ?? 'null'} (now ${current.updatedAt})`, current },
        }
      }
      const updatedAt = nextUpdatedAt(current?.updatedAt ?? null)
      await this.writeOwned(path.join(session.dir, REVIEW_FILE), { ...body.review, updatedAt })
      return { ok: true, updatedAt }
    })
  }

  /**
   * Rewrites `review.json` from its current contents under the per-session lock (used by the
   * send route). The server stamps `updatedAt`; the file counts as our own write.
   */
  async updateReview(id: string, mutate: ReviewMutation): Promise<Review> {
    return this.reviewLock.run(id, async () => {
      const session = await this.loadSession(id)
      const [current, resolutions] = await Promise.all([readReview(session.dir, id), readResolutions(session.dir, id)])
      const next = await mutate(current, resolutions)
      if (next.sessionId !== id) throw badRequest(`review.sessionId ${next.sessionId} does not match the session (${id})`)
      const review: Review = { ...next, updatedAt: nextUpdatedAt(current?.updatedAt ?? null) }
      await this.writeOwned(path.join(session.dir, REVIEW_FILE), review)
      return review
    })
  }

  /** Atomically writes JSON and remembers the resulting mtime as one of our own writes. */
  async writeOwned(file: string, value: unknown): Promise<void> {
    await writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`)
    const stat = await fs.stat(file)
    this.ownWrites.set(file, stat.mtimeMs)
  }

  /** True when the file on disk is still the version this process wrote last. */
  async isOwnWrite(file: string): Promise<boolean> {
    const recorded = this.ownWrites.get(file)
    if (recorded === undefined) return false
    try {
      return (await fs.stat(file)).mtimeMs === recorded
    } catch (err) {
      if (isMissing(err)) return false
      throw err
    }
  }

  /** `review/sent/<stem>.json`, `.md` and `.patch` for one Submit. */
  async writeSent(sessionDir: string, snapshot: SentSnapshot, markdown: string, patch: string): Promise<void> {
    const files = sentFiles(sessionDir, snapshot.sentAt)
    await writeFileAtomic(files.json, `${JSON.stringify(snapshot, null, 2)}\n`)
    await writeFileAtomic(files.markdown, markdown)
    await writeFileAtomic(files.patch, patch)
  }

  async writeRun(sessionDir: string, run: AgentRun): Promise<void> {
    await this.writeOwned(runFile(sessionDir, run.id), run)
  }

  async appendRunLog(sessionDir: string, runId: string, line: string): Promise<void> {
    const file = runLogFile(sessionDir, runId)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.appendFile(file, `${line}\n`, 'utf8')
  }

  /**
   * Moves `sessions/<id>` to `archive/<id>` after writing `archived.json` into it. 404 when the
   * session is not live, 409 `run-active` while a run is queued or running. The session watcher
   * sees the folder vanish and emits `session.removed`, unwatching the repo.
   */
  async archiveSession(id: string, now: Date = new Date()): Promise<void> {
    const session = await this.loadSession(id)
    const runs = await listRuns(session.dir)
    const active = activeRunId(runs)
    if (active !== null) throw new HttpError(409, 'run-active', `run ${active} is still active for session ${id}`)
    const target = this.paths.archivedSessionDir(id)
    if (await isDir(target)) throw new HttpError(409, 'exists', `session ${id} is already archived`)
    await writeArchivedMarker(session.dir, now.toISOString())
    await moveDir(session.dir, target)
    this.dropTree(id)
  }

  /**
   * Deletes `archive/<id>` permanently (archived sessions only: a live id is 404 and untouched).
   * Never touches the repository, `refs/ai-review/*` or `cache/`; a symlinked entry only loses the
   * link. 409 `run-active` if a run record still says running. No events: the live list is unaffected.
   */
  async deleteArchivedSession(id: string): Promise<void> {
    const dir = this.paths.archivedSessionDir(id)
    const kind = await archiveEntryKind(dir)
    if (kind === 'missing' || kind === 'other') throw notFound(`session ${id} is not archived`)
    if (kind === 'dir') {
      const active = activeRunId(await listRuns(dir))
      if (active !== null) throw new HttpError(409, 'run-active', `run ${active} is still active for session ${id}`)
    }
    await removeArchivedDir(this.paths.archiveDir, dir)
  }

  /** Moves `archive/<id>` back to `sessions/<id>`. 404 when not archived, 409 `exists` when a live session has the id. */
  async unarchiveSession(id: string): Promise<void> {
    const source = this.paths.archivedSessionDir(id)
    if (!(await isDir(source))) throw notFound(`session ${id} is not archived`)
    const target = this.paths.sessionDir(id)
    if (await isDir(target)) throw new HttpError(409, 'exists', `session ${id} is already live`)
    await removeArchivedMarker(source)
    await moveDir(source, target)
  }

  /** Every readable manifest under `archive/`, newest `archivedAt` first; broken folders are skipped. */
  async listArchived(): Promise<ArchivedSession[]> {
    let names: string[]
    try {
      const entries = await fs.readdir(this.paths.archiveDir, { withFileTypes: true })
      names = entries.filter((e) => e.isDirectory() && SESSION_ID_RE.test(e.name)).map((e) => e.name)
    } catch (err) {
      if (isMissing(err)) return []
      throw err
    }
    const items: ArchivedSession[] = []
    for (const id of names) {
      const dir = path.join(this.paths.archiveDir, id)
      const result = await this.manifests.read(dir, id)
      if (!result.ok) {
        this.log(`archived session ${id}: ${result.error}`)
        continue
      }
      items.push(archivedSession(result.manifest, await readArchivedAt(dir)))
    }
    return items.sort((a, b) => Date.parse(b.archivedAt) - Date.parse(a.archivedAt) || b.id.localeCompare(a.id))
  }

  /** Finds a run by id across every session folder (runs live under their session). */
  async findRun(runId: string): Promise<{ run: AgentRun; sessionDir: string } | null> {
    if (!RUN_ID_RE.test(runId)) return null
    for (const id of await this.sessionIds()) {
      const sessionDir = path.join(this.paths.sessionsDir, id)
      const run = await readRun(sessionDir, runId)
      if (run) return { run, sessionDir }
    }
    return null
  }

  /** Stops background tree work. */
  close(): void {
    this.trees.close()
  }
}

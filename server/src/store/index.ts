import { constants as fsConstants } from 'node:fs'
import { prReviewSessionStatus, searchPatch, SEARCH_MAX_PER_FILE, SEARCH_MAX_TOTAL, type PrReviewReport, type SearchFileHits, type SearchResponse } from '@scout/shared'
import { readPrReviewReport } from './pr-review.ts'
import { readPrStatus } from './pr-status.ts'
import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { journalCount, SCHEMA_VERSION, TEST_RUN_INDEX_FILE, SESSION_ID_RE, SESSION_PR_DESCRIPTION_FILE, buildPrCommentsResponse, derivePrComments, emptyReview, isTestRun, manifestKind, mergeComments, mimeFromPath, runFolderOf, prCommentCounts, prReplyKindFor, prSummary, progress, sessionStatus } from '@scout/shared'
import type {
  AnySentSnapshot,
  ArchivedSession,
  CodeReviewManifest,
  CommitList,
  FileContentsSide,
  Manifest,
  ManifestKind,
  PrComments,
  Journal,
  JournalResponse,
  PrCommentsResponse,
  PrReplies,
  PrReplyKind,
  PrReplyDraft,
  PrReplyDraftView,
  PutPrReplyResponse,
  PrResolutions,
  PutReviewConflict,
  PutReviewRequest,
  Resolutions,
  Review,
  ReviewResponse,
  Scope,
  SessionDetail,
  SessionListItem,
  SessionStatus,
  SessionSummary,
  TestRunDetail,
  TestRunManifest,
  TestRunSummary,
  TreeFile,
  WorkingTree,
} from '@scout/shared'
import { overlayDirFor, resolveBase } from '@scout/shared/git/base'
import { showFile } from '@scout/shared/git/repo'
import { git, gitTry } from '@scout/shared/git/run'
import type { RunOptions } from '@scout/shared/git/run'
import type { WorkingTreeResult } from '@scout/shared/git/working-tree'
import { HttpError, badRequest, conflict, errorMessage, invalidStoreFile, notFound } from '../errors.ts'
import { StoreEventBus } from '../events.ts'
import { archiveEntryKind, archivedSession, isDir, moveDir, readArchivedMarker, removeArchivedDir, removeArchivedMarker, writeArchivedMarker } from './archive.ts'
import { ARTIFACT_DIRS, artifactPaths, deriveArtifacts } from './artifacts.ts'
import type { ArtifactKind, SessionArtifacts } from './artifacts.ts'
import { isFile, isMissing, readTextIfExists, writeFileAtomic } from './fs.ts'
import { KeyedLock } from './lock.ts'
import { ManifestReader } from './manifest.ts'
import type { ManifestResult } from './manifest.ts'
import { safeJoin, storePaths } from './paths.ts'
import type { StorePaths } from './paths.ts'
import { REVIEW_FILE, readJournal, readPrComments, readPrReplies, readPrResolutions, writePrReplies, readResolutions, readReview, sentFiles } from './review.ts'
import { ScopeCache } from './scopes.ts'
import type { ScopeCacheOptions } from './scopes.ts'
import { deriveRunDetail, indexFingerprint, loadRunIndex, normalizeRef, refToAbsolute, resolveRoots, servablePaths } from './test-run.ts'
import { TreeCache } from './tree.ts'
import type { SessionTree, TreeCacheOptions } from './tree.ts'

export { safeJoin, storePaths } from './paths.ts'
export { readJournal, readPrComments, readPrReplies, readPrResolutions, readResolutions, readReview, writeReview } from './review.ts'

export interface LoadedSession {
  id: string
  /** Absolute session folder. */
  dir: string
  manifest: Manifest
}

export interface ReviewState {
  review: Review | null
  resolutions: Resolutions | null
  /** The synced GitHub PR (`pr-comments.json`) and the agent's answers; null when absent or unreadable. */
  prComments?: PrComments | null
  prResolutions?: PrResolutions | null
  /** The user's drafts and "resolved in Scout" marks (`pr-replies.json`). */
  prReplies?: PrReplies | null
  /** Scout's journal (`journal.json`); null when absent or unreadable. */
  journal?: Journal | null
}

/** `pr` and `prComments` of a summary or detail: counts are relative to the last send. */
function prFields(state: ReviewState): Pick<SessionSummary, 'pr' | 'prComments'> {
  const prComments = state.prComments ?? null
  if (prComments === null) return { pr: null, prComments: null }
  const views = derivePrComments(prComments, state.prResolutions ?? null, state.review?.sent?.at ?? null, state.prReplies ?? null)
  return { pr: prSummary(prComments), prComments: prCommentCounts(prComments, views) }
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

/** Most lines one log request returns. */
export const LOG_SLICE_MAX_LINES = 2000

export interface TestRunLogSlice {
  path: string
  from: number
  to: number
  total: number
  lines: string[]
}

/** The type a run file is served as: the shared map, plus plain text for logs. */
function runFileType(relative: string): string | null {
  return mimeFromPath(relative) ?? (/\.(log|out|err)$/i.test(relative) ? 'text/plain; charset=utf-8' : null)
}

function timeOf(iso: string | undefined): number {
  if (iso === undefined) return Number.NEGATIVE_INFINITY
  const t = Date.parse(iso)
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
}

/** The latest of the manifest, the review, the resolutions and `contentAt` (the tree computation, or the run index's `updatedAt`). */
export function latestUpdatedAt(manifest: Manifest, state: ReviewState, contentAt: string): string {
  const candidates = [manifest.updatedAt, state.review?.updatedAt, state.resolutions?.updatedAt, contentAt]
  let best = manifest.updatedAt
  for (const candidate of candidates) {
    if (candidate !== undefined && timeOf(candidate) > timeOf(best)) best = candidate
  }
  return best
}

export function sessionSummary(manifest: CodeReviewManifest, state: ReviewState, tree: WorkingTree, report?: PrReviewReport | null): SessionSummary {
  const openComments = state.review === null ? 0 : mergeComments(state.review, state.resolutions).filter((c) => c.status === 'open').length
  const derivedStatus = sessionStatus({ review: state.review, tree, resolutions: state.resolutions })
  return {
    kind: manifest.kind,
    id: manifest.id,
    title: manifest.title,
    repo: { path: manifest.repo.path, branch: tree.branch ?? manifest.repo.branch, sessionBranch: manifest.repo.branch, baseRef: manifest.repo.baseRef },
    tickets: manifest.tickets,
    status: manifest.kind === 'pr-review' ? prReviewSessionStatus(derivedStatus, report, tree, state.review) : derivedStatus,
    progress: progress(state.review, tree, state.resolutions),
    openComments,
    stats: { files: tree.stats.files, additions: tree.stats.additions, deletions: tree.stats.deletions },
    updatedAt: latestUpdatedAt(manifest, state, tree.computedAt),
    lastSend: state.review?.sent ?? null,
    journalCount: journalCount(state.journal ?? null),
    ...prFields(state),
  }
}

/** The scenarios of a run as review items: the id is the key of the verdict in `review.files`. */
export function scenarioItems(detail: TestRunDetail): { path: string; fingerprint: string }[] {
  return detail.scenarios.map((scenario) => ({ path: scenario.id, fingerprint: scenario.fingerprint }))
}

function testRunStatus(state: ReviewState, detail: TestRunDetail): SessionStatus {
  return sessionStatus({ review: state.review, tree: scenarioItems(detail), resolutions: state.resolutions })
}

export function testRunSummary(manifest: TestRunManifest, state: ReviewState, detail: TestRunDetail): TestRunSummary {
  const openComments = state.review === null ? 0 : mergeComments(state.review, state.resolutions).filter((c) => c.status === 'open').length
  const counts = { scenarios: detail.scenarios.length, pass: 0, fail: 0, gap: 0, na: 0, blocked: 0, uncertain: 0, planned: 0 }
  for (const scenario of detail.scenarios) counts[scenario.status] += 1
  const { reviewed, total } = progress(state.review, scenarioItems(detail), state.resolutions)
  return {
    kind: 'test-run',
    id: manifest.id,
    title: manifest.title,
    createdAt: manifest.createdAt,
    updatedAt: latestUpdatedAt(manifest, state, detail.index.updatedAt),
    run: { repo: manifest.run.repo, feature: manifest.run.feature, area: manifest.run.area },
    tickets: manifest.tickets,
    status: testRunStatus(state, detail),
    counts,
    reviewed,
    total,
    openComments,
    lastSend: state.review?.sent ?? null,
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
function pickDraft(draft: PrReplyDraft): PrReplyDraftView {
  return { body: draft.body, kind: draft.kind, editedAt: draft.editedAt, postedAt: draft.postedAt }
}

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
  /** Derived test-run details by session id, dropped by the run watcher; `indexStamp` guards against a missed event. */
  private readonly runDetails = new Map<string, { detail: TestRunDetail; indexStamp: string }>()
  private readonly runDetailsInFlight = new Map<string, Promise<TestRunDetail>>()
  private readonly reviewLock = new KeyedLock()
  private readonly prRepliesLock = new KeyedLock()
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
    this.invalidateRun(id)
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

  /** Ids of archived session folders (`archive/<id>`), unsorted; none when `archive/` is missing. */
  async archivedIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.paths.archiveDir, { withFileTypes: true })
      return entries.filter((e) => e.isDirectory() && SESSION_ID_RE.test(e.name)).map((e) => e.name)
    } catch (err) {
      if (isMissing(err)) return []
      throw err
    }
  }

  /** The manifest of `archive/<id>` plus its `archived.json` marker. */
  async readArchived(id: string): Promise<{ result: ManifestResult; marker: { archivedAt: string; done: boolean } }> {
    const dir = this.paths.archivedSessionDir(id)
    return { result: await this.manifests.read(dir, id), marker: await readArchivedMarker(dir) }
  }

  /**
   * Every folder under `sessions/`, newest first; broken folders and unreadable repos appear as `{ id, error }`.
   * With `kind` only sessions of that kind are listed (a folder whose manifest cannot be read has no kind and is left out).
   */
  async listSessions(kind?: ManifestKind): Promise<SessionListItem[]> {
    const listed = await Promise.all((await this.sessionFolders()).map((id) => this.listItem(id, kind)))
    const items = listed.filter((item): item is SessionListItem => item !== null)
    return items.sort((a, b) => listSortKey(b) - listSortKey(a) || b.id.localeCompare(a.id))
  }

  private async listItem(id: string, kind: ManifestKind | undefined): Promise<SessionListItem | null> {
    if (!SESSION_ID_RE.test(id)) return kind === undefined ? { id, error: 'folder name is not a valid session id' } : null
    const result = await this.readManifest(id)
    if (!result.ok) return kind === undefined ? { id, error: result.error } : null
    const { manifest } = result
    if (kind !== undefined && manifestKind(manifest) !== kind) return null
    const session: LoadedSession = { id, dir: path.join(this.paths.sessionsDir, id), manifest }
    try {
      if (isTestRun(manifest)) {
        const [state, detail] = await Promise.all([this.reviewState(session), this.runDetail(manifest)])
        return testRunSummary(manifest, state, detail)
      }
      const [state, { tree }] = await Promise.all([this.reviewState(session), this.tree(session)])
      if (manifest.kind !== 'pr-review') return sessionSummary(manifest, state, tree)
      const [report, prStatus] = await Promise.all([readPrReviewReport(session.dir), readPrStatus(session.dir)])
      return { ...sessionSummary(manifest, state, tree, report), prStatus }
    } catch (err) {
      return { id, error: errorMessage(err) }
    }
  }

  /** The cached derived detail of a test run; recomputed after `invalidateRun` or when `test-run.json` changed on disk. 422 when the index is unusable. */
  async runDetail(manifest: TestRunManifest): Promise<TestRunDetail> {
    const stamp = await this.indexStamp(manifest)
    const cached = this.runDetails.get(manifest.id)
    if (cached !== undefined && cached.indexStamp === stamp) return cached.detail
    const pending = this.runDetailsInFlight.get(manifest.id)
    if (pending !== undefined) return pending
    const compute = deriveRunDetail(manifest, this.runPathOf(manifest))
      .then((detail) => {
        this.runDetails.set(manifest.id, { detail, indexStamp: stamp })
        return detail
      })
      .finally(() => this.runDetailsInFlight.delete(manifest.id))
    this.runDetailsInFlight.set(manifest.id, compute)
    return compute
  }

  /** The run folder of a live test run: `sessions/<id>/run`. */
  runPathOf(manifest: TestRunManifest): string {
    return runFolderOf(this.paths.sessionDir(manifest.id))
  }

  private async indexStamp(manifest: TestRunManifest): Promise<string> {
    const runPath = this.runPathOf(manifest)
    try {
      const stat = await fs.stat(path.join(runPath, TEST_RUN_INDEX_FILE))
      return `${runPath}:${stat.mtimeMs}:${stat.size}`
    } catch {
      return `${runPath}:missing`
    }
  }

  /** The run folder or its media changed: the next read derives the detail again. */
  invalidateRun(id: string): void {
    this.runDetails.delete(id)
    this.runDetailsInFlight.delete(id)
  }

  /** The directories a run watcher needs: the run folder and every resolved root (the run folder alone when the index is unusable). */
  async runWatchPaths(manifest: TestRunManifest): Promise<string[]> {
    const runPath = this.runPathOf(manifest)
    const paths = [runPath]
    try {
      const loaded = await loadRunIndex(runPath)
      if (loaded?.ok) paths.push(...Object.values(await resolveRoots(manifest, runPath, loaded.index)))
    } catch (err) {
      this.log(`test run ${manifest.id}: watching the run folder only: ${errorMessage(err)}`)
    }
    return paths
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
    // The PR files are optional extras: an unreadable one must not break the session list.
    const [review, resolutions, prComments, prResolutions, prReplies, journal] = await Promise.all([
      readReview(session.dir, session.id),
      readResolutions(session.dir, session.id),
      readPrComments(session.dir, session.id).catch(() => null),
      readPrResolutions(session.dir, session.id).catch(() => null),
      readPrReplies(session.dir, session.id).catch(() => null),
      readJournal(session.dir, session.id),
    ])
    return { review, resolutions, prComments, prResolutions, prReplies, journal }
  }

  /** The live working tree, per-file patches and commit list (cached; 422 `repo-missing: <path>` when the repo is gone). */
  tree(session: LoadedSession): Promise<SessionTree> {
    const { repo } = this.codeReview(session)
    return this.trees.get({ id: session.id, repo: repo.path, baseRef: repo.baseRef })
  }

  /** The manifest of a code review; 404 for a test run, which has no repo working tree to diff. */
  codeReview(session: LoadedSession): CodeReviewManifest {
    if (isTestRun(session.manifest)) throw notFound(`session ${session.id} is a test run: it has no working tree`)
    return session.manifest
  }

  /** The manifest of a test run; 404 for a code review. */
  testRun(session: LoadedSession): TestRunManifest {
    if (!isTestRun(session.manifest)) throw notFound(`session ${session.id} is a code review, not a test run`)
    return session.manifest
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
      return { session, result: await this.scopes.get(id, this.codeReview(session).repo.path, scope) }
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
    return this.contentsOf(this.codeReview(session).repo.path, result.tree, this.treeFile(result.tree, filePath), side, scope === 'uncommitted' ? null : scope)
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
    if (isTestRun(session.manifest)) {
      return await this.runDetail(session.manifest)
    }
    const [state, { tree }, artifacts, prDescription] = await Promise.all([
      this.reviewState(session),
      this.tree(session),
      this.artifacts(session),
      this.prDescription(session),
    ])
    const report = session.manifest.kind === 'pr-review' ? await readPrReviewReport(session.dir) : null
    return {
      kind: session.manifest.kind,
      manifest: session.manifest,
      prReview: report,
      tree,
      ...artifacts,
      prDescription,
      status: sessionSummary(session.manifest, state, tree, report).status,
      progress: progress(state.review, tree, state.resolutions),
      journalCount: journalCount(state.journal ?? null),
      ...prFields(state),
      ...(session.manifest.kind === 'pr-review' && { prStatus: await readPrStatus(session.dir) }),
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
    return this.contentsOf(this.codeReview(session).repo.path, tree, this.treeFile(tree, filePath), side, null)
  }

  /** Case-insensitive substring search over the changed files' patches, in tree order (omitted files have none). */
  async searchDiff(id: string, query: string): Promise<SearchResponse> {
    const { tree, patches } = await this.tree(await this.loadSession(id))
    const files: SearchFileHits[] = []
    let total = 0
    for (const file of tree.files) {
      const patch = patches.get(file.path)
      if (file.omitted || patch === undefined) continue
      const hits = searchPatch(file.path, patch, query, Math.min(SEARCH_MAX_PER_FILE, SEARCH_MAX_TOTAL - total))
      if (!hits) continue
      files.push(hits)
      total += hits.hits.length
      if (total >= SEARCH_MAX_TOTAL) return { query, scope: 'diff', files, truncated: true }
    }
    return { query, scope: 'diff', files, truncated: false }
  }

  /** `git grep` (fixed string, case-insensitive, text files) over the working tree, untracked files included. */
  async searchRepo(id: string, query: string): Promise<SearchResponse> {
    const repo = this.codeReview(await this.loadSession(id)).repo.path
    const out = await git(repo, ['grep', '--untracked', '-n', '-z', '-I', '-i', '-F', '--no-color', '-m', String(SEARCH_MAX_PER_FILE + 1), '-e', query], { okExitCodes: [1] })
    const byPath = new Map<string, SearchFileHits>()
    let total = 0
    let truncated = false
    for (const record of out.toString('utf8').split('\n')) {
      const [path, line, ...rest] = record.split('\0')
      if (!path || line === undefined) continue
      let file = byPath.get(path)
      if (!file) byPath.set(path, (file = { path, hits: [], truncated: false }))
      if (file.hits.length === SEARCH_MAX_PER_FILE) { file.truncated = true; continue }
      if (total === SEARCH_MAX_TOTAL) { truncated = true; break }
      file.hits.push({ side: 'new', line: Number(line), kind: 'context', text: rest.join('\0').slice(0, 400) })
      total += 1
    }
    return { query, scope: 'repo', files: [...byPath.values()], truncated }
  }

  /** A file of the working tree that git tracks or would track (not ignored), as plain text; for search results outside the diff. */
  async repoFile(id: string, filePath: string): Promise<FileContents> {
    const repo = this.codeReview(await this.loadSession(id)).repo.path
    const listed = await gitTry(repo, ['ls-files', '-co', '--exclude-standard', '-z', '--', `:(literal)${filePath}`])
    if (!listed?.split('\0').includes(filePath)) throw notFound(`${JSON.stringify(filePath)} is not a file of the repository`)
    try {
      return { body: await readWorkingFile(repo, filePath), contentType: 'text/plain; charset=utf-8' }
    } catch (err) {
      if (isMissing(err)) throw notFound(`${JSON.stringify(filePath)} is no longer on disk`)
      throw err
    }
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

  /** `test-run.json`'s fingerprint, for the send snapshot. */
  runIndexFingerprint(manifest: TestRunManifest): Promise<string | null> {
    return indexFingerprint(this.runPathOf(manifest))
  }

  /**
   * A file of a test run, only when the index names it (`ref` is `alias:relative/path`; anything else is 404). The leaf must be a
   * regular file (a symlink is refused) and its directory must resolve inside the alias's root, so a link planted in the run folder leads nowhere.
   */
  async testRunFile(id: string, ref: string): Promise<ServedFile> {
    const session = await this.loadSession(id)
    const manifest = this.testRun(session)
    const detail = await this.runDetail(manifest)
    const roots = await resolveRoots(manifest, this.runPathOf(manifest), detail.index)
    const normal = normalizeRef(ref)
    const target = normal === null ? null : refToAbsolute(roots, normal)
    if (normal === null || target === null || !servablePaths(detail.index, roots).has(normal)) throw notFound(`${JSON.stringify(ref)} is not a file of test run ${id}`)
    const absolute = safeJoin(target.root, target.relative)
    await this.assertRegularFile(target.root, absolute, ref)
    return { root: target.root, relative: path.relative(target.root, absolute), contentType: runFileType(target.relative) }
  }

  private async assertRegularFile(root: string, absolute: string, shown: string): Promise<void> {
    try {
      const parent = await fs.realpath(path.dirname(absolute))
      if (parent !== root && !parent.startsWith(root + path.sep)) throw notFound(`${JSON.stringify(shown)} is not inside the run`)
      if (!(await fs.lstat(absolute)).isFile()) throw notFound(`${JSON.stringify(shown)} is not a regular file`)
    } catch (err) {
      if (isMissing(err)) throw notFound(`${JSON.stringify(shown)} is missing from the run`)
      throw err
    }
  }

  /**
   * Lines `from..to` (1-based, at most `LOG_SLICE_MAX_LINES`) of a log the index names, and the file's total line count.
   * Streams the file, never buffering it; opened with `O_NOFOLLOW` after the same checks as `testRunFile`.
   */
  async testRunLog(id: string, ref: string, from: number, to: number): Promise<TestRunLogSlice> {
    const file = await this.testRunFile(id, ref)
    const absolute = path.join(file.root, file.relative)
    let handle: Awaited<ReturnType<typeof fs.open>>
    try {
      handle = await fs.open(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    } catch (err) {
      if (isMissing(err) || (err as NodeJS.ErrnoException).code === 'ELOOP') throw notFound(`${JSON.stringify(ref)} is not a regular file of the run`)
      throw err
    }
    const last = Math.min(to, from + LOG_SLICE_MAX_LINES - 1)
    const lines: string[] = []
    let total = 0
    try {
      const reader = readline.createInterface({ input: handle.createReadStream({ encoding: 'utf8', autoClose: false }), crlfDelay: Number.POSITIVE_INFINITY })
      for await (const line of reader) {
        total += 1
        if (total >= from && total <= last) lines.push(line)
      }
    } finally {
      await handle.close()
    }
    return { path: normalizeRef(ref) ?? ref, from, to: lines.length === 0 ? from : from + lines.length - 1, total, lines }
  }

  /** Scout's journal; `{ journal: null }` when absent, unreadable or for a session that is not a code review. */
  async getJournal(id: string): Promise<JournalResponse> {
    const session = await this.loadSession(id)
    if (manifestKind(session.manifest) !== 'code-review') return { journal: null }
    return { journal: await readJournal(session.dir, id) }
  }

  /** `pr-comments.json` merged with `pr-resolutions.json` (an empty response when never synced); 422 when a file is invalid. */
  async getPrComments(id: string): Promise<PrCommentsResponse> {
    const session = await this.loadSession(id)
    const [prComments, prResolutions, review, replies] = await Promise.all([readPrComments(session.dir, id), readPrResolutions(session.dir, id), readReview(session.dir, id), readPrReplies(session.dir, id)])
    return buildPrCommentsResponse(prComments, prResolutions, review?.sent?.at ?? null, replies)
  }

  /**
   * Saves the user's draft for one PR comment thread in `review/pr-replies.json` (atomic, under a per-session lock). A new draft's kind comes from the
   * thread's status: open → `instruction`, addressed or declined → `reply`. Saving an existing unposted draft keeps its kind, so a private
   * instruction never turns into a public reply by an edit; when its kind no longer fits the status the save is a 409
   * `pr-reply-kind-mismatch`, unless the request names the kind the status implies (the explicit conversion). A blank body deletes the draft, except one already posted
   * (it stays as the record). Saving the text of a posted draft again changes nothing, so it is never posted twice. 404 for an unknown
   * comment id, 400 for a reply inside a thread or an outdated comment (nothing to say about those).
   */
  async putPrReply(id: string, commentId: string, body: string, requestedKind?: PrReplyKind, now: string = new Date().toISOString()): Promise<PutPrReplyResponse> {
    return this.prRepliesLock.run(id, async () => {
      const session = await this.loadSession(id)
      const [prComments, prResolutions, review, current] = await Promise.all([readPrComments(session.dir, id), readPrResolutions(session.dir, id), readReview(session.dir, id), readPrReplies(session.dir, id)])
      const view = derivePrComments(prComments, prResolutions, review?.sent?.at ?? null, current).find((candidate) => candidate.id === commentId)
      if (view === undefined) throw notFound(`PR comment ${commentId} is not in session ${id}'s pr-comments.json`)
      const derived = prReplyKindFor(view)
      if (derived === null) throw badRequest(`${commentId} is ${view.isReply ? 'a reply inside a thread: use the thread root' : `${view.status}: nothing to instruct or reply`}`)
      if (requestedKind !== undefined && requestedKind !== derived) throw badRequest(`${commentId} is ${view.status}: it takes ${derived === 'reply' ? 'a reply' : 'an instruction'}, not ${requestedKind === 'reply' ? 'a reply' : 'an instruction'}`)
      const replies: PrReplies['replies'] = { ...(current?.replies ?? {}) }
      const existing = replies[commentId]
      if (existing !== undefined && existing.postedAt !== null && (body.trim() === '' || body === existing.body)) {
        return { commentId, draft: pickDraft(existing), updatedAt: current?.updatedAt ?? now }
      }
      if (body.trim() === '') {
        if (existing === undefined) return { commentId, draft: null, updatedAt: current?.updatedAt ?? now }
        delete replies[commentId]
      } else {
        const keeps = existing !== undefined && existing.postedAt === null
        if (keeps && existing.kind !== derived && requestedKind === undefined) {
          throw conflict(`${commentId} changed since the ${existing.kind} was written: it was not saved or posted. Clear it first`, 'pr-reply-kind-mismatch')
        }
        replies[commentId] = { body, kind: keeps && requestedKind === undefined ? existing.kind : derived, editedAt: now, postedAt: null }
      }
      const updatedAt = nextUpdatedAt(current?.updatedAt ?? null)
      await writePrReplies(session.dir, { ...current, schemaVersion: SCHEMA_VERSION, sessionId: id, updatedAt, replies })
      const saved = replies[commentId]
      return { commentId, draft: saved === undefined ? null : pickDraft(saved), updatedAt }
    })
  }

  /**
   * Marks an open thread root handled in Scout (or reopens it) in `review/pr-replies.json`: it then reads as outdated
   * ("Resolved in Scout"), so its instruction is not sent and Claude is not asked about it. Nothing reaches GitHub.
   * 404 for an unknown comment, 400 for a reply inside a thread or a thread that is not open (or not resolved here, to reopen).
   */
  async putPrResolved(id: string, commentId: string, resolved: boolean, now: string = new Date().toISOString()): Promise<PrCommentsResponse> {
    await this.prRepliesLock.run(id, async () => {
      const session = await this.loadSession(id)
      const [prComments, prResolutions, review, current] = await Promise.all([readPrComments(session.dir, id), readPrResolutions(session.dir, id), readReview(session.dir, id), readPrReplies(session.dir, id)])
      const view = derivePrComments(prComments, prResolutions, review?.sent?.at ?? null, current).find((candidate) => candidate.id === commentId)
      if (view === undefined) throw notFound(`PR comment ${commentId} is not in session ${id}'s pr-comments.json`)
      if (view.isReply) throw badRequest(`${commentId} is a reply inside a thread: use the thread root`)
      const marked = view.closedBy === 'scout-resolved'
      if (resolved === marked) return
      if (resolved && view.status !== 'open') throw badRequest(`${commentId} is ${view.status}: only an open comment can be resolved`)
      const next: Record<string, string> = { ...(current?.resolved ?? {}) }
      if (resolved) next[commentId] = now
      else delete next[commentId]
      await writePrReplies(session.dir, { schemaVersion: SCHEMA_VERSION, sessionId: id, updatedAt: nextUpdatedAt(current?.updatedAt ?? null), replies: current?.replies ?? {}, resolved: next })
    })
    return this.getPrComments(id)
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

  /** `review/sent/<stem>.json`, `.md` and (for a code review; a test run has none) `.patch` for one Submit. */
  async writeSent(sessionDir: string, snapshot: AnySentSnapshot, markdown: string, patch: string | null): Promise<void> {
    const files = sentFiles(sessionDir, snapshot.sentAt)
    await writeFileAtomic(files.json, `${JSON.stringify(snapshot, null, 2)}\n`)
    await writeFileAtomic(files.markdown, markdown)
    if (patch !== null) await writeFileAtomic(files.patch, patch)
  }

  /**
   * Moves `sessions/<id>` to `archive/<id>` after writing `archived.json` into it. 404 when the
   * session is not live. The session watcher
   * sees the folder vanish and emits `session.removed`, unwatching the repo.
   */
  /** Moves `sessions/<id>` to `archive/<id>`; `done` marks it finished (usually merged) rather than just put away. */
  async archiveSession(id: string, now: Date = new Date(), done = false): Promise<void> {
    const session = await this.loadSession(id)
    const target = this.paths.archivedSessionDir(id)
    if (await isDir(target)) throw new HttpError(409, 'exists', `session ${id} is already archived`)
    await writeArchivedMarker(session.dir, now.toISOString(), done)
    await moveDir(session.dir, target)
    this.dropTree(id)
  }

  /**
   * Deletes `archive/<id>` permanently (archived sessions only: a live id is 404 and untouched).
   * Never touches the repository, `refs/ai-review/*` or `cache/`; a symlinked entry only loses the
   * link. No events: the live list is unaffected.
   */
  async deleteArchivedSession(id: string): Promise<void> {
    const dir = this.paths.archivedSessionDir(id)
    const kind = await archiveEntryKind(dir)
    if (kind === 'missing' || kind === 'other') throw notFound(`session ${id} is not archived`)
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
  async listArchived(kind?: ManifestKind): Promise<ArchivedSession[]> {
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
      if (kind !== undefined && manifestKind(result.manifest) !== kind) continue
      const prStatus = manifestKind(result.manifest) === 'pr-review' ? await readPrStatus(dir) : undefined
      items.push({ ...archivedSession(result.manifest, await readArchivedMarker(dir)), ...(prStatus && { prStatus }) })
    }
    return items.sort((a, b) => Date.parse(b.archivedAt) - Date.parse(a.archivedAt) || b.id.localeCompare(a.id))
  }

  /** Stops background tree work. */
  close(): void {
    this.trees.close()
  }
}

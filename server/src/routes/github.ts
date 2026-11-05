import { Router } from 'express'
import { z } from 'zod'
import { CreatePendingPrReviewRequestSchema, GithubDoneRequestSchema, SetPrReviewStatusRequestSchema } from '@scout/shared'
import type { AssignedPr, AssignedPrsResponse, CreatePendingPrReviewResponse, LocalPrReview, PendingPrReview, PendingPrReviewDetail, PrStatus } from '@scout/shared'
import { HttpError, badRequest, errorMessage, formatZodError } from '../errors.ts'
import { readSettings } from '../settings.ts'
import type { Store } from '../store/index.ts'
import { AssignedPrs, viewerReview } from '../github/assigned.ts'
import type { SessionLookup } from '../github/assigned.ts'
import { checkoutsOf } from '../github/checkouts.ts'
import { GhCommandError, classifyGhFailure, defaultGhRunner } from '../github/gh.ts'
import type { GhRunner } from '../github/gh.ts'
import { deletePending, listPending, newPendingId, pendingByPr, readPending, writePending } from '../github/pending.ts'
import { parsePrUrl, prKey, prUrl } from '../github/pr-url.ts'
import { addMark, prMarks, removeMark } from '../github/done.ts'
import { ReviewStatusSync, setReviewStatus } from '../github/review-status.ts'
import { archivedPrReviews, livePrReviews, prReviewSessions } from '../github/sessions.ts'
import { readPrStatus, writePrStatusFile } from '../store/pr-status.ts'

const GhPrViewSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  author: z.object({ login: z.string().optional() }).nullable().optional(),
  isDraft: z.boolean(),
  headRefName: z.string(),
  baseRefName: z.string(),
})

/** A PR URL from a Done request body; 400 unless it is a GitHub pull request. */
function doneUrl(body: unknown): string {
  const parsed = GithubDoneRequestSchema.safeParse(body)
  if (!parsed.success) throw badRequest(formatZodError(parsed.error))
  if (prKey(parsed.data.url) === null) throw badRequest('url must be a GitHub pull request, like https://github.com/owner/name/pull/123')
  return parsed.data.url
}

async function viewPr(gh: GhRunner, ref: { repo: string; number: number }): Promise<PendingPrReview['pr']> {
  let out: string
  try {
    out = await gh(['pr', 'view', prUrl(ref), '--json', 'number,title,url,author,isDraft,headRefName,baseRefName'], process.cwd())
  } catch (err) {
    const failure = classifyGhFailure(err)
    const detail = err instanceof GhCommandError ? err.stderr.trim() || err.message : errorMessage(err)
    const message = failure === 'gh-missing' ? 'the GitHub CLI (gh) is not installed' : failure === 'not-authenticated' ? 'gh is not signed in: run `gh auth login`' : `GitHub did not return ${prUrl(ref)}`
    throw new HttpError(502, message, detail)
  }
  const view = GhPrViewSchema.parse(JSON.parse(out))
  return {
    url: view.url,
    repo: ref.repo,
    number: view.number,
    title: view.title,
    author: view.author?.login ?? 'ghost',
    isDraft: view.isDraft,
    headRef: view.headRefName,
    baseRef: view.baseRefName,
  }
}

export interface GithubRouterOptions {
  home: string
  store: Store
  gh?: GhRunner
  now?: () => number
}

/** `GET /github/assigned`, Done / Ignore / reopen of a PR, a PR review session's status, and the `/pr-pending` placeholders. */
export function githubRouter({ home, store, gh = defaultGhRunner, now = Date.now }: GithubRouterOptions): Router {
  const router = Router()
  const assigned = new AssignedPrs(gh, now)
  const reviews = new ReviewStatusSync(store, gh, now)

  /** Marks a PR Done: archives its live review session as Done, removes a not-started one, records the mark. */
  async function markDone(url: string): Promise<void> {
    const key = prKey(url) as string
    const liveId = (await livePrReviews(store)).get(key)
    if (liveId !== undefined) await store.archiveSession(liveId, new Date(now()), true)
    // A not-started review has nothing to keep once the PR is done.
    const pendingId = (await pendingByPr(home)).get(key)
    if (pendingId !== undefined) await deletePending(home, pendingId)
    await addMark(home, 'prs', url, new Date(now()))
  }

  /** Each PR's session and status from the sessions and marks, read fresh. */
  async function lookup(): Promise<SessionLookup> {
    const [live, pending, archived, marks] = await Promise.all([livePrReviews(store), pendingByPr(home), archivedPrReviews(store), prMarks(home)])
    const liveStatus = new Map(await Promise.all([...live].map(async ([key, id]) => [key, await readPrStatus(store.paths.sessionDir(id))] as const)))
    return (pr, viewer) => {
      const key = prKey(pr.url)
      if (key === null) return { session: null, status: 'pending' }
      const liveId = live.get(key)
      const pendingId = pending.get(key)
      const old = archived.get(key)
      const session: AssignedPr['session'] =
        liveId !== undefined ? { id: liveId, state: 'live' } : pendingId !== undefined ? { id: pendingId, state: 'pending' } : old ? { id: old.id, state: 'archived' } : null
      const review = viewerReview(pr, viewer)
      const reopenedAt = marks.undone.get(key)
      // A reopen sets aside the approvals given before it.
      const counts = (entry: { submittedAt: string | null }) => !(reopenedAt !== undefined && entry.submittedAt !== null && entry.submittedAt <= reopenedAt)
      // Anyone's approval (yours or someone else's) makes it Approved.
      const approvedOnGithub = pr.reviews.some((entry) => entry.state === 'approved' && counts(entry))
      const commentedOnGithub = review !== null && (review.state === 'commented' || review.state === 'changes-requested')
      const sessionStatus = liveId !== undefined ? liveStatus.get(key) : undefined
      let status: PrStatus
      if (marks.ignored.has(key)) status = 'ignored'
      else if (sessionStatus === 'approved' || (liveId === undefined && old?.prStatus === 'approved') || approvedOnGithub) status = 'approved'
      else if (marks.prs.has(key) || (liveId === undefined && old?.done === true)) status = 'done'
      else if (sessionStatus !== undefined) status = sessionStatus === 'commented' || commentedOnGithub ? 'commented' : 'in-progress'
      else if (old !== undefined && pendingId === undefined) status = 'archived'
      else status = commentedOnGithub ? 'commented' : 'pending'
      return { session, status }
    }
  }

  /** Picks up your GitHub reviews into the live review sessions; skipped while gh can't say who you are. */
  async function syncReviews(): Promise<void> {
    let viewer: string
    try {
      viewer = await assigned.viewerLogin()
    } catch {
      return
    }
    await reviews.sync(viewer, assigned.cachedPrs((await readSettings(home)).github) ?? [])
  }

  /**
   * "Other": live and not-started PR reviews, and archived ones without a PR, whose PR no other section covers (or that have no PR), one row per PR
   * (a live review wins over a placeholder, which wins over an archived one), newest first.
   */
  async function otherReviews(covered: ReadonlySet<string>, statusOf: SessionLookup): Promise<LocalPrReview[]> {
    const [sessions, placeholders] = await Promise.all([prReviewSessions(store), listPending(home)])
    const rows: LocalPrReview[] = []
    const seen = new Set<string>()
    const prOf = (url: string | undefined): LocalPrReview['pr'] => {
      const ref = url === undefined ? null : parsePrUrl(url)
      return ref === null || url === undefined ? null : { url, repo: ref.repo, number: ref.number }
    }
    const add = (row: LocalPrReview) => {
      const key = row.pr === null ? null : prKey(row.pr.url)
      if (key !== null && (covered.has(key) || seen.has(key))) return
      if (key !== null) seen.add(key)
      rows.push(row)
    }
    const keyed = (url: string | undefined) => (prKey(url ?? '') === null ? null : statusOf({ url: url as string, reviews: [] }, null).status)
    for (const info of sessions.filter((session) => !session.archived)) {
      add({ session: { id: info.id, state: 'live' }, title: info.title, pr: prOf(info.url), status: keyed(info.url) ?? info.prStatus, updatedAt: info.updatedAt })
    }
    for (const pending of placeholders) {
      add({ session: { id: pending.id, state: 'pending' }, title: pending.pr.title, pr: prOf(pending.pr.url), status: keyed(pending.pr.url) ?? 'pending', updatedAt: pending.createdAt })
    }
    // Newest archived first, so a PR keeps its latest review. An archived review of a PR no longer listed (merged, or not
    // yours) is left out: Other keeps only reviews without a PR and work in flight.
    for (const info of sessions.filter((session) => session.archived && prKey(session.url ?? '') === null).sort((a, b) => b.id.localeCompare(a.id))) {
      const own: PrStatus = info.done ? 'done' : info.prStatus === 'approved' ? 'approved' : 'archived'
      add({ session: { id: info.id, state: 'archived' }, title: info.title, pr: prOf(info.url), status: keyed(info.url) ?? own, updatedAt: info.updatedAt })
    }
    return rows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  }

  router.get('/github/assigned', async (req, res) => {
    const settings = (await readSettings(home)).github
    const refresh = req.query.refresh === '1'
    // Fetch first, so the pickup reads fresh reviews from the list; then attach sessions and statuses.
    await assigned.get(settings, refresh, () => ({ session: null, status: 'pending' }))
    await syncReviews()
    const statusOf = await lookup()
    const groups = await assigned.get(settings, false, statusOf)
    const covered = new Set([...groups.authored, ...groups.assignedToMe, ...groups.teams.flatMap((team) => team.prs)].map((pr) => prKey(pr.url)).filter((key): key is string => key !== null))
    const body: AssignedPrsResponse = { ...groups, other: await otherReviews(covered, statusOf) }
    res.json(body)
  })

  // Done: reviewed and commented, nothing sent to the PR. A live review session for the PR is archived as Done too, and a not-started one removed.
  router.put('/github/done', async (req, res) => {
    await markDone(doneUrl(req.body))
    res.status(204).end()
  })

  // Ignore: skipped on purpose here; nothing changes on GitHub or in any session.
  router.put('/github/ignored', async (req, res) => {
    await addMark(home, 'ignored', doneUrl(req.body), new Date(now()))
    res.status(204).end()
  })

  // Reopen a closed PR: takes off Done and Ignore, sets aside your approvals so far, and brings back its archived review
  // session (an Approved one comes back as Commented).
  router.post('/github/reopen', async (req, res) => {
    const url = doneUrl(req.body)
    const key = prKey(url) as string
    const at = new Date(now())
    await removeMark(home, 'prs', url)
    await removeMark(home, 'ignored', url)
    await addMark(home, 'undone', url, at)
    let liveId = (await livePrReviews(store)).get(key)
    if (liveId === undefined) {
      const old = (await archivedPrReviews(store)).get(key)
      if (old !== undefined) {
        await store.unarchiveSession(old.id)
        liveId = old.id
      }
    }
    if (liveId !== undefined && (await readPrStatus(store.paths.sessionDir(liveId))) === 'approved') {
      await writePrStatusFile(store.paths.sessionDir(liveId), { status: 'commented', setAt: at.toISOString(), by: 'you' })
    }
    res.status(204).end()
  })

  // A PR review session's status, set by hand; Approved closes (archives) it.
  router.put('/sessions/:id/pr-status', async (req, res) => {
    const parsed = SetPrReviewStatusRequestSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest(formatZodError(parsed.error))
    const loaded = await store.readManifest(req.params.id)
    if (!loaded.ok) throw new HttpError(404, 'not-found', `session ${req.params.id} not found`)
    if (loaded.manifest.kind !== 'pr-review') throw badRequest('only PR review sessions have a review status')
    const at = new Date(now())
    await setReviewStatus(store, req.params.id, { status: parsed.data.status, setAt: at.toISOString(), by: 'you' }, at)
    res.status(204).end()
  })

  router.get('/pr-pending', async (_req, res) => {
    res.json(await listPending(home))
  })

  router.post('/pr-pending', async (req, res) => {
    const parsed = CreatePendingPrReviewRequestSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest(formatZodError(parsed.error))
    const ref = parsePrUrl(parsed.data.url)
    if (ref === null) throw badRequest('url must be a GitHub pull request, like https://github.com/owner/name/pull/123')
    const key = prKey(parsed.data.url) as string
    const liveId = (await livePrReviews(store)).get(key)
    if (liveId !== undefined) {
      const body: CreatePendingPrReviewResponse = { id: liveId, state: 'live' }
      res.json(body)
      return
    }
    const existing = (await pendingByPr(home)).get(key)
    if (existing !== undefined) {
      const body: CreatePendingPrReviewResponse = { id: existing, state: 'pending' }
      res.json(body)
      return
    }
    const pr = await viewPr(gh, ref)
    const created: PendingPrReview = { id: newPendingId(pr.title, new Date(now())), createdAt: new Date(now()).toISOString(), pr }
    await writePending(home, created)
    const body: CreatePendingPrReviewResponse = { id: created.id, state: 'pending' }
    res.json(body)
  })

  router.get('/pr-pending/:id', async (req, res) => {
    const pending = await readPending(home, req.params.id)
    const detail: PendingPrReviewDetail = { ...pending, checkouts: await checkoutsOf(home, pending.pr.repo) }
    res.json(detail)
  })

  router.delete('/pr-pending/:id', async (req, res) => {
    await deletePending(home, req.params.id)
    res.status(204).end()
  })

  return router
}

import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { AssignedPrsResponseSchema, GITHUB_DONE_FILE, PendingPrReviewDetailSchema, PendingPrReviewSchema, SESSION_ID_RE, StoreEventSchema } from '@scout/shared'
import { makePrComments } from '@scout/shared/testing/fixtures'
import { closeApp } from '../app.ts'
import { GhCommandError } from '../github/gh.ts'
import type { GhRunner } from '../github/gh.ts'
import { writeSettings } from '../settings.ts'
import { readPrStatusFile } from '../store/pr-status.ts'
import { FIXTURE_SESSION_ID, appFor, createFixtureStore, fixtureSessionDir } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'
import { listen, openSseReader } from '../testing/sse-client.ts'

const PR_URL = 'https://github.com/acme/web/pull/7'
const OTHER_URL = 'https://github.com/acme/web/pull/8'

const view = (number: number) => ({ number, title: `Fix thing ${number}`, url: `https://github.com/acme/web/pull/${number}`, author: { login: 'dev' }, isDraft: false, headRefName: 'fix', baseRefName: 'main' })
const listed = (number: number) => ({ ...view(number), createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-02T10:00:00Z', additions: 1, deletions: 1, changedFiles: 1, reviewRequests: [{ __typename: 'User', login: 'me' }] })

// The viewer's (and others') latest reviews per PR number, set by tests.
type MockReview = { author: { login: string }; state: string; submittedAt: string }
let reviewsOn: Record<number, MockReview[]> = {}
const myReview = (state: string, submittedAt: string): MockReview => ({ author: { login: 'Me' }, state, submittedAt })
let authorOn: Record<number, string> = {}
let viewCalls = 0
let reviewViews: string[] = []
const gh: GhRunner = async (args) => {
  if (args[0] === 'api') return 'me\n'
  if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify([7, 8].map((n) => ({ ...listed(n), author: { login: authorOn[n] ?? 'dev' }, latestReviews: reviewsOn[n] ?? [] })))
  if (args[0] === 'pr' && args[1] === 'view') {
    const url = args[2] as string
    if (args.includes('latestReviews')) {
      reviewViews.push(url)
      return JSON.stringify({ latestReviews: reviewsOn[Number(url.split('/').pop())] ?? [] })
    }
    viewCalls += 1
    if (url.endsWith('/404')) throw new GhCommandError('failed', { stderr: 'Could not resolve to a PullRequest', missing: false })
    return JSON.stringify(view(Number(url.split('/').pop())))
  }
  throw new Error(`unexpected gh ${args.join(' ')}`)
}

let store: FixtureStore
let app: Express
beforeAll(async () => {
  store = await createFixtureStore()
  app = appFor(store.home, { gh })
  await writeSettings(store.home, { worktreeFolders: [], github: { repos: ['acme/web'], teams: [] } })
})
afterAll(async () => {
  await closeApp(app)
  await store.cleanup()
})

const pendingFiles = async () => (await fs.readdir(path.join(store.home, 'pr-pending')).catch(() => [])).filter((n) => n.endsWith('.json'))

describe('pending PR reviews', () => {
  it('creates a placeholder once, lists it, reads it and deletes it', async () => {
    const created = await request(app).post('/api/pr-pending').send({ url: PR_URL })
    expect(created.status).toBe(200)
    expect(created.body.state).toBe('pending')
    expect(created.body.id).toMatch(SESSION_ID_RE)
    expect(created.body.id).toContain('-fix-thing-7-')
    const id = created.body.id as string

    const again = await request(app).post('/api/pr-pending').send({ url: `${PR_URL}/files` })
    expect(again.body).toEqual({ id, state: 'pending' })
    expect(viewCalls).toBe(1)
    expect(await pendingFiles()).toEqual([`${id}.json`])

    const list = await request(app).get('/api/pr-pending')
    expect(list.body).toHaveLength(1)
    expect(PendingPrReviewSchema.parse(list.body[0]).pr).toEqual({ url: PR_URL, repo: 'acme/web', number: 7, title: 'Fix thing 7', author: 'dev', isDraft: false, headRef: 'fix', baseRef: 'main' })

    const detail = await request(app).get(`/api/pr-pending/${id}`)
    expect(PendingPrReviewDetailSchema.parse(detail.body).checkouts).toEqual([])

    expect((await request(app).delete(`/api/pr-pending/${id}`)).status).toBe(204)
    expect((await request(app).delete(`/api/pr-pending/${id}`)).status).toBe(404)
    expect((await request(app).get(`/api/pr-pending/${id}`)).status).toBe(404)
    expect((await request(app).get('/api/pr-pending/not-an-id')).status).toBe(404)
    expect((await request(app).get('/api/pr-pending')).body).toEqual([])
  })

  it('lists newest first', async () => {
    const a = (await request(app).post('/api/pr-pending').send({ url: PR_URL })).body.id as string
    await new Promise((r) => setTimeout(r, 5))
    const b = (await request(app).post('/api/pr-pending').send({ url: OTHER_URL })).body.id as string
    expect((await request(app).get('/api/pr-pending')).body.map((p: { id: string }) => p.id)).toEqual([b, a])
    await request(app).delete(`/api/pr-pending/${a}`)
    await request(app).delete(`/api/pr-pending/${b}`)
  })

  it('rejects a bad body or URL with 400 and a gh failure with 502 and a reason', async () => {
    expect((await request(app).post('/api/pr-pending').send({})).status).toBe(400)
    expect((await request(app).post('/api/pr-pending').send({ url: 'https://example.com/a/b/pull/1' })).status).toBe(400)
    const failed = await request(app).post('/api/pr-pending').send({ url: 'https://github.com/acme/web/pull/404' })
    expect(failed.status).toBe(502)
    expect(failed.body.reason).toContain('Could not resolve')
    expect(await pendingFiles()).toEqual([])
  })
})

describe('GET /github/assigned', () => {
  it('attaches a pending placeholder, then the live session once one reviews the PR', async () => {
    const id = (await request(app).post('/api/pr-pending').send({ url: PR_URL })).body.id as string
    let res = await request(app).get('/api/github/assigned')
    let body = AssignedPrsResponseSchema.parse(res.body)
    expect(body.assignedToMe.map((p) => [p.number, p.session])).toEqual([[7, { id, state: 'pending' }], [8, null]])

    // A live PR-review session for the same PR wins over the placeholder and over the cache.
    const dir = fixtureSessionDir(store.home)
    const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')) as object
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ ...manifest, kind: 'pr-review' }))
    const comments = makePrComments([], { sessionId: FIXTURE_SESSION_ID })
    await fs.mkdir(path.join(dir, 'review'), { recursive: true })
    await fs.writeFile(path.join(dir, 'review', 'pr-comments.json'), JSON.stringify({ ...comments, pr: { ...comments.pr, url: 'https://github.com/Acme/Web/pull/7/' } }))
    res = await request(app).get('/api/github/assigned')
    body = AssignedPrsResponseSchema.parse(res.body)
    expect(body.assignedToMe[0]?.session).toEqual({ id: FIXTURE_SESSION_ID, state: 'live' })

    // Creating a placeholder for that PR answers with the live session.
    const live = await request(app).post('/api/pr-pending').send({ url: PR_URL })
    expect(live.body).toEqual({ id: FIXTURE_SESSION_ID, state: 'live' })

    await request(app).delete(`/api/pr-pending/${id}`)

    // A session started with `init --pr` links through its manifest before any report or comments exist.
    await fs.rm(path.join(dir, 'review', 'pr-comments.json'))
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ ...manifest, kind: 'pr-review', pr: { url: 'https://github.com/acme/web/pull/8' } }))
    body = AssignedPrsResponseSchema.parse((await request(app).get('/api/github/assigned')).body)
    expect(body.assignedToMe.map((p) => [p.number, p.session])).toEqual([[7, null], [8, { id: FIXTURE_SESSION_ID, state: 'live' }]])
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
  })
})

// Dates well before and after any real run of these tests.
const LONG_AGO = '2026-10-03T10:00:00Z'
const FAR_FUTURE = '2099-01-01T00:00:00Z'
const URL_9 = 'https://github.com/acme/web/pull/9'

const sessionIdFor = (n: number) => `20261001-100${n}-prreview-aaaa`
const created: string[] = []

/** A live PR review session for `url` (written into the store by hand, like `init --pr`). */
async function prSession(url: string, n = 1): Promise<string> {
  const id = sessionIdFor(n)
  const dir = fixtureSessionDir(store.home, id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ ...store.manifest, id, kind: 'pr-review', pr: { url } }))
  created.push(id)
  return id
}

const api = (route: string) => `/api${route}`
const assigned = async () => AssignedPrsResponseSchema.parse((await request(app).get(api('/github/assigned?refresh=1'))).body)
const pr = async (n: number) => {
  const found = (await assigned()).assignedToMe.find((p) => p.number === n)
  if (!found) throw new Error(`PR ${n} not listed`)
  return found
}
const statusOf = async (n: number) => (await pr(n)).status
const put = (route: string, body: unknown) => request(app).put(api(route)).send(body as object)
const reopen = (url: string) => request(app).post(api('/github/reopen')).send({ url })
const prStatusFile = async (id: string) => (await readPrStatusFile(fixtureSessionDir(store.home, id))) ?? (await readPrStatusFile(path.join(store.home, 'archive', id)))
const isArchived = async (id: string) => (await fs.stat(path.join(store.home, 'archive', id)).catch(() => null)) !== null
const isLive = async (id: string) => (await fs.stat(fixtureSessionDir(store.home, id)).catch(() => null)) !== null

afterEach(async () => {
  reviewsOn = {}
  authorOn = {}
  reviewViews = []
  for (const id of created.splice(0)) {
    await fs.rm(fixtureSessionDir(store.home, id), { recursive: true, force: true })
    await fs.rm(path.join(store.home, 'archive', id), { recursive: true, force: true })
  }
  await fs.rm(path.join(store.home, GITHUB_DONE_FILE), { force: true })
  for (const name of await pendingFiles()) await fs.rm(path.join(store.home, 'pr-pending', name))
})

describe('GET /github/assigned: other (Other)', () => {
  const MINE_URL = 'https://github.com/acme/web/pull/21'
  const other = async () => (await assigned()).other

  it('lists a live review whose PR is not in the GitHub list', async () => {
    const id = await prSession(MINE_URL)
    expect(await other()).toEqual([expect.objectContaining({ session: { id, state: 'live' }, status: 'in-progress', pr: { url: MINE_URL, repo: 'acme/web', number: 21 } })])
  })

  it('leaves out a review whose PR is assigned to you', async () => {
    await prSession(PR_URL)
    expect(await other()).toEqual([])
    expect((await pr(7)).session).toMatchObject({ state: 'live' })
  })

  it('lists a not-started placeholder for a PR no other section covers', async () => {
    const pending = (await request(app).post(api('/pr-pending')).send({ url: 'https://github.com/acme/web/pull/21' })).body.id as string
    expect(await other()).toEqual([expect.objectContaining({ session: { id: pending, state: 'pending' }, title: 'Fix thing 21', status: 'pending', pr: { url: MINE_URL, repo: 'acme/web', number: 21 } })])
  })

  it('leaves out an archived review of a PR no longer listed (merged, or not yours)', async () => {
    const archived = await prSession(MINE_URL, 5)
    await request(app).post(api(`/sessions/${archived}/archive`)).send({})
    const approved = await prSession('https://github.com/acme/web/pull/23', 7)
    expect((await put(`/sessions/${approved}/pr-status`, { status: 'approved' })).status).toBe(204)
    expect(await other()).toEqual([])
  })

  it('lists an archived review without a PR as archived', async () => {
    const id = sessionIdFor(8)
    const dir = fixtureSessionDir(store.home, id)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ ...store.manifest, id, kind: 'pr-review' }))
    created.push(id)
    await request(app).post(api(`/sessions/${id}/archive`)).send({})
    expect((await other()).map((row) => [row.session, row.status])).toEqual([[{ id, state: 'archived' }, 'archived']])
  })

  it('lists a review without a PR, with pr null', async () => {
    const id = sessionIdFor(8)
    const dir = fixtureSessionDir(store.home, id)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ ...store.manifest, id, kind: 'pr-review' }))
    created.push(id)
    expect(await other()).toEqual([expect.objectContaining({ session: { id, state: 'live' }, pr: null })])
  })

  it('shows one row per PR: a live review wins over an archived one', async () => {
    const old = await prSession(MINE_URL, 5)
    await request(app).post(api(`/sessions/${old}/archive`)).send({})
    const live = await prSession(MINE_URL, 6)
    expect((await other()).map((row) => row.session)).toEqual([{ id: live, state: 'live' }])
  })

  it('puts a PR you authored in authored, out of assignedToMe and the teams, and not again in other', async () => {
    await writeSettings(store.home, { worktreeFolders: [], github: { repos: ['acme/web'], teams: [{ id: 'web', name: 'Web', githubTeams: [], members: ['me'] }] } })
    try {
      authorOn[7] = 'ME'
      const id = await prSession(PR_URL, 5)
      const body = await assigned()
      expect(body.authored.map((p) => [p.number, p.session])).toEqual([[7, { id, state: 'live' }]])
      expect(body.assignedToMe.map((p) => p.number)).toEqual([8])
      expect(body.teams[0]?.prs.map((p) => p.number)).toEqual([8])
      expect(body.other).toEqual([])
    } finally {
      await writeSettings(store.home, { worktreeFolders: [], github: { repos: ['acme/web'], teams: [] } })
    }
  })

  it('is still returned when no repositories are followed', async () => {
    const id = await prSession(MINE_URL)
    await writeSettings(store.home, { worktreeFolders: [], github: { repos: [], teams: [] } })
    try {
      const body = await assigned()
      expect(body.problem).toBe('no-repos')
      expect(body.assignedToMe).toEqual([])
      expect(body.other.map((row) => row.session.id)).toEqual([id])
    } finally {
      await writeSettings(store.home, { worktreeFolders: [], github: { repos: ['acme/web'], teams: [] } })
    }
  })
})

describe('PR status rules', () => {
  it('is pending without a session, and with a not-started placeholder', async () => {
    expect(await pr(7)).toMatchObject({ status: 'pending', session: null })
    const id = (await request(app).post(api('/pr-pending')).send({ url: PR_URL })).body.id as string
    expect(await pr(7)).toMatchObject({ status: 'pending', session: { id, state: 'pending' } })
  })

  it('is in progress with a live session and no status, commented or approved by the session status', async () => {
    const id = await prSession(PR_URL)
    expect(await pr(7)).toMatchObject({ status: 'in-progress', session: { id, state: 'live' } })
    expect((await put(`/sessions/${id}/pr-status`, { status: 'commented' })).status).toBe(204)
    expect(await statusOf(7)).toBe('commented')
    expect((await put(`/sessions/${id}/pr-status`, { status: 'in-progress' })).status).toBe(204)
    expect(await statusOf(7)).toBe('in-progress')
  })

  it('is commented from your GitHub review, with or without a session', async () => {
    reviewsOn[7] = [myReview('COMMENTED', LONG_AGO)]
    expect(await pr(7)).toMatchObject({ status: 'commented', session: null })
    reviewsOn[7] = [myReview('CHANGES_REQUESTED', LONG_AGO)]
    expect(await statusOf(7)).toBe('commented')
    // A dismissed review says nothing.
    reviewsOn[7] = [myReview('DISMISSED', LONG_AGO)]
    expect(await statusOf(7)).toBe('pending')

    reviewsOn[7] = [myReview('COMMENTED', LONG_AGO)]
    const id = await prSession(PR_URL)
    expect(await pr(7)).toMatchObject({ status: 'commented', session: { id, state: 'live' } })
  })

  it('is approved from your GitHub approval when there is no session', async () => {
    reviewsOn[7] = [myReview('APPROVED', LONG_AGO)]
    expect(await pr(7)).toMatchObject({ status: 'approved', session: null })
  })

  it('is approved when anyone approved, yours or someone else\'s; comments do not close it', async () => {
    const other = (state: string, submittedAt: string): MockReview => ({ author: { login: 'someone' }, state, submittedAt })
    reviewsOn[7] = [other('COMMENTED', LONG_AGO)]
    expect(await statusOf(7)).toBe('pending')
    reviewsOn[7] = [other('APPROVED', LONG_AGO)]
    expect(await pr(7)).toMatchObject({ status: 'approved', session: null })
    reviewsOn[7] = [other('APPROVED', LONG_AGO), myReview('COMMENTED', LONG_AGO)]
    expect(await statusOf(7)).toBe('approved')
  })

  it('is approved on a PR you wrote when someone else approves it', async () => {
    authorOn[7] = 'me'
    reviewsOn[7] = [{ author: { login: 'someone' }, state: 'APPROVED', submittedAt: LONG_AGO }]
    expect((await assigned()).authored.map((p) => [p.number, p.status])).toEqual([[7, 'approved']])
  })

  it('lets an approval outrank a Done mark', async () => {
    reviewsOn[8] = [myReview('APPROVED', LONG_AGO)]
    expect((await put('/github/done', { url: OTHER_URL })).status).toBe(204)
    expect(await statusOf(8)).toBe('approved')
  })

  it('stops an earlier approval by someone else counting after a reopen, until they approve again', async () => {
    const other = (submittedAt: string): MockReview => ({ author: { login: 'someone' }, state: 'APPROVED', submittedAt })
    reviewsOn[8] = [other(LONG_AGO)]
    expect(await statusOf(8)).toBe('approved')
    expect((await reopen(OTHER_URL)).status).toBe(204)
    expect(await statusOf(8)).toBe('pending')
    reviewsOn[8] = [other(FAR_FUTURE)]
    expect(await statusOf(8)).toBe('approved')
  })

  it('is approved when the session status says so, and the session is archived', async () => {
    const id = await prSession(PR_URL)
    expect((await put(`/sessions/${id}/pr-status`, { status: 'approved' })).status).toBe(204)
    expect(await isArchived(id)).toBe(true)
    expect(await pr(7)).toMatchObject({ status: 'approved', session: { id, state: 'archived' } })
  })

  it('is done by a mark, with or without a session, and archives the session as Done', async () => {
    expect((await put('/github/done', { url: PR_URL })).status).toBe(204)
    expect(await pr(7)).toMatchObject({ status: 'done', session: null })
    await reopen(PR_URL)

    const id = await prSession(PR_URL)
    expect((await put('/github/done', { url: `${PR_URL}/` })).status).toBe(204)
    expect(await isArchived(id)).toBe(true)
    expect(await pr(7)).toMatchObject({ status: 'done', session: { id, state: 'archived' } })
  })

  it('is done for a session archived as Done, even without a mark', async () => {
    const id = await prSession(PR_URL)
    await request(app).post(api(`/sessions/${id}/archive`)).send({ done: true })
    expect(await pr(7)).toMatchObject({ status: 'done', session: { id, state: 'archived' } })
  })

  it('is archived for a session put away, until a placeholder starts it again', async () => {
    const id = await prSession(PR_URL)
    await request(app).post(api(`/sessions/${id}/archive`)).send({})
    expect(await pr(7)).toMatchObject({ status: 'archived', session: { id, state: 'archived' } })
    const pending = (await request(app).post(api('/pr-pending')).send({ url: PR_URL })).body.id as string
    expect(await pr(7)).toMatchObject({ status: 'pending', session: { id: pending, state: 'pending' } })
  })

  it('is ignored by a mark, which wins over Done and over approval', async () => {
    reviewsOn[8] = [myReview('APPROVED', LONG_AGO)]
    expect((await put('/github/ignored', { url: PR_URL })).status).toBe(204)
    expect((await put('/github/ignored', { url: OTHER_URL })).status).toBe(204)
    expect((await put('/github/done', { url: PR_URL })).status).toBe(204)
    expect(await statusOf(7)).toBe('ignored')
    expect(await statusOf(8)).toBe('ignored')
  })

  it('rejects a URL that is not a pull request, or a missing one, on done, ignored and reopen', async () => {
    for (const route of ['/github/done', '/github/ignored']) {
      expect((await put(route, { url: 'https://github.com/acme/web' })).status).toBe(400)
      expect((await put(route, {})).status).toBe(400)
    }
    expect((await reopen('https://github.com/acme/web')).status).toBe(400)
    expect((await request(app).post(api('/github/reopen')).send({})).status).toBe(400)
  })

  it('no longer has the DELETE routes for Done and Ignored', async () => {
    expect((await request(app).delete(api(`/github/done?url=${encodeURIComponent(PR_URL)}`))).status).toBeGreaterThanOrEqual(404)
    expect((await request(app).delete(api(`/github/ignored?url=${encodeURIComponent(PR_URL)}`))).status).toBeGreaterThanOrEqual(404)
  })
})

describe('POST /github/reopen', () => {
  it('takes off Done and Ignore marks', async () => {
    await put('/github/done', { url: PR_URL })
    await put('/github/ignored', { url: OTHER_URL })
    expect((await reopen(PR_URL)).status).toBe(204)
    expect((await reopen(OTHER_URL)).status).toBe(204)
    expect(await statusOf(7)).toBe('pending')
    expect(await statusOf(8)).toBe('pending')
  })

  it('brings back the archived review session', async () => {
    const id = await prSession(PR_URL)
    await put('/github/done', { url: PR_URL })
    expect(await isArchived(id)).toBe(true)
    expect((await reopen(PR_URL)).status).toBe(204)
    expect(await isLive(id)).toBe(true)
    expect(await isArchived(id)).toBe(false)
    expect(await pr(7)).toMatchObject({ status: 'in-progress', session: { id, state: 'live' } })
  })

  it('turns an approved session back into Commented', async () => {
    const id = await prSession(PR_URL)
    await put(`/sessions/${id}/pr-status`, { status: 'approved' })
    expect(await isArchived(id)).toBe(true)
    await reopen(PR_URL)
    expect(await isLive(id)).toBe(true)
    expect(await prStatusFile(id)).toMatchObject({ status: 'commented', by: 'you' })
    expect(await statusOf(7)).toBe('commented')
  })

  it('leaves a live session that was not approved alone', async () => {
    const id = await prSession(PR_URL)
    expect((await reopen(PR_URL)).status).toBe(204)
    expect(await prStatusFile(id)).toBeNull()
    expect(await statusOf(7)).toBe('in-progress')
  })

  it('is fine for a PR with nothing to reopen', async () => {
    expect((await reopen(PR_URL)).status).toBe(204)
    expect(await statusOf(7)).toBe('pending')
  })

  it('stops your past approvals closing the PR, but a later approval does', async () => {
    reviewsOn[8] = [myReview('APPROVED', LONG_AGO)]
    expect(await statusOf(8)).toBe('approved')
    expect((await reopen(OTHER_URL)).status).toBe(204)
    // The approval predates the reopen: it no longer counts, and the PR is not "commented" either.
    expect(await statusOf(8)).toBe('pending')
    // Approving again afterwards closes it again.
    reviewsOn[8] = [myReview('APPROVED', FAR_FUTURE)]
    expect(await statusOf(8)).toBe('approved')
  })

  it('does not close a reopened PR from a past approval even with a live session', async () => {
    const id = await prSession(OTHER_URL)
    reviewsOn[8] = [myReview('APPROVED', LONG_AGO)]
    // The pickup would approve (and archive) it; reopen it, and the next pickup sees a status newer than the review.
    await assigned()
    expect(await isArchived(id)).toBe(true)
    await reopen(OTHER_URL)
    expect(await isLive(id)).toBe(true)
    expect(await statusOf(8)).toBe('commented')
    expect(await isLive(id)).toBe(true)
  })
})

describe('PUT /sessions/:id/pr-status', () => {
  it('sets the status, stamped by you', async () => {
    const id = await prSession(PR_URL)
    const before = Date.now()
    expect((await put(`/sessions/${id}/pr-status`, { status: 'commented' })).status).toBe(204)
    const file = await prStatusFile(id)
    expect(file).toMatchObject({ status: 'commented', by: 'you' })
    expect(Date.parse(file?.setAt ?? '')).toBeGreaterThanOrEqual(before - 1000)
    expect(await isLive(id)).toBe(true)
  })

  it('archives the session when Approved, keeping the status', async () => {
    const id = await prSession(PR_URL)
    expect((await put(`/sessions/${id}/pr-status`, { status: 'approved' })).status).toBe(204)
    expect(await isLive(id)).toBe(false)
    expect(await isArchived(id)).toBe(true)
    expect(await prStatusFile(id)).toMatchObject({ status: 'approved', by: 'you' })
  })

  it('shows the status in the session list and in the archive list', async () => {
    const id = await prSession(PR_URL)
    await put(`/sessions/${id}/pr-status`, { status: 'commented' })
    const list = (await request(app).get(api('/sessions'))).body as { id: string; prStatus?: string }[]
    expect(list.find((s) => s.id === id)?.prStatus).toBe('commented')
    await put(`/sessions/${id}/pr-status`, { status: 'approved' })
    const archived = (await request(app).get(api('/sessions/archived'))).body as { id: string; prStatus?: string }[]
    expect(archived.find((s) => s.id === id)?.prStatus).toBe('approved')
  })

  it('rejects a session that is not a PR review, a bad status and a bad body with 400', async () => {
    expect((await put(`/sessions/${FIXTURE_SESSION_ID}/pr-status`, { status: 'commented' })).status).toBe(400)
    const id = await prSession(PR_URL)
    expect((await put(`/sessions/${id}/pr-status`, { status: 'done' })).status).toBe(400)
    expect((await put(`/sessions/${id}/pr-status`, { status: 'pending' })).status).toBe(400)
    expect((await put(`/sessions/${id}/pr-status`, {})).status).toBe(400)
    // A bare JSON string, sent as JSON so the server reads the whole body (a form-encoded string could reset the socket).
    expect((await request(app).put(api(`/sessions/${id}/pr-status`)).set('Content-Type', 'application/json').send('"commented"')).status).toBe(400)
    expect(await prStatusFile(id)).toBeNull()
  })

  it('is 404 for a missing session', async () => {
    expect((await put('/sessions/20261001-1009-missing-aaaa/pr-status', { status: 'commented' })).status).toBe(404)
  })
})

describe('review pickup on GET /github/assigned', () => {
  it('replaces a manual status with a newer GitHub review, but not with an older one', async () => {
    const id = await prSession(PR_URL)
    // You set Commented now; your GitHub review is older than that, so nothing changes.
    await put(`/sessions/${id}/pr-status`, { status: 'in-progress' })
    reviewsOn[7] = [myReview('COMMENTED', LONG_AGO)]
    await assigned()
    expect(await prStatusFile(id)).toMatchObject({ status: 'in-progress', by: 'you' })
    expect(await statusOf(7)).toBe('commented')

    // A review submitted after that wins and is stamped with the review's time.
    reviewsOn[7] = [myReview('CHANGES_REQUESTED', FAR_FUTURE)]
    await assigned()
    expect(await prStatusFile(id)).toEqual({ status: 'commented', setAt: FAR_FUTURE, by: 'github' })
  })

  it('does not rewrite a status it already picked up', async () => {
    const id = await prSession(PR_URL)
    reviewsOn[7] = [myReview('COMMENTED', LONG_AGO)]
    await assigned()
    expect(await prStatusFile(id)).toEqual({ status: 'commented', setAt: LONG_AGO, by: 'github' })
    await put(`/sessions/${id}/pr-status`, { status: 'in-progress' })
    await assigned()
    // Your later manual choice stays.
    expect(await prStatusFile(id)).toMatchObject({ status: 'in-progress', by: 'you' })
  })

  it('closes the live session when your approval is picked up', async () => {
    const id = await prSession(PR_URL)
    reviewsOn[7] = [myReview('APPROVED', LONG_AGO)]
    const body = await assigned()
    expect(await isArchived(id)).toBe(true)
    expect(await prStatusFile(id)).toEqual({ status: 'approved', setAt: LONG_AGO, by: 'github' })
    expect(body.assignedToMe.find((p) => p.number === 7)).toMatchObject({ status: 'approved', session: { id, state: 'archived' } })
  })

  it('ignores a dismissed review and other people\'s reviews', async () => {
    const id = await prSession(PR_URL)
    reviewsOn[7] = [myReview('DISMISSED', FAR_FUTURE), { author: { login: 'other' }, state: 'APPROVED', submittedAt: FAR_FUTURE }]
    await assigned()
    expect(await prStatusFile(id)).toBeNull()
    expect(await isLive(id)).toBe(true)
  })

  it('asks gh pr view for a PR that is not in the assigned list', async () => {
    const id = await prSession(URL_9, 2)
    reviewsOn[9] = [myReview('COMMENTED', LONG_AGO)]
    await assigned()
    expect(reviewViews).toEqual([URL_9])
    expect(await prStatusFile(id)).toEqual({ status: 'commented', setAt: LONG_AGO, by: 'github' })
  })

  it('does not ask gh pr view for PRs in the assigned list, and skips a PR GitHub cannot answer for', async () => {
    await prSession(PR_URL)
    const missing = await prSession('https://github.com/acme/web/pull/404', 3)
    await assigned()
    expect(reviewViews).toEqual(['https://github.com/acme/web/pull/404'])
    expect(await prStatusFile(missing)).toBeNull()
  })
})

describe('session.updated for pr-status.json', () => {
  it('is emitted when the status file is written', async () => {
    const server = await listen(app)
    const reader = await openSseReader(`${server.url}/api/events`)
    await reader.waitFor((m) => m.kind === 'comment' && m.text === 'ready')
    const isEvent = (type: string, id: string) => (m: { kind: string; data?: string }) => {
      if (m.kind !== 'event' || m.data === undefined) return false
      const event = StoreEventSchema.parse(JSON.parse(m.data))
      return event.type === type && 'sessionId' in event && event.sessionId === id
    }
    try {
      // An id no earlier test used: the watcher may still be settling a reused one.
      const id = await prSession(PR_URL, 9)
      // Wait until the watcher knows the session, so the status file counts as a change of a watched one.
      await reader.waitFor(isEvent('session.added', id), { timeoutMs: 15_000 })
      const from = reader.messages.length
      await put(`/sessions/${id}/pr-status`, { status: 'commented' })
      await reader.waitFor(isEvent('session.updated', id), { from, timeoutMs: 15_000 })
    } finally {
      reader.close()
      await server.close()
    }
  })
})

describe('pending checkouts', () => {
  it('lists local checkouts whose origin is the PR repo, main checkout first', async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'scout-checkouts-')))
    const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e.test', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e.test' }
    const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, stdio: 'pipe' })
    const main = path.join(root, 'main')
    const other = path.join(root, 'other')
    const wts = path.join(root, 'wts')
    await fs.mkdir(wts, { recursive: true })
    for (const [dir, remote] of [[main, 'git@github.com:Acme/Web.git'], [other, 'https://github.com/acme/api.git']] as const) {
      await fs.mkdir(dir)
      git(dir, 'init', '-q', '-b', 'main')
      git(dir, 'commit', '-q', '--allow-empty', '-m', 'init')
      git(dir, 'remote', 'add', 'origin', remote)
    }
    git(main, 'worktree', 'add', '-q', path.join(wts, 'feature'), '-b', 'feature')
    git(other, 'worktree', 'add', '-q', path.join(wts, 'other-feature'), '-b', 'other-feature')
    await writeSettings(store.home, { worktreeFolders: [wts], github: { repos: ['acme/web'], teams: [] } })

    const id = (await request(app).post('/api/pr-pending').send({ url: PR_URL })).body.id as string
    // The fixture session from the previous test is still live; a placeholder is only written for a PR without one.
    const target = id === FIXTURE_SESSION_ID ? (await request(app).post('/api/pr-pending').send({ url: OTHER_URL })).body.id : id
    const detail = await request(app).get(`/api/pr-pending/${target}`)
    expect(detail.body.checkouts).toEqual([main, path.join(wts, 'feature')])
    await request(app).delete(`/api/pr-pending/${target}`)
    await fs.rm(root, { recursive: true, force: true })
  })
})

describe('pr-pending.updated', () => {
  it('is emitted when a placeholder is added, changed and removed', async () => {
    const server = await listen(app)
    const reader = await openSseReader(`${server.url}/api/events`)
    await reader.waitFor((m) => m.kind === 'comment' && m.text === 'ready')
    const isPending = (m: { kind: string; data?: string }) => m.kind === 'event' && m.data !== undefined && StoreEventSchema.parse(JSON.parse(m.data)).type === 'pr-pending.updated'
    try {
      let from = reader.messages.length
      const id = (await request(app).post('/api/pr-pending').send({ url: OTHER_URL })).body.id as string
      await reader.waitFor(isPending, { from, timeoutMs: 5000 })
      from = reader.messages.length
      await request(app).delete(`/api/pr-pending/${id}`)
      await reader.waitFor(isPending, { from, timeoutMs: 5000 })
    } finally {
      reader.close()
      await server.close()
    }
  })
})

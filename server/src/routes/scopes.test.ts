import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import type { CommitList, StoreEvent, WorkingTree } from '@review-dash/shared'
import { CommitListSchema, WorkingTreeSchema } from '@review-dash/shared'
import { appServices, closeApp } from '../app.ts'
import { FIXTURE_SESSION_ID, appFor, createFixtureStore } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'

let store: FixtureStore
let app: Express
let commits: CommitList
let featureSha: string
beforeAll(async () => {
  store = await createFixtureStore()
  app = appFor(store.home)
  const res = await request(app).get(`${base}/commits`)
  commits = CommitListSchema.parse(res.body)
  featureSha = commits.commits[0]?.sha ?? ''
})
afterAll(async () => {
  await closeApp(app)
  await store.cleanup()
})

const base = `/api/sessions/${FIXTURE_SESSION_ID}`
const FOREIGN_SHA = 'f'.repeat(40)

describe('GET /api/sessions/:id/commits', () => {
  it('lists the branch commit with its stats, no remote ref and the uncommitted stats', async () => {
    expect(commits.branch).toBe('feature/fixture')
    expect(commits.baseRef).toBe('origin/master')
    expect(commits.commits.map((c) => [c.subject, c.pushed, c.merge, c.stats])).toEqual([['feature work', false, false, { files: 3, additions: 1, deletions: 1 }]])
    expect(commits.remote).toEqual({ ref: null, ahead: 1, behind: 0 })
    expect(commits.uncommitted).toEqual({ files: 5, additions: 6, deletions: 3 })
  })

  it('answers 404 for an unknown session', async () => {
    expect((await request(app).get('/api/sessions/20260101-0900-missing-0000/commits')).status).toBe(404)
  })
})

describe('GET /api/sessions/:id/scopes/:scope', () => {
  it('serves the commit scope: parent → commit, no untracked files, branch null', async () => {
    const res = await request(app).get(`${base}/scopes/${featureSha}`)
    expect(res.status).toBe(200)
    const tree = WorkingTreeSchema.parse(res.body)
    expect(tree).toMatchObject({ baseRef: `${featureSha}^1`, baseSha: commits.baseSha, headSha: featureSha, branch: null, dirty: false })
    expect(tree.files.map((f) => [f.path, f.status, f.oldPath])).toEqual([
      ['src/new.ts', 'added', null],
      ['src/old.ts', 'deleted', null],
      ['src/renamed.ts', 'renamed', 'src/original.ts'],
    ])
    expect(tree.files.every((f) => !f.untracked)).toBe(true)
  })

  it('serves the uncommitted scope: HEAD → working tree with untracked files', async () => {
    const res = await request(app).get(`${base}/scopes/uncommitted`)
    expect(res.status).toBe(200)
    const tree: WorkingTree = WorkingTreeSchema.parse(res.body)
    expect(tree).toMatchObject({ baseRef: 'HEAD', baseSha: commits.headSha, headSha: commits.headSha, dirty: true })
    expect(tree.files.map((f) => [f.path, f.status, f.untracked])).toEqual([
      ['assets/logo.png', 'modified', false],
      ['big.bin', 'added', true],
      ['package-lock.json', 'modified', false],
      ['src/app.ts', 'modified', false],
      ['src/untracked.ts', 'added', true],
    ])
  })

  it('answers 404 for a sha outside baseSha..HEAD and 400 for a malformed scope', async () => {
    const foreign = await request(app).get(`${base}/scopes/${FOREIGN_SHA}`)
    expect(foreign.status).toBe(404)
    expect(foreign.body.error).toMatch(/not in/)
    const baseCommit = await request(app).get(`${base}/scopes/${commits.baseSha}`)
    expect(baseCommit.status).toBe(404)
    for (const bad of ['HEAD', 'abc123', featureSha.slice(0, 12), 'Uncommitted']) {
      const res = await request(app).get(`${base}/scopes/${bad}`)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.stringContaining('scope must be') })
    }
    expect((await request(app).get(`/api/sessions/20260101-0900-missing-0000/scopes/uncommitted`)).status).toBe(404)
  })
})

describe('GET /api/sessions/:id/scopes/:scope/files/*path/patch', () => {
  it('serves the per-file patch of a commit, including the rename', async () => {
    const res = await request(app).get(`${base}/scopes/${featureSha}/files/src/renamed.ts/patch`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(res.text).toContain('rename from src/original.ts')
    expect((await request(app).get(`${base}/scopes/${featureSha}/files/src/untracked.ts/patch`)).status).toBe(404)
    expect((await request(app).get(`${base}/scopes/${FOREIGN_SHA}/files/src/app.ts/patch`)).status).toBe(404)
    expect((await request(app).get(`${base}/scopes/nope/files/src/app.ts/patch`)).status).toBe(400)
  })

  it('answers 413 for a collapsed file of the uncommitted scope unless ?force=1, and 410 for an omitted one', async () => {
    const refused = await request(app).get(`${base}/scopes/uncommitted/files/package-lock.json/patch`)
    expect(refused.status).toBe(413)
    expect(refused.body).toEqual({ error: expect.stringMatching(/generated-or-vendored.*force=1/), isLarge: true })
    const forced = await request(app).get(`${base}/scopes/uncommitted/files/package-lock.json/patch?force=1`)
    expect(forced.status).toBe(200)
    expect(forced.text).toContain('+++ b/package-lock.json')
    expect((await request(app).get(`${base}/scopes/uncommitted/files/big.bin/patch`)).status).toBe(410)
  })
})

describe('GET /api/sessions/:id/scopes/:scope/files/*path/contents', () => {
  it('reads both sides of a commit from blobs and the after side of uncommitted from disk', async () => {
    const before = await request(app).get(`${base}/scopes/${featureSha}/files/src/renamed.ts/contents?side=before`)
    expect(before.status).toBe(200)
    expect(before.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(before.headers['x-content-type-options']).toBe('nosniff')
    expect(before.text).toContain('export function original')
    const after = await request(app).get(`${base}/scopes/${featureSha}/files/src/new.ts/contents?side=after`)
    expect(after.text).toBe('export const fresh = true\n')
    // src/app.ts is only modified in the working tree: not part of the commit scope.
    expect((await request(app).get(`${base}/scopes/${featureSha}/files/src/app.ts/contents?side=after`)).status).toBe(404)
    const appAfter = await request(app).get(`${base}/scopes/uncommitted/files/src/app.ts/contents?side=after`)
    expect(appAfter.text).toContain("'v2'")
    expect((await request(app).get(`${base}/scopes/uncommitted/files/src/app.ts/contents?side=before`)).text).toContain("'v1'")
    expect((await request(app).get(`${base}/scopes/${featureSha}/files/src/new.ts/contents?side=before`)).status).toBe(404)
    expect((await request(app).get(`${base}/scopes/${featureSha}/files/src/old.ts/contents?side=after`)).status).toBe(404)
    expect((await request(app).get(`${base}/scopes/${featureSha}/files/src/new.ts/contents?side=sideways`)).status).toBe(400)

    const untracked = await request(app).get(`${base}/scopes/uncommitted/files/src/untracked.ts/contents?side=after`)
    expect(untracked.status).toBe(200)
    expect(untracked.text).toBe('export const untracked = 1\n')
    const lockBefore = await request(app).get(`${base}/scopes/uncommitted/files/package-lock.json/contents?side=before`)
    expect(lockBefore.text).not.toContain('node_modules/x')
  })
})

describe('tree.updated on remote ref changes', () => {
  it('fires when only the remote-tracking ref moves, and the commit list then shows the commit pushed', async () => {
    const { bus, watcher } = appServices(app)
    await watcher.ready
    const events: StoreEvent[] = []
    bus.subscribe((e) => void events.push(e))
    const fingerprintBefore = commits.fingerprint
    // Simulates a push: a remote-tracking ref for the branch appears at HEAD.
    await store.repo.git(['update-ref', 'refs/remotes/origin/feature/fixture', 'HEAD'])
    const deadline = Date.now() + 5000
    while (Date.now() < deadline && !events.some((e) => e.type === 'tree.updated')) await new Promise((resolve) => setTimeout(resolve, 50))
    expect(events.filter((e) => e.type === 'tree.updated')).toHaveLength(1)
    const res = await request(app).get(`${base}/commits`)
    const after = CommitListSchema.parse(res.body)
    expect(after.remote).toEqual({ ref: 'origin/feature/fixture', ahead: 0, behind: 0 })
    expect(after.commits.map((c) => c.pushed)).toEqual([true])
    expect(after.fingerprint).not.toBe(fingerprintBefore)
    const tree = await request(app).get(base)
    expect(tree.body.tree.fingerprint).toBe(events.find((e) => e.type === 'tree.updated')?.fingerprint)
  })
})

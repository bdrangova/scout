import fs from 'node:fs/promises'
import path from 'node:path'
import { CodeReviewDetailSchema, SessionListItemSchema, SessionSummarySchema } from '@scout/shared'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { closeApp } from '../app.ts'
import { BROKEN_SESSION_ID, FIXTURE_SESSION_ID, FIXTURE_T0, appFor, createFixtureStore, fixtureSessionDir } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'

let store: FixtureStore
let app: Express
beforeAll(async () => {
  store = await createFixtureStore()
  app = appFor(store.home)
})
afterAll(async () => {
  await closeApp(app)
  await store.cleanup()
})

describe('GET /api/sessions', () => {
  it('lists the fixture session as a summary (live tree stats) and the broken folder with its error', async () => {
    const res = await request(app).get('/api/sessions')
    expect(res.status).toBe(200)
    const items = res.body as unknown[]
    expect(items.map((item) => SessionListItemSchema.parse(item))).toHaveLength(2)
    expect((items[0] as { id: string }).id).toBe(FIXTURE_SESSION_ID)

    const summary = SessionSummarySchema.parse(items[0])
    expect(summary).toMatchObject({
      id: FIXTURE_SESSION_ID,
      title: 'Fixture session',
      tickets: [{ key: 'QI-1', url: null }],
      repo: { path: store.repo.repo, branch: 'feature/fixture' },
      status: 'unreviewed',
      progress: { reviewed: 0, total: 8 },
      openComments: 0,
    })
    expect(summary.stats.files).toBe(8)
    expect(summary.stats.additions).toBeGreaterThan(0)
    expect(summary.stats.deletions).toBeGreaterThan(0)
    expect(Date.parse(summary.updatedAt)).toBeGreaterThan(Date.parse(FIXTURE_T0))
    expect(summary).not.toHaveProperty('createdAt')
    expect(summary).not.toHaveProperty('currentRevision')

    const broken = items[1] as { id: string; error: string }
    expect(broken.id).toBe(BROKEN_SESSION_ID)
    expect(broken.error).toMatch(/manifest\.json is invalid/)
  })

  it('reports a session whose repo is gone as an error item instead of failing the list', async () => {
    const goneId = '20260103-1200-gone-cafe'
    const dir = fixtureSessionDir(store.home, goneId)
    const missingRepo = path.join(store.home, 'no-such-repo')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ ...store.manifest, id: goneId, repo: { ...store.manifest.repo, path: missingRepo } }))
    try {
      const res = await request(app).get('/api/sessions')
      const gone = (res.body as { id: string; error?: string }[]).find((item) => item.id === goneId)
      expect(gone?.error).toBe(`repo-missing: ${missingRepo}`)
      const detail = await request(app).get(`/api/sessions/${goneId}`)
      expect(detail.status).toBe(422)
      expect(detail.body.error).toBe(`repo-missing: ${missingRepo}`)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('GET /api/sessions/:id', () => {
  it('returns the SessionDetail with the live tree, derived artifacts, status and PR description', async () => {
    const res = await request(app).get(`/api/sessions/${FIXTURE_SESSION_ID}`)
    expect(res.status).toBe(200)
    const detail = CodeReviewDetailSchema.parse(res.body)
    expect(detail.manifest.id).toBe(FIXTURE_SESSION_ID)
    expect(detail.manifest.repo.baseRef).toBe('origin/master')
    expect(detail.tree.baseRef).toBe('origin/master')
    expect(detail.tree.branch).toBe('feature/fixture')
    expect(detail.tree.dirty).toBe(true)
    expect(detail.tree.headSha).not.toBe(detail.tree.baseSha)
    expect(detail.tree.files.map((f) => [f.path, f.status, f.oldPath, f.binary, f.untracked, f.collapsed, f.omitted])).toEqual([
      ['assets/logo.png', 'modified', null, true, false, false, false],
      ['big.bin', 'added', null, false, true, true, true],
      ['package-lock.json', 'modified', null, false, false, true, false],
      ['src/app.ts', 'modified', null, false, false, false, false],
      ['src/new.ts', 'added', null, false, false, false, false],
      ['src/old.ts', 'deleted', null, false, false, false, false],
      ['src/renamed.ts', 'renamed', 'src/original.ts', false, false, false, false],
      ['src/untracked.ts', 'added', null, false, true, false, false],
    ])
    expect(detail.tree.files.find((f) => f.path === 'package-lock.json')?.collapseReason).toBe('generated-or-vendored')
    expect(detail.tree.files.find((f) => f.path === 'big.bin')?.omitReason).toBe('too-large')
    expect(detail.tree.stats).toMatchObject({ files: 8, added: 3, modified: 3, deleted: 1, renamed: 1, binary: 1, collapsed: 2, omitted: 1 })

    expect(detail.evidence).toEqual([
      { path: 'flow.webm', type: 'video', caption: 'Checkout flow', description: 'Full run', order: 0 },
      { path: 'shot.png', type: 'image', caption: 'shot.png', description: null, order: 1 },
    ])
    expect(detail.extras).toEqual([
      { path: 'diagrams/flow.mmd', type: 'mermaid', title: 'flow.mmd' },
      { path: 'notes.md', type: 'markdown', title: 'Fixture notes' },
      { path: 'report.html', type: 'html', title: 'Fixture report' },
    ])
    expect(detail.spec).toEqual([
      { path: 'jira.md', type: 'jira', title: 'QI-1 Fixture ticket', url: 'https://example.atlassian.net/browse/QI-1', sourcePath: null, capturedAt: FIXTURE_T0 },
      { path: 'plan.md', type: 'markdown', title: 'Plan', url: null, sourcePath: null, capturedAt: null },
    ])
    expect(detail.prDescription).toContain('# Fixture change')
    expect(detail.status).toBe('unreviewed')
    expect(detail.progress).toEqual({ reviewed: 0, total: 8 })
  })

  it('serves the second request from the cache (same computedAt and fingerprint)', async () => {
    const first = CodeReviewDetailSchema.parse((await request(app).get(`/api/sessions/${FIXTURE_SESSION_ID}`)).body)
    const second = CodeReviewDetailSchema.parse((await request(app).get(`/api/sessions/${FIXTURE_SESSION_ID}`)).body)
    expect(second.tree.computedAt).toBe(first.tree.computedAt)
    expect(second.tree.fingerprint).toBe(first.tree.fingerprint)
  })

  it('answers 404 for unknown and malformed ids and 422 for an invalid manifest', async () => {
    expect((await request(app).get('/api/sessions/20260101-0900-missing-0000')).status).toBe(404)
    expect((await request(app).get('/api/sessions/not-an-id')).status).toBe(404)
    expect((await request(app).get('/api/sessions/..')).status).toBe(404)
    const res = await request(app).get(`/api/sessions/${BROKEN_SESSION_ID}`)
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/manifest\.json is invalid/)
  })
})

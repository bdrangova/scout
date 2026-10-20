import fs from 'node:fs'
import path from 'node:path'
import { ReviewResponseSchema, SCHEMA_VERSION, SendResponseSchema, SentSnapshotSchema, renderSentMarkdown } from '@review-dash/shared'
import type { Resolutions, Review, SessionDetail } from '@review-dash/shared'
import { makeComment, makeReview } from '@review-dash/shared/testing/fixtures'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { appServices, closeApp } from '../app.ts'
import { FIXTURE_SESSION_ID, appFor, createFixtureStore } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'

let store: FixtureStore
let app: Express
let detail: SessionDetail
beforeAll(async () => {
  store = await createFixtureStore()
  app = appFor(store.home, { fake: { delayMs: 0 } })
  detail = (await request(app).get(`/api/sessions/${FIXTURE_SESSION_ID}`)).body as SessionDetail
})
afterAll(async () => {
  await closeApp(app)
  await store.cleanup()
})

const url = `/api/sessions/${FIXTURE_SESSION_ID}/review`

function fingerprintOf(filePath: string): string {
  const file = detail.tree.files.find((f) => f.path === filePath)
  if (!file) throw new Error(`no ${filePath} in the tree`)
  return file.fingerprint
}

function draft(): Review {
  const r = makeReview({
    sessionId: FIXTURE_SESSION_ID,
    comments: [
      makeComment({ id: 'c1', target: { kind: 'file', ref: 'src/old.ts' }, body: 'Keep this file.' }),
      makeComment({ id: 'c2', target: { kind: 'evidence', ref: 'flow.webm' }, body: 'Colours look off.', timestampSec: 12 }),
      makeComment({ id: 'c3', target: { kind: 'overall', ref: null }, body: 'Already handled.' }),
      makeComment({ id: 'c4', target: { kind: 'spec', ref: 'jira.md' }, body: 'Scope creep?' }),
    ],
  })
  r.files['src/app.ts'] = { verdict: 'approved', fingerprint: fingerprintOf('src/app.ts'), viewed: true }
  r.files['src/old.ts'] = { verdict: 'rejected', fingerprint: fingerprintOf('src/old.ts'), viewed: true }
  return r
}

describe('POST /api/sessions/:id/review/send', () => {
  it('answers 400 when there is nothing to send, on an invalid body, and 404 for unknown sessions', async () => {
    const nothing = await request(app).post(`${url}/send`).send({ decision: 'undecided', dispatch: false })
    expect(nothing.status).toBe(400)
    expect(nothing.body.error).toMatch(/nothing to send/)
    expect(fs.existsSync(path.join(store.dir, 'review', 'sent'))).toBe(false)

    const invalid = await request(app).post(`${url}/send`).send({ decision: 'ship-it', dispatch: false })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error).toMatch(/invalid SendRequest/)

    const missing = await request(app).post('/api/sessions/20260101-0900-missing-0000/review/send').send({ decision: 'approve', dispatch: false })
    expect(missing.status).toBe(404)
  })

  it('writes the .json, .md and .patch, stamps review.json and skips resolved comments', async () => {
    expect((await request(app).put(url).send({ review: draft(), baseUpdatedAt: null })).status).toBe(200)
    const resolutions: Resolutions = {
      schemaVersion: SCHEMA_VERSION,
      sessionId: FIXTURE_SESSION_ID,
      updatedAt: '2026-01-02T00:00:00.000Z',
      comments: { c3: { status: 'resolved', note: 'done earlier', at: '2026-01-02T00:00:00.000Z', files: [] } },
    }
    fs.mkdirSync(path.join(store.dir, 'review'), { recursive: true })
    fs.writeFileSync(path.join(store.dir, 'review', 'resolutions.json'), JSON.stringify(resolutions))

    const res = await request(app).post(`${url}/send`).send({ decision: 'request-changes', dispatch: false })
    expect(res.status).toBe(200)
    const body = SendResponseSchema.parse(res.body)
    expect(body.run).toBeNull()
    expect(body.pending).toBeNull()
    const { sent } = body
    expect(sent.comments.map((c) => c.id)).toEqual(['c1', 'c2', 'c4'])
    expect(sent.comments.every((c) => c.sentAt === sent.sentAt)).toBe(true)
    expect(sent).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      sessionId: FIXTURE_SESSION_ID,
      decision: 'request-changes',
      tree: { baseSha: detail.tree.baseSha, headSha: detail.tree.headSha, branch: 'feature/fixture' },
      files: [
        { path: 'src/app.ts', verdict: 'approved', fingerprint: fingerprintOf('src/app.ts'), status: 'modified' },
        { path: 'src/old.ts', verdict: 'rejected', fingerprint: fingerprintOf('src/old.ts'), status: 'deleted' },
      ],
      counts: { files: 8, approved: 1, rejected: 1, commented: 0, unreviewed: 6, openComments: 3 },
    })

    const stem = sent.sentAt.replaceAll(':', '-')
    const sentDir = path.join(store.dir, 'review', 'sent')
    expect(sent.patchPath).toBe(`review/sent/${stem}.patch`)
    expect(SentSnapshotSchema.parse(JSON.parse(fs.readFileSync(path.join(sentDir, `${stem}.json`), 'utf8')))).toEqual(sent)
    const markdown = fs.readFileSync(path.join(sentDir, `${stem}.md`), 'utf8')
    expect(markdown).toBe(
      renderSentMarkdown(sent, { title: 'Fixture session', dashboardUrl: 'http://127.0.0.1:4546', evidence: detail.evidence, extras: detail.extras, spec: detail.spec }),
    )
    expect(markdown).toContain(`Dashboard: http://127.0.0.1:4546/s/${FIXTURE_SESSION_ID}`)
    expect(markdown).toContain('### src/old.ts — REJECTED')
    expect(markdown).toContain('### flow.webm — Checkout flow')
    expect(markdown).toContain('### jira.md — QI-1 Fixture ticket')
    expect(markdown).toContain(sent.patchPath)
    expect(markdown).not.toContain('Already handled.')
    const patch = fs.readFileSync(path.join(sentDir, `${stem}.patch`), 'utf8')
    expect(patch).toBe((await request(app).get(`/api/sessions/${FIXTURE_SESSION_ID}/patch`)).text)
    expect(patch).toContain('diff --git a/src/app.ts b/src/app.ts')

    const after = ReviewResponseSchema.parse((await request(app).get(url)).body)
    expect(after.review.sent).toEqual({ at: sent.sentAt, decision: 'request-changes' })
    expect(after.review.overall.decision).toBe('request-changes')
    expect(after.review.comments.map((c) => [c.id, c.sentAt])).toEqual([
      ['c1', sent.sentAt],
      ['c2', sent.sentAt],
      ['c3', null],
      ['c4', sent.sentAt],
    ])
    expect(after.review.updatedAt >= sent.sentAt).toBe(true)

    const summary = (await request(app).get('/api/sessions')).body.find((s: { id: string }) => s.id === FIXTURE_SESSION_ID)
    expect(summary).toMatchObject({ status: 'sent', openComments: 3, lastSend: { at: sent.sentAt, decision: 'request-changes' } })
  })

  it('starts a run when dispatching with the fake adapter, reports pending while one is active, then shows the session as updated', async () => {
    const res = await request(app).post(`${url}/send`).send({ decision: 'request-changes', dispatch: true })
    expect(res.status).toBe(200)
    const body = SendResponseSchema.parse(res.body)
    expect(body.pending).toBeNull()
    expect(body.run).toMatchObject({ status: 'running', adapter: 'fake', sentAt: body.sent.sentAt })
    if (!body.run) throw new Error('expected a run')

    const again = await request(app).post(`${url}/send`).send({ decision: 'request-changes', dispatch: true })
    const second = SendResponseSchema.parse(again.body)
    if (second.run === null) expect(second.pending?.reason).toMatch(/still active/)

    const final = await appServices(app).runs.wait(body.run.id)
    expect(final).toMatchObject({ status: 'succeeded', costUsd: 0.42 })
    expect(final?.resolvedComments).toEqual(expect.arrayContaining(['c1', 'c2', 'c4']))
    const merged = ReviewResponseSchema.parse((await request(app).get(url)).body)
    expect(merged.comments.filter((c) => c.status === 'open')).toEqual([])
    // The agent answered after the send: resolutions.updatedAt > sent.at.
    const summary = (await request(app).get('/api/sessions')).body.find((s: { id: string }) => s.id === FIXTURE_SESSION_ID)
    expect(summary).toMatchObject({ status: 'updated', openComments: 0 })
    // The fixture repo lives outside AI_REVIEW_HOME, so the fake adapter must not have touched it.
    expect(fs.readFileSync(path.join(store.repo.repo, 'README.md'), 'utf8')).toBe('# Fixture repo\n')
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FINGERPRINT_RE, SCHEMA_VERSION, SendResponseSchema, SessionListItemSchema, TestRunDetailSchema, TestRunSentSnapshotSchema, TestRunSummarySchema, emptyReview } from '@scout/shared'
import type { Resolutions, Review, TestRunDetail } from '@scout/shared'
import { makeComment } from '@scout/shared/testing/fixtures'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { appServices, closeApp } from '../app.ts'
import { FIXTURE_SESSION_ID, TEST_RUN_SESSION_ID, appFor, createFixtureStore } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'

const base = `/api/sessions/${TEST_RUN_SESSION_ID}`
const runFile = (ref: string) => `${base}/run/file/${ref}`

async function detailOf(app: Express): Promise<TestRunDetail> {
  const res = await request(app).get(base)
  expect(res.status).toBe(200)
  return TestRunDetailSchema.parse(res.body)
}

function nextRunUpdate(app: Express, timeoutMs = 10_000): Promise<void> {
  const { bus } = appServices(app)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error('no testrun.updated event'))
    }, timeoutMs)
    const unsubscribe = bus.subscribe((event) => {
      if (event.type === 'testrun.updated' && event.sessionId === TEST_RUN_SESSION_ID) {
        clearTimeout(timer)
        unsubscribe()
        resolve()
      }
    })
  })
}

describe('test-run sessions', () => {
  let store: FixtureStore
  let app: Express
  beforeAll(async () => {
    store = await createFixtureStore({ testRun: true })
    app = appFor(store.home)
    await appServices(app).watcher.ready
  })
  afterAll(async () => {
    await closeApp(app)
    await store.cleanup()
  })

  describe('listing and detail', () => {
    it('lists both kinds and filters with ?kind=', async () => {
      const all = (await request(app).get('/api/sessions')).body as unknown[]
      expect(all.map((item) => SessionListItemSchema.parse(item))).toHaveLength(3)
      const ids = all.map((item) => (item as { id: string }).id)
      expect(ids).toEqual(expect.arrayContaining([FIXTURE_SESSION_ID, TEST_RUN_SESSION_ID]))

      const runs = (await request(app).get('/api/sessions?kind=test-run')).body as unknown[]
      expect(runs).toHaveLength(1)
      expect(TestRunSummarySchema.parse(runs[0])).toMatchObject({
        kind: 'test-run',
        id: TEST_RUN_SESSION_ID,
        title: 'Fixture test run',
        run: { path: store.testRun?.runPath, feature: 'f', area: 'a' },
        counts: { scenarios: 3, pass: 1, fail: 1, gap: 1, na: 0, blocked: 0, uncertain: 0, planned: 0 },
        status: 'unreviewed',
        reviewed: 0,
        total: 3,
        openComments: 0,
      })

      const reviews = (await request(app).get('/api/sessions?kind=code-review')).body as { id: string }[]
      expect(reviews.map((item) => item.id)).toEqual([FIXTURE_SESSION_ID])
      expect((await request(app).get('/api/sessions?kind=nope')).status).toBe(400)
    })

    it('returns the TestRunDetail with fingerprints, warnings and no missing files', async () => {
      const detail = await detailOf(app)
      expect(detail.kind).toBe('test-run')
      expect(detail.manifest.run.feature).toBe('f')
      expect(detail.index.runId).toBe('run-1')
      expect(detail.scenarios.map((s) => [s.id, s.status])).toEqual([
        ['s1-pass', 'pass'],
        ['s2-fail', 'fail'],
        ['s3-gap', 'gap'],
      ])
      for (const scenario of detail.scenarios) expect(scenario.fingerprint).toMatch(FINGERPRINT_RE)
      expect(new Set(detail.scenarios.map((s) => s.fingerprint)).size).toBe(3)
      expect(detail.missing).toEqual([])
      expect(detail.warnings).toEqual(['overview[9]: unknown panel type "weird"'])
    })

    it('does not offer the working-tree routes for a test run', async () => {
      expect((await request(app).get(`${base}/patch`)).status).toBe(404)
      expect((await request(app).get(`${base}/commits`)).status).toBe(404)
    })
  })

  describe('run files', () => {
    it('serves an indexed file with its type and a sandboxing CSP', async () => {
      const png = await request(app).get(runFile('run/scenarios/s1-pass/screenshots/s1-01-a.png'))
      expect(png.status).toBe(200)
      expect(png.headers['content-type']).toBe('image/png')
      expect(png.headers['content-security-policy']).toBe('sandbox')
      expect(png.headers['x-content-type-options']).toBe('nosniff')

      const json = await request(app).get(runFile('run/scenarios/s1-pass/data/out.json'))
      expect(json.status).toBe(200)
      expect(json.headers['content-type']).toMatch(/application\/json/)

      const bug = await request(app).get(runFile('bugs/x/x.md'))
      expect(bug.status).toBe(200)
      expect(bug.headers['content-type']).toMatch(/text\/markdown/)
      expect((await request(app).get(runFile('bugs/x/screenshots/1.png'))).status).toBe(200)
    })

    it('answers a Range request on the video with 206', async () => {
      const res = await request(app).get(runFile('run/scenarios/s1-pass/videos/test-1-pass-1.mp4')).set('Range', 'bytes=0-9')
      expect(res.status).toBe(206)
      expect(res.headers['content-type']).toBe('video/mp4')
      expect(res.headers['content-range']).toMatch(/^bytes 0-9\/\d+$/)
      expect(res.headers['accept-ranges']).toBe('bytes')
    })

    it('is 404 for what the index does not name, for unknown aliases and for escapes', async () => {
      // On disk but not in the index.
      expect((await request(app).get(runFile('run/steps.md'))).status).toBe(404)
      expect((await request(app).get(runFile('plan/test-plan.md'))).status).toBe(404)
      expect((await request(app).get(runFile('nope/scenarios/s1-pass/data/out.json'))).status).toBe(404)
      expect((await request(app).get(runFile('run'))).status).toBe(404)
      expect((await request(app).get(runFile('run/../steps.md'))).status).toBe(404)
      expect((await request(app).get(runFile('run/scenarios/%2e%2e/steps.md'))).status).toBe(404)
      expect((await request(app).get(runFile('bugs/../../test-plan.md'))).status).toBe(404)
      // A code review has no run files.
      expect((await request(app).get(`/api/sessions/${FIXTURE_SESSION_ID}/run/file/run/x`)).status).toBe(404)
    })

    it('slices a log by line, capped, and 404s for a path outside the index', async () => {
      const res = await request(app).get(`${base}/run/log/run/logs/run.log?from=5&to=7`)
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ path: 'run:logs/run.log', from: 5, to: 7, total: 12 })
      expect(res.body.lines).toHaveLength(3)
      expect(res.body.lines[2]).toContain('ERROR')

      const all = await request(app).get(`${base}/run/log/run/logs/run.log`)
      expect(all.body).toMatchObject({ from: 1, to: 12, total: 12 })
      expect(all.body.lines).toHaveLength(12)
      const past = await request(app).get(`${base}/run/log/run/logs/run.log?from=20&to=30`)
      expect(past.body).toMatchObject({ total: 12, lines: [] })

      expect((await request(app).get(`${base}/run/log/run/steps.md`)).status).toBe(404)
      expect((await request(app).get(`${base}/run/log/run/logs/run.log?from=0`)).status).toBe(400)
      expect((await request(app).get(`${base}/run/log/run/logs/run.log?from=9&to=3`)).status).toBe(400)
    })
  })

  describe('review and send', () => {
    const reviewUrl = `${base}/review`

    function draft(fingerprint: string): Review {
      const review = emptyReview(TEST_RUN_SESSION_ID, '2026-01-01T10:00:00.000Z')
      review.files['s1-pass'] = { verdict: 'approved', fingerprint, viewed: true }
      review.comments = [makeComment({ id: 'c1', target: { kind: 'scenario', ref: 's2-fail' }, kind: 'incorrect', body: 'The empty state is wrong.', createdAt: '2026-01-01T10:01:00.000Z' })]
      review.nextCommentId = 2
      return review
    }

    it('saves reviews with the stale-409 rule and keys verdicts by scenario id', async () => {
      const detail = await detailOf(app)
      const fingerprint = detail.scenarios[0]?.fingerprint ?? ''
      const first = await request(app).put(reviewUrl).send({ review: draft(fingerprint), baseUpdatedAt: null })
      expect(first.status).toBe(200)
      const stale = await request(app).put(reviewUrl).send({ review: draft(fingerprint), baseUpdatedAt: null })
      expect(stale.status).toBe(409)
      expect(stale.body.current.files['s1-pass'].verdict).toBe('approved')

      const summary = TestRunSummarySchema.parse((await request(app).get('/api/sessions?kind=test-run')).body[0])
      expect(summary).toMatchObject({ status: 'in-progress', reviewed: 2, total: 3 })
    })

    it('send writes .json and .md and no .patch', async () => {
      const res = await request(app).post(`${reviewUrl}/send`).send({ decision: 'request-changes', dispatch: true })
      expect(res.status).toBe(200)
      const body = SendResponseSchema.parse(res.body)
      const sent = TestRunSentSnapshotSchema.parse(body.sent)
      expect(sent).toMatchObject({
        kind: 'test-run',
        decision: 'request-changes',
        run: { path: store.testRun?.runPath },
        counts: { scenarios: 3, approved: 1, rejected: 0, commented: 1, unreviewed: 1, openComments: 1 },
      })
      expect(sent.run.indexFingerprint).toMatch(FINGERPRINT_RE)
      expect(sent.scenarios.map((s) => [s.id, s.verdict])).toEqual([['s1-pass', 'approved'], ['s2-fail', 'none'], ['s3-gap', 'none']])

      const stem = sent.sentAt.replaceAll(':', '-')
      const sentDir = path.join(store.testRun?.dir ?? '', 'review', 'sent')
      expect(fs.readdirSync(sentDir).sort()).toEqual([`${stem}.json`, `${stem}.md`])
      const markdown = fs.readFileSync(path.join(sentDir, `${stem}.md`), 'utf8')
      expect(markdown).toContain(`/t/${TEST_RUN_SESSION_ID}/review`)
      expect(markdown).toContain('### s2-fail')
      expect(markdown).toContain('**[incorrect]** The empty state is wrong.')
      expect(TestRunSentSnapshotSchema.parse(JSON.parse(fs.readFileSync(path.join(sentDir, `${stem}.json`), 'utf8')))).toEqual(sent)
    })

    it('refuses to send nothing', async () => {
      const dir = store.testRun?.dir ?? ''
      const before = fs.readdirSync(path.join(dir, 'review', 'sent')).length
      // The only comment gets resolved (as `/apply-review` would record it): no open comments and no decision leaves nothing to send.
      const resolutions: Resolutions = {
        schemaVersion: SCHEMA_VERSION,
        sessionId: TEST_RUN_SESSION_ID,
        updatedAt: '2026-01-02T00:00:00.000Z',
        comments: { c1: { status: 'resolved', note: 'fixed', at: '2026-01-02T00:00:00.000Z', files: [] } },
      }
      fs.writeFileSync(path.join(dir, 'review', 'resolutions.json'), JSON.stringify(resolutions))
      const res = await request(app).post(`${reviewUrl}/send`).send({ decision: 'undecided', dispatch: false })
      expect(res.status).toBe(400)
      expect(fs.readdirSync(path.join(dir, 'review', 'sent'))).toHaveLength(before)
    })
  })
})

describe('test-run sessions on a changing run folder', () => {
  let store: FixtureStore
  let app: Express
  let outside: string
  const runPath = () => store.testRun?.runPath ?? ''
  beforeAll(async () => {
    store = await createFixtureStore({ testRun: true })
    outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scout-secret-')))
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'TOP SECRET\n')
    fs.writeFileSync(path.join(outside, 'out.json'), '{"secret":true}\n')
    app = appFor(store.home, { watcher: { stabilityThreshold: 100, pollInterval: 20, debounceMs: 100, runDebounceMs: 100 } })
    await appServices(app).watcher.ready
  })
  afterAll(async () => {
    await closeApp(app)
    await store.cleanup()
    fs.rmSync(outside, { recursive: true, force: true })
  })

  it('changes a scenario fingerprint when a screenshot is rewritten with a different size, leaving the others alone', async () => {
    const before = await detailOf(app)
    const updated = nextRunUpdate(app)
    const shot = path.join(runPath(), 'scenarios', 's1-pass', 'screenshots', 's1-01-a.png')
    fs.appendFileSync(shot, Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]))
    await updated
    const after = await detailOf(app)
    const fingerprints = (detail: TestRunDetail) => Object.fromEntries(detail.scenarios.map((s) => [s.id, s.fingerprint]))
    expect(fingerprints(after)['s1-pass']).not.toBe(fingerprints(before)['s1-pass'])
    expect(fingerprints(after)['s2-fail']).toBe(fingerprints(before)['s2-fail'])
    expect(fingerprints(after)['s3-gap']).toBe(fingerprints(before)['s3-gap'])
  })

  it('keeps every fingerprint when only a log changes', async () => {
    const before = await detailOf(app)
    fs.appendFileSync(path.join(runPath(), 'logs', 'run.log'), 'more output\n')
    await new Promise((resolve) => setTimeout(resolve, 700))
    const after = await detailOf(app)
    expect(after.scenarios.map((s) => s.fingerprint)).toEqual(before.scenarios.map((s) => s.fingerprint))
    // The log grew; the slice sees it.
    const log = await request(app).get(`${base}/run/log/run/logs/run.log?from=13`)
    expect(log.body).toMatchObject({ total: 13, lines: ['more output'] })
  })

  it('reports a referenced file that disappeared in missing[]', async () => {
    const updated = nextRunUpdate(app)
    fs.rmSync(path.join(runPath(), '..', '..', 'bugs', 'x', 'screenshots', '1.png'))
    await updated
    expect((await detailOf(app)).missing).toEqual(['bugs:x/screenshots/1.png'])
    expect((await request(app).get(runFile('bugs/x/screenshots/1.png'))).status).toBe(404)
  })

  it('does not follow a symlink planted at an indexed path, nor one in a directory of it', async () => {
    const target = path.join(runPath(), 'scenarios', 's3-gap', 'screenshots', 's3-01-a.png')
    fs.rmSync(target)
    fs.symlinkSync(path.join(outside, 'secret.txt'), target)
    const link = await request(app).get(runFile('run/scenarios/s3-gap/screenshots/s3-01-a.png'))
    expect(link.status).toBe(404)
    expect(link.text).not.toContain('TOP SECRET')

    const dataDir = path.join(runPath(), 'scenarios', 's2-fail', 'data')
    fs.rmSync(dataDir, { recursive: true })
    fs.symlinkSync(outside, dataDir)
    const viaDir = await request(app).get(runFile('run/scenarios/s2-fail/data/out.json'))
    expect(viaDir.status).toBe(404)
    expect(viaDir.text).not.toContain('secret')

    // A link at a path the index does not name is just another unlisted path.
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(runPath(), 'leak.txt'))
    expect((await request(app).get(runFile('run/leak.txt'))).status).toBe(404)
  })

  it('refuses a run whose index points a root outside the checkout', async () => {
    const indexFile = path.join(runPath(), 'test-run.json')
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8')) as { roots: Record<string, string> }
    index.roots['bugs'] = '../../../../../../..'
    fs.writeFileSync(indexFile, JSON.stringify(index))
    const res = await request(app).get(base)
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/leaves/)
    const list = (await request(app).get('/api/sessions?kind=test-run')).body as { id: string; error?: string }[]
    expect(list[0]).toMatchObject({ id: TEST_RUN_SESSION_ID, error: expect.stringMatching(/leaves/) })
  })

  it('answers 422 for a missing or invalid index', async () => {
    const indexFile = path.join(runPath(), 'test-run.json')
    fs.writeFileSync(indexFile, '{"schemaVersion": 1}')
    expect((await request(app).get(base)).status).toBe(422)
    fs.rmSync(indexFile)
    const res = await request(app).get(base)
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/missing/)
  })
})



describe('Scout archive kind filtering', () => {
  it('archives, filters, and restores test runs without mixing them with code reviews', async () => {
    const fixture = await createFixtureStore({ testRun: true })
    const archiveApp = appFor(fixture.home)
    try {
      expect((await request(archiveApp).post(`/api/sessions/${TEST_RUN_SESSION_ID}/archive`)).status).toBe(200)
      const runs = await request(archiveApp).get('/api/sessions/archived?kind=test-run')
      expect(runs.status).toBe(200)
      expect(runs.body.map((row: { id: string }) => row.id)).toEqual([TEST_RUN_SESSION_ID])
      const reviews = await request(archiveApp).get('/api/sessions/archived?kind=code-review')
      expect(reviews.status).toBe(200)
      expect(reviews.body).toEqual([])
      expect((await request(archiveApp).get('/api/sessions/archived?kind=unknown')).status).toBe(400)
      expect((await request(archiveApp).post(`/api/sessions/${TEST_RUN_SESSION_ID}/unarchive`)).status).toBe(200)
      expect((await request(archiveApp).get(`/api/sessions/${TEST_RUN_SESSION_ID}`)).status).toBe(200)
    } finally {
      await closeApp(archiveApp)
      await fixture.cleanup()
    }
  })
})

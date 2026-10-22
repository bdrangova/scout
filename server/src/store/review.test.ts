import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentRun } from '@review-dash/shared'
import { FIXTURE_SESSION_ID, codeReviewDetail, createFixtureStore, fixtureSessionDir } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'
import { Store } from './index.ts'
import { activeRunId, listRuns, readResolutions, readReview, sentFiles } from './review.ts'

let fixture: FixtureStore
beforeAll(async () => {
  fixture = await createFixtureStore()
})
afterAll(() => fixture.cleanup())

function run(overrides: Partial<AgentRun>): AgentRun {
  return {
    id: 'run-20260101090000-0001',
    sessionId: FIXTURE_SESSION_ID,
    sentAt: '2026-01-01T09:00:00.000Z',
    adapter: 'fake',
    status: 'succeeded',
    pid: null,
    argv: [],
    startedAt: '2026-01-01T09:00:01.000Z',
    endedAt: '2026-01-01T09:05:00.000Z',
    exitCode: 0,
    agentSessionId: null,
    numTurns: 3,
    costUsd: 0.1,
    resultText: 'done',
    error: null,
    resolvedComments: [],
    ...overrides,
  }
}

describe('review store helpers', () => {
  it('reads null when review.json and resolutions.json are absent', async () => {
    expect(await readReview(fixture.dir, FIXTURE_SESSION_ID)).toBeNull()
    expect(await readResolutions(fixture.dir, FIXTURE_SESSION_ID)).toBeNull()
    expect(await listRuns(fixture.dir)).toEqual([])
    expect(activeRunId([])).toBeNull()
  })

  it('names the three sent files from the stem', () => {
    const files = sentFiles('/s', '2026-01-01T09:00:00.000Z')
    expect(files).toEqual({
      json: path.join('/s', 'review', 'sent', '2026-01-01T09-00-00.000Z.json'),
      markdown: path.join('/s', 'review', 'sent', '2026-01-01T09-00-00.000Z.md'),
      patch: path.join('/s', 'review', 'sent', '2026-01-01T09-00-00.000Z.patch'),
    })
  })

  it('lists validated runs oldest first, skips broken files and finds the active run', async () => {
    const runsDir = path.join(fixture.dir, 'review', 'runs')
    fs.mkdirSync(runsDir, { recursive: true })
    const done = run({})
    const active = run({
      id: 'run-20260101093000-0002',
      status: 'running',
      pid: 4242,
      startedAt: '2026-01-01T09:30:00.000Z',
      endedAt: null,
      exitCode: null,
      resultText: null,
    })
    fs.writeFileSync(path.join(runsDir, `${active.id}.json`), JSON.stringify(active))
    fs.writeFileSync(path.join(runsDir, `${done.id}.json`), JSON.stringify(done))
    fs.writeFileSync(path.join(runsDir, `${done.id}.jsonl`), '{"type":"system"}\n')
    fs.writeFileSync(path.join(runsDir, 'run-20260101094500-0003.json'), '{ "half": tru')

    const runs = await listRuns(fixture.dir)
    expect(runs.map((r) => r.id)).toEqual([done.id, active.id])
    expect(activeRunId(runs)).toBe(active.id)

    const store = new Store(fixture.home, { log: () => undefined })
    try {
      const detail = codeReviewDetail(await store.getSession(FIXTURE_SESSION_ID))
      expect(detail.activeRunId).toBe(active.id)
      expect(detail.status).toBe('agent-working')
    } finally {
      store.close()
      fs.rmSync(runsDir, { recursive: true, force: true })
    }
  })
})

describe('Store.listSessions', () => {
  it('sorts by updatedAt (folder timestamp for broken folders), newest first, and reports folders without a manifest', async () => {
    const olderId = '20251231-0800-older-1234'
    const older = fixtureSessionDir(fixture.home, olderId)
    fs.mkdirSync(older, { recursive: true })
    fs.writeFileSync(path.join(older, 'manifest.json'), JSON.stringify({ ...fixture.manifest, id: olderId, updatedAt: '2025-12-31T08:00:00.000Z' }))
    fs.mkdirSync(fixtureSessionDir(fixture.home, '20260103-1100-empty-0000'), { recursive: true })
    fs.mkdirSync(fixtureSessionDir(fixture.home, 'not-a-session'), { recursive: true })
    fs.writeFileSync(path.join(fixture.home, 'sessions', '.DS_Store'), '')

    const store = new Store(fixture.home, { log: () => undefined })
    try {
      const items = await store.listSessions()
      // The two valid sessions carry the live tree's computedAt (now) as updatedAt, so they come first.
      expect(items.slice(0, 2).map((i) => i.id).sort()).toEqual([olderId, FIXTURE_SESSION_ID].sort())
      expect(items.slice(2).map((i) => i.id)).toEqual(['20260103-1100-empty-0000', '20260102-1000-broken-ffff', 'not-a-session'])
      expect(items[2]).toEqual({ id: '20260103-1100-empty-0000', error: expect.stringContaining('missing') })
      expect(items[4]).toEqual({ id: 'not-a-session', error: expect.stringContaining('not a valid session id') })
    } finally {
      store.close()
    }
  })

  it('summarises a session whose pr-comments.json is unreadable, and computes each tree once across repeated lists', async () => {
    const reviewDir = path.join(fixtureSessionDir(fixture.home, FIXTURE_SESSION_ID), 'review')
    fs.mkdirSync(reviewDir, { recursive: true })
    fs.writeFileSync(path.join(reviewDir, 'pr-comments.json'), '{ not json')
    let computes = 0
    const store = new Store(fixture.home, {
      log: () => undefined,
      trees: {
        compute: async (input) => {
          computes += 1
          return await import('@review-dash/shared/git/working-tree').then((m) => m.computeWorkingTree(input))
        },
      },
    })
    try {
      // What the server does at startup, then the dashboard's first request (concurrent, like the real order).
      const [, items] = await Promise.all([store.listSessions(), store.listSessions()])
      const item = items.find((i) => i.id === FIXTURE_SESSION_ID)
      expect(item).toMatchObject({ id: FIXTURE_SESSION_ID, pr: null, prComments: null })
      const afterFirst = computes
      await store.listSessions()
      expect(computes).toBe(afterFirst)
      expect(computes).toBeLessThanOrEqual(items.filter((i) => !('error' in i)).length)
    } finally {
      store.close()
      fs.rmSync(path.join(reviewDir, 'pr-comments.json'), { force: true })
    }
  })

  it('returns an empty list when the store has no sessions folder', async () => {
    const store = new Store(path.join(fixture.home, 'nope'), { log: () => undefined })
    expect(await store.listSessions()).toEqual([])
    store.close()
  })
})

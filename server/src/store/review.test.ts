import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIXTURE_SESSION_ID, createFixtureStore, fixtureSessionDir } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'
import { Store } from './index.ts'
import { readResolutions, readReview, sentFiles } from './review.ts'

let fixture: FixtureStore
beforeAll(async () => {
  fixture = await createFixtureStore()
})
afterAll(() => fixture.cleanup())

describe('review store helpers', () => {
  it('reads null when review.json and resolutions.json are absent', async () => {
    expect(await readReview(fixture.dir, FIXTURE_SESSION_ID)).toBeNull()
    expect(await readResolutions(fixture.dir, FIXTURE_SESSION_ID)).toBeNull()
  })

  it('names the three sent files from the stem', () => {
    const files = sentFiles('/s', '2026-01-01T09:00:00.000Z')
    expect(files).toEqual({
      json: path.join('/s', 'review', 'sent', '2026-01-01T09-00-00.000Z.json'),
      markdown: path.join('/s', 'review', 'sent', '2026-01-01T09-00-00.000Z.md'),
      patch: path.join('/s', 'review', 'sent', '2026-01-01T09-00-00.000Z.patch'),
    })
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
          return await import('@scout/shared/git/working-tree').then((m) => m.computeWorkingTree(input))
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

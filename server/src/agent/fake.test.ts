import fs from 'node:fs/promises'
import path from 'node:path'
import type { Review } from '@review-dash/shared'
import { makeComment, makeReview } from '@review-dash/shared/testing/fixtures'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Store } from '../store/index.ts'
import { writeReview } from '../store/review.ts'
import { FIXTURE_SESSION_ID, createFixtureStore } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'
import { FakeAdapter, isInside, markFixtureRepo } from './fake.ts'

const SENT_AT = '2026-01-01T12:00:00.000Z'

function sentReview(): Review {
  return makeReview({
    sessionId: FIXTURE_SESSION_ID,
    comments: [
      makeComment({ id: 'c1', target: { kind: 'file', ref: 'src/old.ts' }, sentAt: SENT_AT }),
      makeComment({ id: 'c2', target: { kind: 'overall', ref: null }, sentAt: SENT_AT }),
      makeComment({ id: 'c3', target: { kind: 'spec', ref: 'jira.md' } }),
    ],
    sent: { at: SENT_AT, decision: 'request-changes' },
  })
}

async function drain(adapter: FakeAdapter, store: Store, home: string): Promise<void> {
  const handle = adapter.applyFeedback({ session: await store.getSession(FIXTURE_SESSION_ID), sentAt: SENT_AT, fork: false, signal: new AbortController().signal, home })
  for await (const _event of handle) {
    // consume
  }
  expect(await handle.exit).toEqual({ code: 0, signal: null })
}

describe('isInside', () => {
  it('is a strict realpath prefix check', async () => {
    const root = await fs.realpath(path.dirname(new URL(import.meta.url).pathname))
    expect(await isInside(root, path.join(root, 'fake.ts'))).toBe(true)
    expect(await isInside(root, root)).toBe(false)
    expect(await isInside(root, path.join(root, '..'))).toBe(false)
    expect(await isInside(root, path.join(root, 'nope'))).toBe(false)
    expect(await isInside(path.join(root, 'nope'), root)).toBe(false)
  })
})

describe('FakeAdapter and the fixture repo marker', () => {
  let outside: FixtureStore
  let inside: FixtureStore
  beforeAll(async () => {
    outside = await createFixtureStore()
    inside = await createFixtureStore({ repoInsideHome: true })
  })
  afterAll(async () => {
    await outside.cleanup()
    await inside.cleanup()
  })

  it('leaves a repo outside AI_REVIEW_HOME untouched', async () => {
    const store = new Store(outside.home, { log: () => undefined })
    try {
      await writeReview(outside.dir, sentReview())
      await drain(new FakeAdapter({ delayMs: 0 }), store, outside.home)
      expect(await fs.readFile(path.join(outside.repo.repo, 'README.md'), 'utf8')).toBe('# Fixture repo\n')
      expect(await markFixtureRepo(outside.repo.repo, outside.home, ['c1'])).toBe(false)
    } finally {
      store.close()
    }
  })

  it('appends the marker line to README.md of a repo inside AI_REVIEW_HOME, once per run, naming the resolved comments', async () => {
    const store = new Store(inside.home, { log: () => undefined })
    try {
      expect(inside.repo.repo.startsWith(inside.home + path.sep)).toBe(true)
      await writeReview(inside.dir, sentReview())
      await drain(new FakeAdapter({ delayMs: 0 }), store, inside.home)
      const readme = path.join(inside.repo.repo, 'README.md')
      expect(await fs.readFile(readme, 'utf8')).toBe('# Fixture repo\n<!-- ai-review fake adapter: applied c1, c2 -->\n')
      // Nothing left to resolve: a second run changes nothing.
      await drain(new FakeAdapter({ delayMs: 0 }), store, inside.home)
      expect(await fs.readFile(readme, 'utf8')).toBe('# Fixture repo\n<!-- ai-review fake adapter: applied c1, c2 -->\n')
      // The README now shows up in the live tree.
      store.trees.drop(FIXTURE_SESSION_ID)
      const detail = await store.getSession(FIXTURE_SESSION_ID)
      expect(detail.tree.files.find((f) => f.path === 'README.md')).toMatchObject({ status: 'modified', additions: 1, deletions: 0 })
    } finally {
      store.close()
    }
  })

  it('creates README.md when the repo has none', async () => {
    const readme = path.join(inside.repo.repo, 'README.md')
    await fs.rm(readme)
    expect(await markFixtureRepo(inside.repo.repo, inside.home, ['c9'])).toBe(true)
    expect(await fs.readFile(readme, 'utf8')).toBe('<!-- ai-review fake adapter: applied c9 -->\n')
  })
})

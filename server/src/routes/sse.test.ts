import fs from 'node:fs'
import path from 'node:path'
import { SCHEMA_VERSION, StoreEventSchema } from '@scout/shared'
import type { Resolutions, Review, CodeReviewDetail, StoreEvent } from '@scout/shared'
import { makeComment, makeReview } from '@scout/shared/testing/fixtures'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { appServices, closeApp } from '../app.ts'
import { writeReview } from '../store/review.ts'
import { FIXTURE_SESSION_ID, appFor, createFixtureStore } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'
import { listen, openSseReader } from '../testing/sse-client.ts'
import type { SseMessage } from '../testing/sse-client.ts'

let store: FixtureStore
let app: Express
let server: Awaited<ReturnType<typeof listen>>
beforeAll(async () => {
  store = await createFixtureStore()
  app = appFor(store.home)
  server = await listen(app)
})
afterAll(async () => {
  await closeApp(app)
  await server.close()
  await store.cleanup()
})

const sessionUrl = `/api/sessions/${FIXTURE_SESSION_ID}`

async function send(method: 'POST' | 'PUT', url: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(server.url + url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}
const put = (url: string, body: unknown) => send('PUT', url, body)

function draft(): Review {
  return makeReview({ sessionId: FIXTURE_SESSION_ID, comments: [makeComment({ id: 'c1', target: { kind: 'file', ref: 'src/old.ts' } })] })
}

const dataOf = (m: SseMessage): unknown => (m.kind === 'event' ? JSON.parse(m.data) : null)
const isStoreEvent = (type: StoreEvent['type']) => (m: SseMessage) => m.kind === 'event' && (dataOf(m) as { type: string }).type === type

describe('GET /api/events', () => {
  it('reports external review, resolutions, artifact and manifest writes, repo edits as tree.updated, but not our own PUT', async () => {
    const reader = await openSseReader(`${server.url}/api/events`)
    await reader.waitFor((m) => m.kind === 'comment' && m.text === 'ready')
    expect(appServices(app).watcher.active).toBe(true)
    expect(appServices(app).watcher.watchedRepos.get(FIXTURE_SESSION_ID)).toBe(store.repo.repo)
    const storeEvents = () => reader.messages.filter((m) => m.kind === 'event').map((m) => StoreEventSchema.parse(dataOf(m)))

    const external = draft()
    external.updatedAt = '2026-01-01T13:00:00.000Z'
    await writeReview(store.dir, external)
    await reader.waitFor(isStoreEvent('review.updated'), { timeoutMs: 8_000 })
    expect(storeEvents()).toContainEqual({ type: 'review.updated', sessionId: FIXTURE_SESSION_ID })

    let before = reader.messages.length
    const saved = await put(`${sessionUrl}/review`, { review: draft(), baseUpdatedAt: '2026-01-01T13:00:00.000Z' })
    expect(saved.status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(reader.messages.slice(before).filter((m) => m.kind === 'event')).toEqual([])

    const resolutions: Resolutions = { schemaVersion: SCHEMA_VERSION, sessionId: FIXTURE_SESSION_ID, updatedAt: '2026-01-01T14:00:00.000Z', comments: {} }
    fs.writeFileSync(path.join(store.dir, 'review', 'resolutions.json'), JSON.stringify(resolutions))
    await reader.waitFor(isStoreEvent('resolutions.updated'), { timeoutMs: 8_000 })

    // Scout's journal (written by the CLI) → journal.updated plus a session.updated for the nav badge.
    before = reader.messages.length
    const journal = { schemaVersion: 2, sessionId: FIXTURE_SESSION_ID, updatedAt: '2026-01-01T14:30:00.000Z', nextId: 1, entries: [] }
    fs.writeFileSync(path.join(store.dir, 'review', 'journal.json'), JSON.stringify(journal))
    await reader.waitFor(isStoreEvent('journal.updated'), { timeoutMs: 8_000, from: before })
    await reader.waitFor(isStoreEvent('session.updated'), { timeoutMs: 8_000, from: before })
    expect(storeEvents().filter((e) => e.type === 'journal.updated')).toContainEqual({ type: 'journal.updated', sessionId: FIXTURE_SESSION_ID })

    // Artifacts: a burst of writes under evidence/ and the PR description → one debounced session.updated.
    before = reader.messages.length
    fs.writeFileSync(path.join(store.dir, 'evidence', 'extra.png'), 'png')
    fs.writeFileSync(path.join(store.dir, 'pr-description.md'), '# Updated\n')
    await reader.waitFor(isStoreEvent('session.updated'), { timeoutMs: 8_000, from: before })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(reader.messages.slice(before).filter(isStoreEvent('session.updated'))).toHaveLength(1)

    // Repo edit → tree.updated with a new fingerprint .
    const detail = (await (await fetch(`${server.url}${sessionUrl}`)).json()) as CodeReviewDetail
    before = reader.messages.length
    await store.repo.write('src/app.ts', "export const app = 'v3'\n")
    const updated = await reader.waitFor(isStoreEvent('tree.updated'), { timeoutMs: 10_000, from: before })
    const event = StoreEventSchema.parse(dataOf(updated))
    if (event.type !== 'tree.updated') throw new Error('expected tree.updated')
    expect(event.sessionId).toBe(FIXTURE_SESSION_ID)
    expect(event.fingerprint).not.toBe(detail.tree.fingerprint)
    expect(event.durationMs).toBeGreaterThanOrEqual(0)
    const after = (await (await fetch(`${server.url}${sessionUrl}`)).json()) as CodeReviewDetail
    expect(after.tree.fingerprint).toBe(event.fingerprint)
    expect(after.tree.files.find((f) => f.path === 'src/app.ts')?.fingerprint).not.toBe(detail.tree.files.find((f) => f.path === 'src/app.ts')?.fingerprint)

    // A commit changes .git/HEAD and the index → the tree is recomputed; the diff against master is the same, so no event.
    before = reader.messages.length
    await store.repo.git(['add', 'src/app.ts'])
    await store.repo.git(['commit', '-q', '-m', 'v3'])
    await new Promise((resolve) => setTimeout(resolve, 900))
    const headSha = (await store.repo.git(['rev-parse', 'HEAD'])).trim()
    const committed = (await (await fetch(`${server.url}${sessionUrl}`)).json()) as CodeReviewDetail
    expect(committed.tree.headSha).toBe(headSha)
    // The tree fingerprint includes headSha, so the commit does emit; file fingerprints are unchanged.
    expect(committed.tree.files.find((f) => f.path === 'src/app.ts')?.fingerprint).toBe(after.tree.files.find((f) => f.path === 'src/app.ts')?.fingerprint)
    expect(reader.messages.slice(before).filter(isStoreEvent('tree.updated')).length).toBeGreaterThanOrEqual(1)

    // Rewriting a file with identical content changes nothing: no tree.updated.
    before = reader.messages.length
    await store.repo.write('src/untracked.ts', 'export const untracked = 1\n')
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(reader.messages.slice(before).filter(isStoreEvent('tree.updated'))).toEqual([])

    const newId = '20260105-1500-published-beef'
    const newDir = path.join(store.home, 'sessions', newId)
    fs.mkdirSync(newDir, { recursive: true })
    fs.writeFileSync(path.join(newDir, 'manifest.json'), JSON.stringify({ ...store.manifest, id: newId }))
    await reader.waitFor(isStoreEvent('session.added'), { timeoutMs: 8_000 })
    expect(storeEvents()).toContainEqual({ type: 'session.added', sessionId: newId })
    expect(appServices(app).watcher.watchedRepos.get(newId)).toBe(store.repo.repo)

    fs.rmSync(newDir, { recursive: true, force: true })
    await reader.waitFor(isStoreEvent('session.removed'), { timeoutMs: 8_000 })
    expect(appServices(app).watcher.watchedRepos.has(newId)).toBe(false)

    reader.close()
    await reader.ended
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(appServices(app).sse.size).toBe(0)
  })
})

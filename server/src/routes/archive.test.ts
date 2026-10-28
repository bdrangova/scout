import fs from 'node:fs/promises'
import path from 'node:path'
import { ARCHIVED_FILE, ArchivedSessionSchema, StoreEventSchema } from '@scout/shared'
import type { AgentRun, StoreEvent } from '@scout/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { appServices, closeApp } from '../app.ts'
import { FIXTURE_SESSION_ID, FIXTURE_T0, appFor, createFixtureStore, fixtureSessionDir } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'
import { listen, openSseReader } from '../testing/sse-client.ts'
import type { SseMessage, SseReader } from '../testing/sse-client.ts'

let store: FixtureStore
let app: Express
let server: Awaited<ReturnType<typeof listen>>
let reader: SseReader
beforeAll(async () => {
  store = await createFixtureStore()
  app = appFor(store.home)
  server = await listen(app)
  reader = await openSseReader(`${server.url}/api/events`)
  await reader.waitFor((m) => m.kind === 'comment' && m.text === 'ready')
})
afterAll(async () => {
  reader.close()
  await closeApp(app)
  await server.close()
  await store.cleanup()
})

const archivedDir = (id: string) => path.join(store.home, 'archive', id)

async function post(url: string): Promise<{ status: number; body: { id?: string; error?: string; reason?: string } }> {
  const res = await fetch(server.url + url, { method: 'POST' })
  return { status: res.status, body: (await res.json()) as { id?: string; error?: string } }
}
async function get<T>(url: string): Promise<{ status: number; body: T }> {
  const res = await fetch(server.url + url)
  return { status: res.status, body: (await res.json()) as T }
}
const exists = (p: string) => fs.access(p).then(() => true, () => false)
const isStoreEvent = (type: StoreEvent['type'], sessionId: string) => (m: SseMessage) => {
  if (m.kind !== 'event') return false
  const event = StoreEventSchema.parse(JSON.parse(m.data))
  return event.type === type && event.sessionId === sessionId
}

describe('archive and unarchive', () => {
  it('moves the folder to archive/, drops it from the live list and emits session.removed, then the reverse', async () => {
    const liveDir = fixtureSessionDir(store.home, FIXTURE_SESSION_ID)
    expect((await get<unknown[]>('/api/sessions/archived')).body).toEqual([])
    let from = reader.messages.length

    const archived = await post(`/api/sessions/${FIXTURE_SESSION_ID}/archive`)
    expect(archived).toEqual({ status: 200, body: { id: FIXTURE_SESSION_ID } })
    expect(await exists(liveDir)).toBe(false)
    expect(await exists(path.join(archivedDir(FIXTURE_SESSION_ID), 'manifest.json'))).toBe(true)
    const marker = JSON.parse(await fs.readFile(path.join(archivedDir(FIXTURE_SESSION_ID), ARCHIVED_FILE), 'utf8')) as { archivedAt: string }
    expect(Date.parse(marker.archivedAt)).toBeGreaterThan(Date.parse(FIXTURE_T0))

    await reader.waitFor(isStoreEvent('session.removed', FIXTURE_SESSION_ID), { timeoutMs: 8_000, from })
    expect(appServices(app).watcher.watchedRepos.has(FIXTURE_SESSION_ID)).toBe(false)

    const live = await get<{ id: string }[]>('/api/sessions')
    expect(live.body.map((item) => item.id)).not.toContain(FIXTURE_SESSION_ID)
    expect((await get('/api/sessions/' + FIXTURE_SESSION_ID)).status).toBe(404)

    const list = await get<unknown[]>('/api/sessions/archived')
    expect(list.status).toBe(200)
    const items = list.body.map((item) => ArchivedSessionSchema.parse(item))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: FIXTURE_SESSION_ID,
      title: 'Fixture session',
      tickets: [{ key: 'QI-1', url: null }],
      repo: { path: store.repo.repo, branch: 'feature/fixture', baseRef: store.manifest.repo.baseRef },
      createdAt: FIXTURE_T0,
      archivedAt: marker.archivedAt,
    })

    // Archiving twice: the session is no longer live.
    expect((await post(`/api/sessions/${FIXTURE_SESSION_ID}/archive`)).status).toBe(404)

    from = reader.messages.length
    const restored = await post(`/api/sessions/${FIXTURE_SESSION_ID}/unarchive`)
    expect(restored).toEqual({ status: 200, body: { id: FIXTURE_SESSION_ID } })
    expect(await exists(path.join(liveDir, 'manifest.json'))).toBe(true)
    expect(await exists(path.join(liveDir, ARCHIVED_FILE))).toBe(false)
    expect(await exists(archivedDir(FIXTURE_SESSION_ID))).toBe(false)
    await reader.waitFor(isStoreEvent('session.added', FIXTURE_SESSION_ID), { timeoutMs: 8_000, from })
    expect(appServices(app).watcher.watchedRepos.get(FIXTURE_SESSION_ID)).toBe(store.repo.repo)
    expect((await get<unknown[]>('/api/sessions/archived')).body).toEqual([])
    expect((await get<{ id: string }[]>('/api/sessions')).body.map((item) => item.id)).toContain(FIXTURE_SESSION_ID)
    expect((await get(`/api/sessions/${FIXTURE_SESSION_ID}`)).status).toBe(200)
  })

  it('answers 404 for unknown ids and sessions that are not archived', async () => {
    expect((await post('/api/sessions/20260101-0900-missing-0000/archive')).status).toBe(404)
    expect((await post('/api/sessions/not-an-id/archive')).status).toBe(404)
    expect((await post(`/api/sessions/${FIXTURE_SESSION_ID}/unarchive`)).status).toBe(404)
    expect((await post('/api/sessions/not-an-id/unarchive')).status).toBe(404)
  })

  it('refuses to archive while a run is active (409 run-active)', async () => {
    const run: AgentRun = {
      id: 'run-20260101090000-ab12',
      sessionId: FIXTURE_SESSION_ID,
      sentAt: FIXTURE_T0,
      adapter: 'fake',
      status: 'running',
      pid: null,
      argv: [],
      startedAt: FIXTURE_T0,
      endedAt: null,
      exitCode: null,
      agentSessionId: null,
      numTurns: null,
      costUsd: null,
      resultText: null,
      error: null,
      resolvedComments: [],
    }
    const file = path.join(store.dir, 'review', 'runs', `${run.id}.json`)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(run))
    try {
      const res = await post(`/api/sessions/${FIXTURE_SESSION_ID}/archive`)
      expect(res.status).toBe(409)
      expect(res.body.error).toBe('run-active')
      expect(await exists(store.dir)).toBe(true)
    } finally {
      await fs.rm(file, { force: true })
    }
  })

  it('deletes an archived session permanently, leaving siblings, cache/ and live sessions alone', async () => {
    const id = '20260105-1200-doomed-dead'
    const sibling = '20260105-1300-sibling-cafe'
    const cacheFile = path.join(store.home, 'cache', 'objects', 'keep.txt')
    await fs.mkdir(path.dirname(cacheFile), { recursive: true })
    await fs.writeFile(cacheFile, 'keep')
    for (const name of [id, sibling]) {
      await fs.mkdir(path.join(archivedDir(name), 'review', 'runs'), { recursive: true })
      await fs.writeFile(path.join(archivedDir(name), 'manifest.json'), JSON.stringify({ ...store.manifest, id: name }))
      await fs.writeFile(path.join(archivedDir(name), ARCHIVED_FILE), JSON.stringify({ archivedAt: FIXTURE_T0 }))
      await fs.writeFile(path.join(archivedDir(name), 'review', 'runs', 'run-20260101090000-ab12.jsonl'), 'log\n')
    }
    try {
      const before = reader.messages.length
      const res = await fetch(`${server.url}/api/sessions/archived/${id}`, { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ id })
      expect(await exists(archivedDir(id))).toBe(false)
      expect(await exists(path.join(archivedDir(sibling), 'manifest.json'))).toBe(true)
      expect(await exists(cacheFile)).toBe(true)
      expect(await exists(path.join(fixtureSessionDir(store.home, FIXTURE_SESSION_ID), 'manifest.json'))).toBe(true)
      expect(await exists(store.repo.repo)).toBe(true)
      const ids = (await get<unknown[]>('/api/sessions/archived')).body.map((item) => ArchivedSessionSchema.parse(item).id)
      expect(ids).toEqual([sibling])
      // Already gone: 404, and no store event was emitted for either call.
      expect((await fetch(`${server.url}/api/sessions/archived/${id}`, { method: 'DELETE' })).status).toBe(404)
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(reader.messages.slice(before).filter((m) => m.kind === 'event')).toEqual([])
    } finally {
      await fs.rm(archivedDir(sibling), { recursive: true, force: true })
      await fs.rm(path.join(store.home, 'cache'), { recursive: true, force: true })
    }
  })

  it('refuses to delete a live session (404) and leaves it in place', async () => {
    const res = await fetch(`${server.url}/api/sessions/archived/${FIXTURE_SESSION_ID}`, { method: 'DELETE' })
    expect(res.status).toBe(404)
    expect(await exists(path.join(fixtureSessionDir(store.home, FIXTURE_SESSION_ID), 'manifest.json'))).toBe(true)
    expect((await fetch(`${server.url}/api/sessions/archived/20260101-0900-missing-0000`, { method: 'DELETE' })).status).toBe(404)
  })

  it('rejects traversal-looking ids before touching disk', async () => {
    const live = fixtureSessionDir(store.home, FIXTURE_SESSION_ID)
    for (const bad of ['..%2Fsessions%2Fx', '%2E%2E%2Fsessions%2F' + FIXTURE_SESSION_ID, '..%5Csessions', 'not-an-id', '%00']) {
      const res = await fetch(`${server.url}/api/sessions/archived/${bad}`, { method: 'DELETE' })
      expect(res.status, bad).toBe(404)
    }
    // A raw `../` is resolved by the URL layer and never reaches the archived route.
    expect((await fetch(`${server.url}/api/sessions/archived/../sessions/${FIXTURE_SESSION_ID}`, { method: 'DELETE' })).status).toBe(404)
    expect(await exists(path.join(live, 'manifest.json'))).toBe(true)
    expect(await exists(path.join(store.home, 'sessions'))).toBe(true)
  })

  it('removes only the link when the archive entry is a symlink', async () => {
    const id = '20260106-0900-linked-1e4d'
    const real = path.join(store.home, 'elsewhere', id)
    await fs.mkdir(real, { recursive: true })
    await fs.writeFile(path.join(real, 'manifest.json'), JSON.stringify({ ...store.manifest, id }))
    await fs.mkdir(path.join(store.home, 'archive'), { recursive: true })
    await fs.symlink(real, archivedDir(id))
    try {
      const res = await fetch(`${server.url}/api/sessions/archived/${id}`, { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(await fs.lstat(archivedDir(id)).then(() => true, () => false)).toBe(false)
      expect(await exists(path.join(real, 'manifest.json'))).toBe(true)
    } finally {
      await fs.rm(path.join(store.home, 'elsewhere'), { recursive: true, force: true })
    }
  })

  it('refuses to delete an archived session whose run record still says running (409 run-active)', async () => {
    const id = '20260107-0900-running-0bad'
    const runFile = path.join(archivedDir(id), 'review', 'runs', 'run-20260101090000-ab12.json')
    await fs.mkdir(path.dirname(runFile), { recursive: true })
    await fs.writeFile(path.join(archivedDir(id), 'manifest.json'), JSON.stringify({ ...store.manifest, id }))
    const run: AgentRun = {
      id: 'run-20260101090000-ab12',
      sessionId: id,
      sentAt: FIXTURE_T0,
      adapter: 'fake',
      status: 'running',
      pid: null,
      argv: [],
      startedAt: FIXTURE_T0,
      endedAt: null,
      exitCode: null,
      agentSessionId: null,
      numTurns: null,
      costUsd: null,
      resultText: null,
      error: null,
      resolvedComments: [],
    }
    await fs.writeFile(runFile, JSON.stringify(run))
    try {
      const res = await fetch(`${server.url}/api/sessions/archived/${id}`, { method: 'DELETE' })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error?: string }).error).toBe('run-active')
      expect(await exists(path.join(archivedDir(id), 'manifest.json'))).toBe(true)
    } finally {
      await fs.rm(archivedDir(id), { recursive: true, force: true })
    }
  })

  it('refuses to unarchive over a live session with the same id (409 exists)', async () => {
    const id = '20260104-1100-twin-beef'
    const live = fixtureSessionDir(store.home, id)
    await fs.mkdir(live, { recursive: true })
    await fs.writeFile(path.join(live, 'manifest.json'), JSON.stringify({ ...store.manifest, id }))
    await fs.mkdir(archivedDir(id), { recursive: true })
    await fs.writeFile(path.join(archivedDir(id), 'manifest.json'), JSON.stringify({ ...store.manifest, id }))
    try {
      const res = await post(`/api/sessions/${id}/unarchive`)
      expect(res.status).toBe(409)
      expect(res.body.error).toBe('exists')
      // Without archived.json the folder mtime stands in for archivedAt.
      const items = (await get<unknown[]>('/api/sessions/archived')).body.map((item) => ArchivedSessionSchema.parse(item))
      expect(items.map((item) => item.id)).toEqual([id])
    } finally {
      await fs.rm(live, { recursive: true, force: true })
      await fs.rm(archivedDir(id), { recursive: true, force: true })
    }
  })
})

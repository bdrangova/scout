import fs from 'node:fs'
import path from 'node:path'
import { AgentRunSchema, RUN_ID_RE, ResolutionsSchema } from '@scout/shared'
import type { AgentRun, AgentRunEvent, Review, StoreEvent } from '@scout/shared'
import { makeComment, makeReview } from '@scout/shared/testing/fixtures'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HttpError } from '../errors.ts'
import { StoreEventBus } from '../events.ts'
import { Store } from '../store/index.ts'
import { readRun, runLogFile, writeReview } from '../store/review.ts'
import { FIXTURE_SESSION_ID, createFixtureStore } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'
import { DEFAULT_SAMPLE_PATH, FAKE_RESOLUTION_NOTE, FakeAdapter } from './fake.ts'
import { RunManager, newRunId, replayRunLog } from './runs.ts'
import { parseStreamJsonLine } from './stream-json.ts'

const SENT_AT = '2026-01-01T12:00:00.000Z'

function sentReview(): Review {
  return makeReview({
    sessionId: FIXTURE_SESSION_ID,
    comments: [
      makeComment({ id: 'c1', target: { kind: 'file', ref: 'src/old.ts' }, body: 'Keep this file.', sentAt: SENT_AT }),
      makeComment({ id: 'c2', target: { kind: 'evidence', ref: 'shot.png' }, body: 'Not sent yet.' }),
    ],
    sent: { at: SENT_AT, decision: 'request-changes' },
  })
}

function collector() {
  const events: AgentRunEvent[] = []
  let ended: AgentRun | null = null
  return { events, listener: { onEvent: (e: AgentRunEvent) => void events.push(e), onEnd: (r: AgentRun) => (ended = r) }, ended: () => ended }
}

const sampleLines = fs.readFileSync(DEFAULT_SAMPLE_PATH, 'utf8').split('\n').filter((l) => l.trim() !== '')
const producingLines = sampleLines.filter((l) => parseStreamJsonLine(l).length > 0).length

describe('RunManager with the fake adapter', () => {
  let fixture: FixtureStore
  let store: Store
  let manager: RunManager
  const bus = new StoreEventBus()
  const busEvents: StoreEvent[] = []
  bus.subscribe((e) => void busEvents.push(e))
  beforeAll(async () => {
    fixture = await createFixtureStore()
    store = new Store(fixture.home, { bus, log: () => undefined })
    manager = new RunManager({ store, adapter: new FakeAdapter({ delayMs: 0 }), bus, home: fixture.home })
  })
  afterAll(async () => {
    store.close()
    await fixture.cleanup()
  })

  it('generates run ids of the documented shape', () => {
    expect(newRunId(new Date('2026-09-26T18:47:36.000Z'))).toMatch(/^run-20260926184736-[0-9a-f]{4}$/)
    expect(RUN_ID_RE.test(newRunId())).toBe(true)
  })

  it('runs to completion, persisting the run, its log and the fake resolutions', async () => {
    await writeReview(fixture.dir, sentReview())
    const detail = await store.getSession(FIXTURE_SESSION_ID)
    const run = await manager.start(detail, { sentAt: SENT_AT, decision: 'request-changes', fork: false })
    expect(run).toMatchObject({ sessionId: FIXTURE_SESSION_ID, status: 'running', adapter: 'fake', sentAt: SENT_AT, pid: null })
    expect(run.argv[0]).toBe('fake-agent')
    expect(manager.activeRun(FIXTURE_SESSION_ID)?.id).toBe(run.id)
    await expect(manager.start(detail, { sentAt: SENT_AT, decision: 'request-changes', fork: false })).rejects.toThrow(HttpError)
    await expect(manager.start(detail, { sentAt: SENT_AT, decision: 'request-changes', fork: false })).rejects.toMatchObject({ status: 409 })

    const live = collector()
    const sub = await manager.subscribe(run.id, 0, live.listener)
    expect(sub?.finished).toBe(false)

    const final = await manager.wait(run.id)
    expect(final).not.toBeNull()
    expect(AgentRunSchema.parse(final)).toMatchObject({
      id: run.id,
      status: 'succeeded',
      exitCode: 0,
      costUsd: 0.42,
      numTurns: 6,
      resolvedComments: ['c1'],
      error: null,
    })
    expect(final?.resultText).toMatch(/^Done\./)
    expect(final?.agentSessionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(final?.endedAt).not.toBeNull()
    expect(manager.activeRun(FIXTURE_SESSION_ID)).toBeNull()
    expect(live.ended()).toEqual(final)

    const seqs = live.events.map((e) => e.seq)
    expect(seqs).toEqual(seqs.map((_, i) => i + 1))
    expect(live.events[0]).toMatchObject({ type: 'status', status: 'running' })
    expect(live.events.at(-1)).toMatchObject({ type: 'status', status: 'succeeded' })
    expect(live.events.some((e) => e.type === 'tool_result' && e.isError)).toBe(true)

    const log = fs.readFileSync(runLogFile(fixture.dir, run.id), 'utf8').split('\n').filter((l) => l !== '')
    expect(log).toHaveLength(producingLines + 2)
    expect(log[0]).toContain('"status":"running"')
    expect(log[1]).toBe(sampleLines[0])
    expect(await readRun(fixture.dir, run.id)).toEqual(final)

    const resolutions = ResolutionsSchema.parse(JSON.parse(fs.readFileSync(path.join(fixture.dir, 'review', 'resolutions.json'), 'utf8')))
    expect(resolutions.schemaVersion).toBe(2)
    expect(resolutions.comments.c1).toMatchObject({ status: 'resolved', note: FAKE_RESOLUTION_NOTE, files: [] })
    expect(resolutions.comments.c2).toBeUndefined()
    // The repo is outside AI_REVIEW_HOME: untouched.
    expect(fs.readFileSync(path.join(fixture.repo.repo, 'README.md'), 'utf8')).toBe('# Fixture repo\n')

    expect(busEvents.filter((e) => e.type === 'run.updated' && e.runId === run.id).length).toBeGreaterThanOrEqual(2)
    expect(await manager.list(FIXTURE_SESSION_ID)).toEqual([final])
    expect(await manager.get(run.id)).toEqual(final)
    expect(await manager.cancel(run.id)).toEqual(final)
  })

  it('replays from memory after a seq, and from the .jsonl in a fresh process', async () => {
    const run = (await manager.list(FIXTURE_SESSION_ID))[0]
    if (!run) throw new Error('expected a run')
    const partial = collector()
    const sub = await manager.subscribe(run.id, 5, partial.listener)
    expect(sub?.finished).toBe(true)
    expect(partial.events.every((e) => e.seq > 5)).toBe(true)
    expect(partial.events.length).toBeGreaterThan(10)

    const all = collector()
    await manager.subscribe(run.id, 0, all.listener)

    const freshStore = new Store(fixture.home, { log: () => undefined })
    const restarted = new RunManager({ store: freshStore, adapter: new FakeAdapter({ delayMs: 0 }), bus, home: fixture.home })
    const replayed = collector()
    const restartedSub = await restarted.subscribe(run.id, 0, replayed.listener)
    expect(restartedSub?.finished).toBe(true)
    expect(restartedSub?.run).toEqual(run)
    expect(replayed.events.map((e) => [e.seq, e.type])).toEqual(all.events.map((e) => [e.seq, e.type]))
    expect(await replayRunLog(fixture.dir, run)).toEqual(replayed.events)
    expect(await restarted.subscribe('run-20990101000000-ffff', 0, collector().listener)).toBeNull()
    freshStore.close()
  })

  it('marks a run left running by a previous process as failed', async () => {
    const stale: AgentRun = {
      ...(await manager.list(FIXTURE_SESSION_ID))[0]!,
      id: 'run-20250101000000-0000',
      status: 'running',
      endedAt: null,
    }
    await store.writeRun(fixture.dir, stale)
    const runs = await manager.list(FIXTURE_SESSION_ID)
    const reconciled = runs.find((r) => r.id === stale.id)
    expect(reconciled).toMatchObject({ status: 'failed', error: expect.stringContaining('restarted') })
    expect(reconciled?.endedAt).not.toBeNull()
  })
})

describe('RunManager cancel', () => {
  let fixture: FixtureStore
  let store: Store
  let manager: RunManager
  beforeAll(async () => {
    fixture = await createFixtureStore()
    store = new Store(fixture.home, { log: () => undefined })
    manager = new RunManager({ store, adapter: new FakeAdapter({ delayMs: 40 }), bus: new StoreEventBus(), home: fixture.home })
  })
  afterAll(async () => {
    store.close()
    await fixture.cleanup()
  })

  it('aborts the adapter, records cancelled and writes no resolutions', async () => {
    await writeReview(fixture.dir, sentReview())
    const run = await manager.start(await store.getSession(FIXTURE_SESSION_ID), { sentAt: SENT_AT, decision: 'request-changes', fork: false })
    const seen = collector()
    await manager.subscribe(run.id, 0, seen.listener)
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(await manager.cancel(run.id)).toMatchObject({ id: run.id })
    const final = await manager.wait(run.id)
    expect(final).toMatchObject({ status: 'cancelled', exitCode: null, error: null })
    expect(seen.events.at(-1)).toMatchObject({ type: 'status', status: 'cancelled' })
    expect(seen.events.length).toBeLessThan(producingLines)
    expect(fs.existsSync(path.join(fixture.dir, 'review', 'resolutions.json'))).toBe(false)
    expect(fs.existsSync(runLogFile(fixture.dir, run.id))).toBe(true)
  })

  it('close() cancels active runs', async () => {
    const run = await manager.start(await store.getSession(FIXTURE_SESSION_ID), { sentAt: SENT_AT, decision: 'request-changes', fork: false })
    await manager.close()
    expect(await manager.get(run.id)).toMatchObject({ status: 'cancelled', error: expect.stringContaining('shut down') })
  })
})

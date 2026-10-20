import os from 'node:os'
import type { StoreEvent } from '@review-dash/shared'
import { makeTree } from '@review-dash/shared/testing/fixtures'
import type { WorkingTreeResult } from '@review-dash/shared/git/working-tree'
import { afterEach, describe, expect, it } from 'vitest'
import { HttpError } from '../errors.ts'
import { StoreEventBus } from '../events.ts'
import { TreeCache } from './tree.ts'
import type { ComputeTree } from './tree.ts'

const source = { id: '20260101-0900-fixture-abcd', repo: os.tmpdir(), baseRef: 'origin/master' }

function result(fingerprint: string, durationMs = 7): WorkingTreeResult {
  return { tree: makeTree({ fingerprint, durationMs }), patches: new Map() }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('TreeCache', () => {
  const caches: TreeCache[] = []
  afterEach(() => {
    for (const cache of caches.splice(0)) cache.close()
  })

  function make(compute: ComputeTree, debounceMs = 20) {
    const bus = new StoreEventBus()
    const events: StoreEvent[] = []
    const logs: string[] = []
    bus.subscribe((e) => void events.push(e))
    const cache = new TreeCache({ bus, compute, debounceMs, log: (m) => void logs.push(m) })
    caches.push(cache)
    return { cache, events, logs }
  }

  it('computes once for concurrent requests, serves the cache afterwards and logs the timing', async () => {
    let calls = 0
    const { cache, logs, events } = make(async () => {
      calls += 1
      await sleep(20)
      return result('a'.repeat(16))
    })
    const [first, second] = await Promise.all([cache.get(source), cache.get(source)])
    expect(calls).toBe(1)
    expect(first).toBe(second)
    expect(await cache.get(source)).toBe(first)
    expect(calls).toBe(1)
    expect(logs).toEqual([`tree ${source.id}: 3 files in 7 ms`])
    expect(events).toEqual([])
    expect(cache.peek(source.id)).toBe(first)
  })

  it('recomputes once per burst of invalidations and emits tree.updated only when the fingerprint changed', async () => {
    const fingerprints = ['1'.repeat(16), '1'.repeat(16), '2'.repeat(16)]
    let calls = 0
    const { cache, events } = make(async () => result(fingerprints[Math.min(calls++, fingerprints.length - 1)] ?? ''))
    await cache.get(source)
    cache.invalidate(source.id)
    cache.invalidate(source.id)
    cache.invalidate(source.id)
    await sleep(80)
    expect(calls).toBe(2)
    expect(events).toEqual([])
    cache.invalidate(source.id)
    await sleep(80)
    expect(calls).toBe(3)
    expect(events).toEqual([{ type: 'tree.updated', sessionId: source.id, fingerprint: '2'.repeat(16), durationMs: 7 }])
    expect(cache.peek(source.id)?.tree.fingerprint).toBe('2'.repeat(16))
    cache.invalidate('20260101-0900-unknown-0000')
    await sleep(40)
    expect(calls).toBe(3)
  })

  it('does not serve a tree known to be stale: a read after an invalidation waits for the recompute', async () => {
    const fingerprints = ['1'.repeat(16), '2'.repeat(16)]
    let calls = 0
    const { cache, events } = make(async () => {
      const fingerprint = fingerprints[Math.min(calls++, fingerprints.length - 1)] ?? ''
      if (calls > 1) await sleep(60)
      return result(fingerprint)
    }, 20)
    await cache.get(source)
    // The repo watcher reported an edit; the debounced recompute has not run (or not finished) yet.
    cache.invalidate(source.id)
    const read = await cache.get(source)
    expect(read.tree.fingerprint).toBe('2'.repeat(16))
    expect(calls).toBe(2)
    // The read took over the pending recompute: no second one, and watchers of the stream still hear of the change.
    await sleep(60)
    expect(calls).toBe(2)
    expect(events).toEqual([{ type: 'tree.updated', sessionId: source.id, fingerprint: '2'.repeat(16), durationMs: 7 }])
    // Clean again: served from the cache.
    expect(await cache.get(source)).toBe(read)
    expect(calls).toBe(2)
  })

  it('does not serve a tree stale while a recompute that started before a newer invalidation is in flight', async () => {
    let calls = 0
    const { cache } = make(({ signal }) => {
      calls += 1
      const mine = calls
      return new Promise<WorkingTreeResult>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        setTimeout(() => resolve(result(String(mine).repeat(16))), mine === 1 ? 0 : 30)
      })
    })
    await cache.get(source)
    cache.invalidate(source.id)
    await sleep(90)
    expect(cache.peek(source.id)?.tree.fingerprint).toBe('2'.repeat(16))
    // A second edit lands while the cache holds the result of a compute that began before it.
    cache.invalidate(source.id)
    expect((await cache.get(source)).tree.fingerprint).toBe('3'.repeat(16))
  })

  it('aborts a compute superseded by an invalidation and hands waiters the newer result', async () => {
    let calls = 0
    const { cache } = make(({ signal }) => {
      calls += 1
      const mine = calls
      return new Promise<WorkingTreeResult>((resolve, reject) => {
        if (mine === 1) signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        else setTimeout(() => resolve(result('b'.repeat(16))), 10)
      })
    })
    const pending = cache.get(source)
    cache.invalidate(source.id)
    const got = await pending
    expect(calls).toBe(2)
    expect(got.tree.fingerprint).toBe('b'.repeat(16))
  })

  it('recomputes when the repo or base ref of a session changes', async () => {
    let calls = 0
    const { cache } = make(async ({ baseRef }) => {
      calls += 1
      return result(baseRef === 'main' ? 'c'.repeat(16) : 'd'.repeat(16))
    })
    await cache.get(source)
    const other = await cache.get({ ...source, baseRef: 'main' })
    expect(calls).toBe(2)
    expect(other.tree.fingerprint).toBe('c'.repeat(16))
  })

  it('never caches failures: a missing repo is a 422 repo-missing, a git error a 422', async () => {
    let calls = 0
    const { cache } = make(async () => {
      calls += 1
      throw new Error('fatal: not a git repository')
    })
    const missing = { ...source, repo: `${os.tmpdir()}/review-dash-no-such-repo-${process.pid}` }
    await expect(cache.get(missing)).rejects.toMatchObject({ status: 422, message: `repo-missing: ${missing.repo}` })
    expect(calls).toBe(0)
    await expect(cache.get(source)).rejects.toBeInstanceOf(HttpError)
    await expect(cache.get(source)).rejects.toMatchObject({ status: 422, message: expect.stringContaining('not a git repository') })
    expect(calls).toBe(2)
    expect(cache.peek(source.id)).toBeNull()
  })
})

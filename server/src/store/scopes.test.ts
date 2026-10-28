import { makeTree } from '@scout/shared/testing/fixtures'
import type { WorkingTreeResult } from '@scout/shared/git/working-tree'
import { describe, expect, it } from 'vitest'
import { ScopeCache } from './scopes.ts'
import type { ComputeScope } from './scopes.ts'

const SHA = (n: number) => n.toString(16).padStart(40, '0')
const session = '20260101-0900-fixture-abcd'

function result(fingerprint: string): WorkingTreeResult {
  return { tree: makeTree({ fingerprint: fingerprint.padEnd(16, '0') }), patches: new Map() }
}

describe('ScopeCache', () => {
  it('computes a commit scope once per repo and sha and evicts the least recently used', async () => {
    const calls: string[] = []
    const compute: ComputeScope = async ({ repo, scope }) => {
      calls.push(`${repo}:${scope}`)
      return result(scope.slice(0, 16))
    }
    const cache = new ScopeCache({ compute, maxCommits: 2 })
    const first = await cache.get(session, '/r', SHA(1))
    expect(await cache.get(session, '/r', SHA(1))).toBe(first)
    await cache.get(session, '/r', SHA(2))
    await cache.get('20260101-0900-other-0000', '/other', SHA(1))
    expect(calls).toEqual([`/r:${SHA(1)}`, `/r:${SHA(2)}`, `/other:${SHA(1)}`])
    expect(cache.commitCount).toBe(2)
    // SHA(1) in /r was the oldest: evicted, so it is computed again.
    await cache.get(session, '/r', SHA(1))
    expect(calls).toHaveLength(4)
    expect(calls[3]).toBe(`/r:${SHA(1)}`)
  })

  it('keeps the uncommitted scope per session until invalidated and never caches failures', async () => {
    let calls = 0
    let fail = true
    const compute: ComputeScope = async ({ scope }) => {
      calls += 1
      if (fail) throw new Error('fatal: boom')
      return result(scope === 'uncommitted' ? 'u' : 'c')
    }
    const cache = new ScopeCache({ compute })
    await expect(cache.get(session, '/r', 'uncommitted')).rejects.toThrow('boom')
    await expect(cache.get(session, '/r', SHA(3))).rejects.toThrow('boom')
    fail = false
    const uncommitted = await cache.get(session, '/r', 'uncommitted')
    expect(calls).toBe(3)
    expect(await cache.get(session, '/r', 'uncommitted')).toBe(uncommitted)
    expect(await cache.get(session, '/r', SHA(3))).toBeDefined()
    expect(calls).toBe(4)
    cache.invalidate(session)
    expect(await cache.get(session, '/r', 'uncommitted')).not.toBe(uncommitted)
    expect(calls).toBe(5)
    // A session whose repo path changed recomputes too.
    await cache.get(session, '/moved', 'uncommitted')
    expect(calls).toBe(6)
  })
})

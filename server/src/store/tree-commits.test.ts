import os from 'node:os'
import type { CommitList, StoreEvent } from '@scout/shared'
import { CommitListSchema } from '@scout/shared'
import { makeTree } from '@scout/shared/testing/fixtures'
import type { WorkingTreeResult } from '@scout/shared/git/working-tree'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { StoreEventBus } from '../events.ts'
import { createFixtureRepo } from '../testing/fixture-repo.ts'
import type { FixtureRepo } from '../testing/fixture-repo.ts'
import { TreeCache } from './tree.ts'

const source = { id: '20260101-0900-fixture-abcd', repo: os.tmpdir(), baseRef: 'origin/master' }
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function treeResult(fingerprint: string): WorkingTreeResult {
  return { tree: makeTree({ fingerprint }), patches: new Map() }
}

function commitList(fingerprint: string): CommitList {
  const { baseSha, headSha } = makeTree()
  return { baseRef: 'origin/master', baseSha, headSha, branch: 'feature', remote: { ref: null, ahead: 0, behind: 0 }, commits: [], uncommitted: null, fingerprint }
}

describe('TreeCache with commits', () => {
  const caches: TreeCache[] = []
  afterEach(() => {
    for (const cache of caches.splice(0)) cache.close()
  })

  it('emits tree.updated when only the commit list fingerprint changed', async () => {
    const commitFingerprints = ['1'.repeat(16), '1'.repeat(16), '2'.repeat(16)]
    let calls = 0
    const bus = new StoreEventBus()
    const events: StoreEvent[] = []
    bus.subscribe((e) => void events.push(e))
    const cache = new TreeCache({
      bus,
      debounceMs: 20,
      log: () => undefined,
      compute: async () => treeResult('a'.repeat(16)),
      computeCommits: async () => commitList(commitFingerprints[Math.min(calls++, 2)] ?? ''),
    })
    caches.push(cache)
    const first = await cache.get(source)
    expect(first.commits.fingerprint).toBe('1'.repeat(16))
    cache.invalidate(source.id)
    await sleep(60)
    expect(events).toEqual([])
    cache.invalidate(source.id)
    await sleep(60)
    expect(events).toEqual([{ type: 'tree.updated', sessionId: source.id, fingerprint: 'a'.repeat(16), durationMs: first.tree.durationMs }])
    expect(cache.peek(source.id)?.commits.fingerprint).toBe('2'.repeat(16))
  })

  it('derives an empty commit list when only the tree compute is injected', async () => {
    const cache = new TreeCache({ bus: new StoreEventBus(), log: () => undefined, compute: async () => treeResult('b'.repeat(16)) })
    caches.push(cache)
    const { commits, tree } = await cache.get(source)
    expect(CommitListSchema.parse(commits)).toEqual(commits)
    expect(commits).toMatchObject({ baseSha: tree.baseSha, headSha: tree.headSha, commits: [], uncommitted: null, remote: { ref: null, ahead: 0, behind: 0 } })
  })
})

describe('TreeCache on a real repo', () => {
  let repo: FixtureRepo
  beforeAll(async () => {
    repo = await createFixtureRepo()
  })
  afterAll(() => repo.cleanup())

  it('computes the tree and the commit list together', async () => {
    const cache = new TreeCache({ bus: new StoreEventBus(), log: () => undefined })
    try {
      const { tree, commits } = await cache.get({ id: source.id, repo: repo.repo, baseRef: 'origin/master' })
      expect(CommitListSchema.parse(commits)).toEqual(commits)
      expect(commits.baseSha).toBe(tree.baseSha)
      expect(commits.headSha).toBe(tree.headSha)
      expect(commits.commits.map((c) => [c.subject, c.pushed, c.stats.files])).toEqual([['feature work', false, 3]])
      expect(commits.remote).toEqual({ ref: null, ahead: 1, behind: 0 })
      expect(commits.uncommitted).toMatchObject({ files: 5 })
    } finally {
      cache.close()
    }
  })
})

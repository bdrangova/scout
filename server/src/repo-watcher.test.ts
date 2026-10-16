import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RepoWatcher, repoPathMatters } from './repo-watcher.ts'

describe('repoPathMatters', () => {
  it.each([
    ['src/app.ts', true],
    ['', true],
    ['.gitignore', true],
    ['.git/HEAD', true],
    ['.git/index', true],
    ['.git/ORIG_HEAD', true],
    ['.git/packed-refs', true],
    ['.git/refs/heads/main', true],
    ['.git/refs/remotes/origin/master', true],
    ['.git/index.lock', false],
    ['.git/objects/ab/cdef', false],
    ['.git/logs/HEAD', false],
    ['.git/FETCH_HEAD', false],
    ['.git', false],
    ['node_modules/x/index.js', false],
    ['packages/a/node_modules/y.js', false],
    ['dist/bundle.js', false],
    ['build/out', false],
    ['coverage/lcov.info', false],
    ['.cache/x', false],
    ['src/.DS_Store', false],
    ['src/distance.ts', true],
  ])('%s → %s', (rel, expected) => {
    expect(repoPathMatters(rel)).toBe(expected)
  })
})

describe('RepoWatcher', () => {
  let dir: string
  beforeAll(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'review-dash-rw-')))
    await fs.mkdir(path.join(dir, 'node_modules', 'x'), { recursive: true })
    await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  })
  afterAll(() => fs.rm(dir, { recursive: true, force: true }))

  it('reports edits that matter, ignores node_modules, and stops on unwatch', async () => {
    const seen: string[] = []
    const logs: string[] = []
    const watcher = new RepoWatcher((id) => void seen.push(id), (m) => void logs.push(m))
    try {
      watcher.watch('s1', dir)
      watcher.watch('s1', dir)
      expect([...watcher.active]).toEqual([['s1', dir]])
      watcher.watch('missing', path.join(dir, 'no-such-dir'))
      expect(logs).toEqual([expect.stringContaining('could not start')])
      expect(watcher.active.has('missing')).toBe(false)

      // FSEvents may replay events from just before the watch started (the folder's own creation).
      await new Promise((resolve) => setTimeout(resolve, 500))
      seen.length = 0
      await fs.writeFile(path.join(dir, 'node_modules', 'x', 'index.js'), 'x')
      await new Promise((resolve) => setTimeout(resolve, 400))
      expect(seen).toEqual([])

      await fs.writeFile(path.join(dir, 'src', 'a.ts'), 'a')
      const deadline = Date.now() + 5000
      while (seen.length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
      expect(seen.length).toBeGreaterThan(0)
      expect(new Set(seen)).toEqual(new Set(['s1']))

      watcher.unwatch('s1')
      const before = seen.length
      await fs.writeFile(path.join(dir, 'src', 'b.ts'), 'b')
      await new Promise((resolve) => setTimeout(resolve, 400))
      expect(seen.length).toBe(before)
    } finally {
      watcher.close()
    }
  })
})

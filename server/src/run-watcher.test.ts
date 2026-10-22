import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { StoreEvent } from '@review-dash/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { StoreEventBus } from './events.ts'
import { RunWatcher, outermostPaths, runPathMatters } from './run-watcher.ts'

describe('runPathMatters', () => {
  it.each([
    ['/r/run/test-run.json', true],
    ['/r/run/scenarios/s1/screenshots/a.png', true],
    ['/r/run/scenarios/s1/screenshots/raw/a.png', false],
    ['/r/run/scenarios/s1/screenshots/raw', false],
    ['/r/run/screenshots/rawer/a.png', true],
    ['/r/run/node_modules/x.js', false],
    ['/r/.git/HEAD', false],
    ['/r/run/.DS_Store', false],
  ])('%s → %s', (file, expected) => {
    expect(runPathMatters(file.split('/').join(path.sep))).toBe(expected)
  })
})

describe('outermostPaths', () => {
  it('drops paths another path contains and duplicates', () => {
    expect(outermostPaths(['/r/plan/runs/run-1', '/r/plan', '/r/bugs', '/r/plan', '/r/planner'])).toEqual(['/r/plan', '/r/bugs', '/r/planner'])
  })
})

describe('RunWatcher', () => {
  let dir: string
  beforeAll(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'review-dash-runw-')))
    await fs.mkdir(path.join(dir, 'run', 'scenarios', 's1', 'screenshots', 'raw'), { recursive: true })
    await fs.mkdir(path.join(dir, 'bugs'), { recursive: true })
    await fs.writeFile(path.join(dir, 'run', 'test-run.json'), '{}')
  })
  afterAll(() => fs.rm(dir, { recursive: true, force: true }))

  function setup(debounceMs = 50) {
    const bus = new StoreEventBus()
    const events: StoreEvent[] = []
    bus.subscribe((event) => void events.push(event))
    const invalidated: string[] = []
    const watcher = new RunWatcher({ bus, invalidate: (id) => void invalidated.push(id), stabilityThreshold: 50, pollInterval: 10, debounceMs, log: () => undefined })
    return { watcher, events, invalidated }
  }

  async function waitFor(pred: () => boolean, ms = 5000): Promise<void> {
    const end = Date.now() + ms
    while (!pred()) {
      if (Date.now() > end) throw new Error('timed out')
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  it('invalidates and emits testrun.updated for a change in the run folder or a root, and not for raw/', async () => {
    const { watcher, events, invalidated } = setup()
    try {
      await watcher.watch('s1', [path.join(dir, 'run'), path.join(dir, 'bugs')])
      expect([...watcher.active.keys()]).toEqual(['s1'])

      await fs.writeFile(path.join(dir, 'run', 'scenarios', 's1', 'screenshots', 'raw', 'a.png'), 'raw')
      await new Promise((resolve) => setTimeout(resolve, 400))
      expect(events).toEqual([])
      expect(invalidated).toEqual([])

      await fs.writeFile(path.join(dir, 'run', 'scenarios', 's1', 'screenshots', 'a.png'), 'png')
      await waitFor(() => events.length > 0)
      expect(events).toEqual([{ type: 'testrun.updated', sessionId: 's1' }])
      expect(invalidated.length).toBeGreaterThan(0)

      await new Promise((resolve) => setTimeout(resolve, 200))
      events.length = 0
      await fs.writeFile(path.join(dir, 'bugs', 'x.md'), '# bug')
      await waitFor(() => events.length > 0)
      expect(events[0]).toEqual({ type: 'testrun.updated', sessionId: 's1' })
    } finally {
      await watcher.close()
    }
  })

  it('collapses a burst into one event and stops after unwatch', async () => {
    const { watcher, events } = setup(500)
    try {
      await watcher.watch('s2', [path.join(dir, 'run')])
      for (let i = 0; i < 5; i += 1) await fs.writeFile(path.join(dir, 'run', `burst-${i}.txt`), 'x')
      await waitFor(() => events.length > 0)
      await new Promise((resolve) => setTimeout(resolve, 800))
      expect(events).toHaveLength(1)

      watcher.unwatch('s2')
      expect(watcher.active.size).toBe(0)
      events.length = 0
      await fs.writeFile(path.join(dir, 'run', 'after.txt'), 'x')
      await new Promise((resolve) => setTimeout(resolve, 400))
      expect(events).toEqual([])
    } finally {
      await watcher.close()
    }
  })
})

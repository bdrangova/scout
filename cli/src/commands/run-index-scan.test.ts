import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { alignWithIndex, captionFromFileName, classifyFolders, diffHashes, layerFromFileName, logRangesForId, mergeHitRanges, scanRun, scenarioIdFromFolder } from './run-index-scan.ts'

describe('pure helpers', () => {
  it('maps folder names to scenario ids', () => {
    expect(scenarioIdFromFolder('s9-tables')).toBe('S9')
    expect(scenarioIdFromFolder('S9-clean')).toBe('S9')
    expect(scenarioIdFromFolder('_s5-superseded')).toBe('S5')
    expect(scenarioIdFromFolder('s10-x')).toBe('S10')
    expect(scenarioIdFromFolder('misc')).toBeNull()
    expect(scenarioIdFromFolder('notes-s')).toBeNull()
  })

  it('classifies current, superseded and ignored folders', () => {
    const result = classifyFolders(['s9-tables', 'S9-clean', '_s5-superseded', 's5-a-superseded', 'misc', 's1-x'])
    const state = Object.fromEntries(result.map((f) => [f.folder, f.state]))
    expect(state).toEqual({ 'S9-clean': 'current', 's9-tables': 'ignored', '_s5-superseded': 'superseded', 's5-a-superseded': 'superseded', misc: 'ignored', 's1-x': 'current' })
  })

  it('derives layer and caption from file names', () => {
    expect(layerFromFileName('l1-foo')?.layer).toBe('L1-2')
    expect(layerFromFileName('l3-foo')?.layer).toBe('L3')
    expect(layerFromFileName('e2e-foo')?.layer).toBe('E2E')
    expect(layerFromFileName('plain')).toBeNull()
    expect(captionFromFileName('e2e-s1-02-b-result-expanded.png')).toBe('Result expanded')
    expect(captionFromFileName('e2e-d1-03-prc3-saved-draft-v1.2.png', { withDataId: true })).toBe('D1: Prc3 saved draft v1.2')
    expect(captionFromFileName('e2e-test-1-truncation-1.mp4')).toBe('Test 1 truncation 1')
  })

  it('merges hits, pads, caps ranges and keeps S1 apart from S10', () => {
    expect(mergeHitRanges([5, 7, 20], 100)).toEqual([
      { from: 4, to: 8, firstHit: 5 },
      { from: 19, to: 21, firstHit: 20 },
    ])
    expect(mergeHitRanges([1], 1)).toEqual([{ from: 1, to: 1, firstHit: 1 }])
    const long = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(mergeHitRanges(long, 200)).toEqual([{ from: 1, to: 40, firstHit: 1 }])
    const lines = ['intro', '## S10 Table', 'S1 passed here', 'x', 'x', 'x', 'x', 'x']
    const ranges = logRangesForId('S1', lines, 'a.md')
    expect(ranges).toEqual([{ path: 'run:logs/a.md', from: 2, to: 4, label: 'a.md: S1 passed here' }])
    expect(logRangesForId('s1', lines, 'a.md')).toEqual([])
  })

  it('diffs hashes', () => {
    expect(diffHashes({ a: '1', b: '2', c: '3' }, { a: '1', b: 'x', d: '4' })).toEqual({ first: false, changed: ['b'], added: ['c'], dropped: ['d'] })
    expect(diffHashes({ a: '1' }, undefined)).toEqual({ first: true, changed: [], added: ['a'], dropped: [] })
  })
})

describe('scanRun', () => {
  let dir: string
  let run: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ai-review-scan-'))
    run = path.join(dir, 'f', 'a', 'test-runs', 'r1')
    const put = async (rel: string, text = 'x'): Promise<void> => {
      await mkdir(path.dirname(path.join(run, rel)), { recursive: true })
      await writeFile(path.join(run, rel), text)
    }
    await put('steps.md', '# steps\n')
    await put('logs/l4.md', 'a\nS1 ok\nb\nS10 other\n')
    await put('logs/empty.log', '')
    await put('logs/x.log', 'S1 failed\n')
    await put('scenarios/s1-a/videos/e2e-s1-1.mp4')
    await put('scenarios/s1-a/videos/e2e-s1-1.webm')
    await put('scenarios/s1-a/videos/two.webm')
    await put('scenarios/s1-a/screenshots/e2e-s1-02-b-result-expanded.png', 'png')
    await put('scenarios/s1-a/screenshots/raw/e2e-raw.png')
    await put('scenarios/s1-a/data/l1-out.json', '{}')
    await put('scenarios/_s2-superseded/screenshots/a.png')
    await put('scenarios/junk/screenshots/a.png')
    await put('data-setup/videos/d1.mp4')
    await put('data-setup/videos/d1.webm')
    await put('data-setup/screenshots/e2e-d1-03-saved.png')
    await put('data-setup/screenshots/_aborted.png')
    await put('data-setup/_aborted-1/x.png')
    await put('db-snapshots/old.dump')
    await put('db-snapshots/new.dump')
    await utimes(path.join(run, 'db-snapshots', 'old.dump'), new Date(1000), new Date(1000))
    await put('../../test-plan.md', '# plan\n')
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads folders, evidence, log excerpts, data-setup and hashes', async () => {
    const scan = await scanRun(run, null)
    expect(scan.scenarioFolders.map((f) => [f.folder, f.state])).toEqual([['_s2-superseded', 'superseded'], ['junk', 'ignored'], ['s1-a', 'current']])
    expect(scan.scenarios.map((s) => [s.id, s.folder, s.onlySuperseded])).toEqual([['S1', 's1-a', false], ['S2', null, true]])
    const s1 = scan.scenarios[0]
    expect(s1?.evidence.videos.map((v) => v.path)).toEqual(['run:scenarios/s1-a/videos/e2e-s1-1.mp4', 'run:scenarios/s1-a/videos/two.webm'])
    expect(s1?.evidence.screenshots).toEqual([{ path: 'run:scenarios/s1-a/screenshots/e2e-s1-02-b-result-expanded.png', caption: 'Result expanded', layer: 'E2E' }])
    expect(s1?.evidence.data[0]).toMatchObject({ layer: 'L1-2' })
    expect(s1?.logExcerpts.map((l) => [l.path, l.from, l.to])).toEqual([['run:logs/l4.md', 1, 3], ['run:logs/x.log', 1, 1]])
    expect(scan.logs.map((l) => l.path)).toEqual(['run:logs/l4.md', 'run:logs/x.log'])
    expect(scan.dataSetup.videos.map((v) => v.path)).toEqual(['run:data-setup/videos/d1.mp4'])
    expect(scan.dataSetup.screenshots).toEqual([{ path: 'run:data-setup/screenshots/e2e-d1-03-saved.png', caption: 'D1: Saved', layer: 'E2E' }])
    expect(scan.dataSetup.snapshotPath).toBe(path.join(run, 'db-snapshots', 'new.dump'))
    expect(scan.hashes['steps.md']).toMatch(/^[0-9a-f]{16}$/)
    expect(scan.hashes['plan:test-plan.md']).toMatch(/^[0-9a-f]{16}$/)
    expect(scan.hashes['run:scenarios/s1-a/videos/e2e-s1-1.mp4'] ?? scan.hashes['scenarios/s1-a/videos/e2e-s1-1.mp4']).toBe('size:1')
    expect(scan.diff).toBeNull()
  })

  it('diffs against publishedBy.<owner>.hashes and filters keys by owner', async () => {
    const first = await scanRun(run, 'run')
    expect(first.diff?.first).toBe(true)
    expect(Object.keys(first.hashes).some((k) => k.startsWith('data-setup/'))).toBe(false)
    const index = { schemaVersion: 1, runId: 'r1', publishedBy: { run: { at: '2026-10-30T10:00:00.000Z', hashes: { ...first.hashes, 'steps.md': 'stale', 'logs/gone.md': 'x' } } }, scenarios: [{ id: 'S3' }] }
    await writeFile(path.join(run, 'test-run.json'), JSON.stringify(index))
    const again = await scanRun(run, 'run')
    expect(again.diff).toEqual({ first: false, changed: ['steps.md'], added: [], dropped: ['logs/gone.md'] })
    expect(again.scenarios.map((s) => s.id)).toContain('S3')
    expect(Object.keys((await scanRun(run, 'plan')).hashes)).toEqual(['plan:test-plan.md'])
  })
})

describe('alignWithIndex', () => {
  it('uses the index id with the same number, and keeps S<N> when none or several match', () => {
    const folders = classifyFolders(['s1-pass', 's2-fail', 's3-gap'])
    expect(alignWithIndex(folders, ['s1-pass', 'S2-a', 'S2-b']).map((f) => f.id)).toEqual(['s1-pass', 'S2', 'S3'])
  })
})

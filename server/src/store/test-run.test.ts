import fs from 'node:fs/promises'
import path from 'node:path'
import { TestRunIndexSchema } from '@scout/shared'
import type { Scenario, TestRunIndex, TestRunManifest } from '@scout/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIXTURE_T0, TEST_RUN_SESSION_ID, createFixtureStore } from '../testing/fixture-store.ts'
import type { FixtureStore } from '../testing/fixture-store.ts'
import { deriveRunDetail, normalizeRef, parseRunIndex, resolveRoots, scenarioFingerprint, servablePaths } from './test-run.ts'

let store: FixtureStore
let manifest: TestRunManifest
let runPath: string
let index: TestRunIndex
beforeAll(async () => {
  store = await createFixtureStore({ testRun: true })
  manifest = store.testRun?.manifest ?? (() => { throw new Error('no test run') })()
  runPath = store.testRun?.runPath ?? ''
  const parsed = parseRunIndex(await fs.readFile(path.join(runPath, 'test-run.json'), 'utf8'))
  if (!parsed.ok) throw new Error(parsed.error)
  index = parsed.index
})
afterAll(() => store.cleanup())

describe('normalizeRef', () => {
  it('collapses empty and dot segments and rejects malformed refs', () => {
    expect(normalizeRef('run:a//b/./c.png')).toBe('run:a/b/c.png')
    expect(normalizeRef('run:../x')).toBeNull()
    expect(normalizeRef('run:/x')).toBeNull()
    expect(normalizeRef('run:.')).toBeNull()
    expect(normalizeRef('nocolon')).toBeNull()
  })
})

describe('parseRunIndex', () => {
  it('warns about unsupported panels and dangling links without failing', async () => {
    const broken = JSON.parse(await fs.readFile(path.join(runPath, 'test-run.json'), 'utf8')) as { scenarios: { links: { bugs: string[] } }[] }
    const [first] = broken.scenarios
    if (first) first.links.bugs = ['ghost']
    const parsed = parseRunIndex(JSON.stringify(broken))
    expect(parsed).toMatchObject({ ok: true })
    if (parsed.ok) expect(parsed.warnings).toEqual(['overview[9]: unknown panel type "weird"', 'scenario s1-pass links bug ghost, which is not in the index'])
  })

  it('fails on invalid JSON and on an invalid index', () => {
    expect(parseRunIndex('{')).toMatchObject({ ok: false, error: expect.stringMatching(/not valid JSON/) })
    expect(parseRunIndex('{"schemaVersion":1}')).toMatchObject({ ok: false, error: expect.stringMatching(/invalid/) })
  })
})

describe('resolveRoots', () => {
  it('resolves every root against the run folder, realpath-ed', async () => {
    const roots = await resolveRoots(manifest, runPath, index)
    expect(roots).toEqual({ run: runPath, plan: path.join(runPath, 'plan'), bugs: path.join(runPath, 'bugs') })
  })

  it('refuses a root that leaves the run folder, lexically or through a symlink', async () => {
    await expect(resolveRoots(manifest, runPath, { roots: { run: '.', up: '..' } })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/leaves the run folder/) })
    await expect(resolveRoots(manifest, runPath, { roots: { run: '.', abs: store.repo.repo } })).rejects.toMatchObject({ status: 422 })
    await fs.symlink(store.repo.repo, path.join(runPath, 'sneaky'))
    await expect(resolveRoots(manifest, runPath, { roots: { run: '.', sneaky: 'sneaky' } })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/leaves the run folder/) })
    await fs.rm(path.join(runPath, 'sneaky'))
  })

  it('is a 422 when the run folder does not exist', async () => {
    await expect(resolveRoots(manifest, path.join(runPath, 'nope'), { roots: { run: '.' } })).rejects.toMatchObject({ status: 422 })
  })

  it('keeps a root whose folder does not exist yet', async () => {
    const roots = await resolveRoots(manifest, runPath, { roots: { run: '.', later: 'later' } })
    expect(roots['later']).toBe(path.join(runPath, 'later'))
  })
})

describe('servablePaths', () => {
  it('is exactly the refs the index names, including data, panels, logs, bugs and data setup', async () => {
    const roots = await resolveRoots(manifest, runPath, index)
    const withSetup = TestRunIndexSchema.parse({
      ...index,
      dataSetup: { steps: [], videos: [{ path: 'run:setup/v.mp4' }], screenshots: [{ path: 'run:setup/./s.png' }] },
    })
    expect([...servablePaths(withSetup, roots)].sort()).toEqual(
      [
        'bugs:x/screenshots/1.png',
        'bugs:x/x.md',
        'run:logs/run.log',
        'run:scenarios/s1-pass/data/out.json',
        'run:scenarios/s1-pass/screenshots/s1-01-a.png',
        'run:scenarios/s1-pass/videos/test-1-pass-1.mp4',
        'run:scenarios/s2-fail/data/out.json',
        'run:scenarios/s2-fail/screenshots/s2-01-a.png',
        'run:scenarios/s2-fail/videos/test-2-fail-1.mp4',
        'run:scenarios/s3-gap/screenshots/s3-01-a.png',
        'run:setup/s.png',
        'run:setup/v.mp4',
      ].sort(),
    )
  })

  it('leaves out refs whose alias has no root', () => {
    expect([...servablePaths(index, { run: '/x' })].every((ref) => ref.startsWith('run:'))).toBe(true)
  })
})

describe('scenarioFingerprint', () => {
  const scenario = (overrides: Partial<Scenario> = {}): Scenario => {
    const base = index.scenarios[0]
    if (!base) throw new Error('no scenario')
    return { ...base, ...overrides }
  }
  const stats = (size: number) => new Map([['run:scenarios/s1-pass/screenshots/s1-01-a.png', { size }]])

  it('depends on evidence sizes, step text and status, not on logs, captions or notes', () => {
    const baseline = scenarioFingerprint(scenario(), stats(10))
    expect(baseline).toMatch(/^[0-9a-f]{16}$/)
    expect(scenarioFingerprint(scenario(), stats(10))).toBe(baseline)
    expect(scenarioFingerprint(scenario(), stats(11))).not.toBe(baseline)
    expect(scenarioFingerprint(scenario({ status: 'fail' }), stats(10))).not.toBe(baseline)
    expect(scenarioFingerprint(scenario({ steps: [{ action: 'other' }] }), stats(10))).not.toBe(baseline)
    expect(scenarioFingerprint(scenario({ logs: [], notes: 'changed' }), stats(10))).toBe(baseline)
  })
})

describe('deriveRunDetail', () => {
  it('derives the detail with the injected clock', async () => {
    const detail = await deriveRunDetail(manifest, runPath, () => FIXTURE_T0)
    expect(detail).toMatchObject({ kind: 'test-run', computedAt: FIXTURE_T0, missing: [] })
    expect(detail.manifest.id).toBe(TEST_RUN_SESSION_ID)
  })
})

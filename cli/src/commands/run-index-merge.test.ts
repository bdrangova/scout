import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mergeRunIndex, indexSkeleton } from './run-index-merge.ts'
import { checkRunIndex, runMerge } from './run-index.ts'

const NOW = new Date('2026-10-30T10:00:00.000Z')
let dir: string
let run: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'ai-review-merge-'))
  run = path.join(dir, 'feat', 'area', 'test-runs', 'run-1')
  await mkdir(run, { recursive: true })
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function merge(owner: 'plan' | 'data-setup' | 'run', patch: unknown, existing: Record<string, unknown> | null) {
  return mergeRunIndex({ runPath: run, owner, existing, patch, now: NOW })
}

describe('mergeRunIndex', () => {
  it('creates the skeleton with the plan and bugs roots inside the run folder', () => {
    const skeleton = indexSkeleton({ runId: 'run-1', title: 'Run one', feature: 'feat', area: 'area' }, NOW.toISOString())
    expect(skeleton).toMatchObject({ runId: 'run-1', title: 'Run one', feature: 'feat', area: 'area', roots: { run: '.', plan: 'plan', bugs: 'bugs' }, scenarios: [] })
  })

  it('names the skeleton after the session folder when no index exists yet', () => {
    expect(merge('plan', { title: 'P' }, null).index).toMatchObject({ runId: path.basename(path.dirname(run)), roots: { run: '.', plan: 'plan', bugs: 'bugs' } })
  })

  it('plan: adds scenarios as planned, keeps run data of existing ones and observed steps', () => {
    const first = merge('plan', { title: 'Plan', scenarios: [{ id: 'S1', title: 'One', order: 0, steps: [{ label: '1', action: 'a', expected: 'e' }] }], overview: [{ type: 'markdown', title: 'Plan summary', markdown: 'x' }], hashes: { 'plan:test-plan.md': 'abc' } }, null)
    expect(first.errors).toEqual([])
    const index = first.index ?? {}
    expect(index['title']).toBe('Plan')
    expect(index['publishedBy']).toEqual({ plan: { at: NOW.toISOString(), hashes: { 'plan:test-plan.md': 'abc' } } })
    const run1 = merge('run', { scenarios: [{ id: 'S1', status: 'pass', steps: [{ observed: 'o', result: 'ok' }], notes: 'n' }] }, index)
    const second = merge('plan', { scenarios: [{ id: 'S1', title: 'One v2', order: 3, steps: [{ label: '1', action: 'a2', expected: 'e2' }, { label: '2', action: 'b' }] }] }, run1.index)
    const scenario = (second.index?.['scenarios'] as Record<string, unknown>[])[0]
    expect(scenario).toMatchObject({ id: 'S1', title: 'One v2', order: 3, status: 'pass', notes: 'n' })
    expect(scenario?.['steps']).toEqual([
      { label: '1', action: 'a2', expected: 'e2', observed: 'o', result: 'ok' },
      { label: '2', action: 'b' },
    ])
  })

  it('rejects keys the owner does not own and returns no index', () => {
    expect(merge('plan', { dataSetup: {} }, null).errors[0]).toContain('plan owner cannot set dataSetup')
    expect(merge('run', { scenarios: [{ id: 'S1', title: 'x', order: 1 }], title: 'T' }, null).errors.join('\n')).toContain('title')
    const existing = merge('plan', { scenarios: [{ id: 'S1', title: 'One', order: 0 }] }, null).index
    const bad = merge('run', { scenarios: [{ id: 'S1', title: 'Renamed' }] }, existing)
    expect(bad.index).toBeNull()
    expect(bad.errors[0]).toContain('cannot set title')
    expect(merge('run', { overview: [{ type: 'markdown', title: 'Plan summary', markdown: 'x' }] }, null).errors[0]).toContain('cannot set the panel "Plan summary"')
    expect(merge('data-setup', { roots: { bugs: 'x' } }, null).errors[0]).toContain('cannot set roots')
    expect(merge('run', { roots: { plan: 'x' } }, null).errors[0]).toContain('cannot set plan')
    expect(merge('run', { pages: ['data-setup'] }, null).errors[0]).toContain('cannot add "data-setup"')
  })

  it('run: adds unknown scenarios with defaults, orders panels and honours removePanels', () => {
    const plan = merge('plan', { overview: [{ type: 'markdown', title: 'Plan summary', markdown: 'x' }, { type: 'table', title: 'Test split', columns: [], rows: [] }] }, null).index
    const other = { ...plan, overview: [...(plan?.['overview'] as unknown[]), { type: 'markdown', title: 'Mine', markdown: 'm' }] }
    const result = merge(
      'run',
      {
        scenarios: [{ id: 'S2', title: 'Two', order: 1, status: 'fail' }],
        overview: [{ type: 'scenario-list', title: 'Scenarios' }, { type: 'stats', title: 'Results', items: [] }],
        pages: ['gaps', 'logs'],
        roots: { bugs: 'all-bugs' },
      },
      other,
    )
    expect(result.errors).toEqual([])
    const titles = (result.index?.['overview'] as { title: string }[]).map((p) => p.title)
    expect(titles).toEqual(['Plan summary', 'Test split', 'Results', 'Scenarios', 'Mine'])
    expect((result.index?.['scenarios'] as Record<string, unknown>[])[0]).toMatchObject({ id: 'S2', title: 'Two', status: 'fail', logs: [], links: { gaps: [], bugs: [] } })
    expect(result.index?.['pages']).toEqual(['gaps', 'logs'])
    expect(result.index?.['roots']).toEqual({ run: '.', plan: 'plan', bugs: 'all-bugs' })
    const removed = merge('run', { removePanels: ['Scenarios'], overview: [] }, result.index)
    expect((removed.index?.['overview'] as { title: string }[]).map((p) => p.title)).toEqual(['Plan summary', 'Test split', 'Results', 'Mine'])
    // an owned panel absent from the patch stays when not listed in removePanels
    const kept = merge('run', { overview: [{ type: 'stats', title: 'Results', items: [] }] }, result.index)
    expect((kept.index?.['overview'] as { title: string }[]).map((p) => p.title)).toContain('Scenarios')
    expect(merge('run', { removePanels: ['Mine'] }, result.index).errors[0]).toContain('cannot remove "Mine"')
  })

  it('data-setup: sets dataSetup and the page, preserves unknown fields, removes on null', () => {
    const existing = { ...indexSkeleton({ runId: 'r', title: 'r', feature: null, area: null }, NOW.toISOString()), extra: { keep: true }, pages: ['gaps'] }
    const result = merge('data-setup', { dataSetup: { steps: [], videos: [], screenshots: [] }, pages: ['data-setup'] }, existing)
    expect(result.index).toMatchObject({ extra: { keep: true }, pages: ['gaps', 'data-setup'], dataSetup: { steps: [] } })
    const removed = merge('data-setup', { dataSetup: null, removePages: ['data-setup'] }, result.index)
    expect(removed.index?.['dataSetup']).toBeUndefined()
    expect(removed.index?.['pages']).toEqual(['gaps'])
  })
})

describe('run-index merge command', () => {
  it('writes nothing when validation fails and renames the temp file on success', async () => {
    const patchFile = path.join(dir, 'patch.json')
    await writeFile(patchFile, JSON.stringify({ scenarios: [{ id: 'S1', title: 'One', order: 0, steps: [{ action: 'a' }] }], overview: [{ type: 'markdown', title: 'Plan summary', markdown: 'x' }] }))
    expect(await runMerge(run, { owner: 'plan', from: patchFile })).toBe(0)
    expect(await readdir(run)).toEqual(['test-run.json'])
    const report = await checkRunIndex(run)
    expect(report.errors).toEqual([])
    expect(report.index?.scenarios[0]?.status).toBe('planned')

    const before = await readFile(path.join(run, 'test-run.json'), 'utf8')
    await writeFile(patchFile, JSON.stringify({ scenarios: [{ id: 'S1', evidence: { videos: [{ path: '../escape.mp4' }] } }] }))
    expect(await runMerge(run, { owner: 'run', from: patchFile })).toBe(1)
    expect(await readFile(path.join(run, 'test-run.json'), 'utf8')).toBe(before)
  })
})

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SESSION_ID, T0, makeManifest, makeTestRunManifest } from '../testing/fixtures.ts'
import { CommentSchema, ReviewSchema, emptyReview } from './review.ts'
import { ManifestSchema, agentCwd, isTestRun, manifestKind } from './manifest.ts'
import { PanelSchema, RunRefSchema, TestRunIndexSchema, parseRunRef } from './test-run.ts'

const FIXTURE = fileURLToPath(new URL('../../../fixtures/test-runs/demo/plans/f/a/test-runs/run-1/test-run.json', import.meta.url))

function fixtureJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>
}

describe('TestRunIndexSchema', () => {
  it('parses the fixture run index', () => {
    const index = TestRunIndexSchema.parse(fixtureJson())
    expect(index.scenarios.map((scenario) => [scenario.id, scenario.status])).toEqual([
      ['s1-pass', 'pass'],
      ['s2-fail', 'fail'],
      ['s3-gap', 'gap'],
    ])
    expect(index.pages).toEqual(['gaps', 'logs'])
    expect(index.scenarios[1]?.links.bugs).toEqual(['x'])
    expect(index.scenarios[2]?.evidence.videos).toEqual([])
  })

  it('keeps an unknown panel type as unsupported and everything else intact', () => {
    const index = TestRunIndexSchema.parse(fixtureJson())
    const weird = index.overview.at(-1)
    expect(weird).toMatchObject({ type: 'unsupported', originalType: 'weird', reason: 'unknown-type', original: { type: 'weird', payload: { a: 1 } } })
    expect(index.overview.map((panel) => panel.type)).toEqual([
      'stats', 'markdown', 'table', 'key-value', 'gallery', 'video', 'log', 'links', 'scenario-list', 'unsupported',
    ])
  })

  it('turns a known panel with a broken shape into unsupported (invalid-shape), not a parse failure', () => {
    const panel = PanelSchema.parse({ type: 'stats', items: 'nope' })
    expect(panel).toMatchObject({ type: 'unsupported', originalType: 'stats', reason: 'invalid-shape' })
  })

  it('applies defaults for sparse scenarios', () => {
    const json = fixtureJson()
    json['scenarios'] = [{ id: 'a1', title: 'A', status: 'planned', order: 0 }]
    const [scenario] = TestRunIndexSchema.parse(json).scenarios
    expect(scenario?.evidence).toEqual({ videos: [], screenshots: [], data: [] })
    expect(scenario?.logs).toEqual([])
    expect(scenario?.links).toEqual({ gaps: [], bugs: [] })
  })

  it('rejects duplicate scenario ids', () => {
    const json = fixtureJson()
    const scenarios = json['scenarios'] as Record<string, unknown>[]
    json['scenarios'] = [...scenarios, { ...scenarios[0] }]
    const result = TestRunIndexSchema.safeParse(json)
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('duplicate scenario id s1-pass')
  })

  it('rejects a bad scenario id, status and evidence ref', () => {
    const json = fixtureJson()
    const first = (json['scenarios'] as Record<string, unknown>[])[0]
    for (const patch of [{ id: '1bad' }, { status: 'maybe' }, { evidence: { videos: [{ path: '/etc/passwd' }] } }]) {
      expect(TestRunIndexSchema.safeParse({ ...json, scenarios: [{ ...first, ...patch }] }).success).toBe(false)
    }
  })

  it('validates roots: relative, run must be ".", ".." only as a leading chain', () => {
    const parse = (roots: Record<string, string>) => TestRunIndexSchema.safeParse({ ...fixtureJson(), roots })
    expect(parse({ run: '.', plan: '../..', bugs: '../../bugs' }).success).toBe(true)
    expect(parse({ run: '.', bugs: '/abs/bugs' }).success).toBe(false)
    expect(parse({ run: '.', bugs: 'bugs/../../../etc' }).success).toBe(false)
    expect(parse({ plan: '../..' }).success).toBe(false)
    expect(parse({ run: './x' }).success).toBe(false)
    expect(parse({ run: '.', 'Bad Alias': 'x' }).success).toBe(false)
  })
})

describe('run refs', () => {
  it('splits alias and path', () => {
    expect(parseRunRef('run:scenarios/s1/videos/a.mp4')).toEqual({ alias: 'run', path: 'scenarios/s1/videos/a.mp4' })
    expect(parseRunRef('bugs:x/x.md')).toEqual({ alias: 'bugs', path: 'x/x.md' })
  })

  it('rejects malformed refs', () => {
    for (const bad of ['no-colon', 'Run:a', ':a', 'run:', 'run:/abs', 'run:../x', 'run:a/../b', 'run:a\\..\\b', 'run:a\0b', '1run:a']) {
      expect(parseRunRef(bad), bad).toBeNull()
      expect(RunRefSchema.safeParse(bad).success, bad).toBe(false)
    }
  })
})

describe('manifest union', () => {
  it('parses both kinds and narrows by kind', () => {
    const code = ManifestSchema.parse(makeManifest())
    const legacy = ManifestSchema.parse(makeManifest({ kind: 'code-review' }))
    const run = ManifestSchema.parse(makeTestRunManifest())
    expect([manifestKind(code), manifestKind(legacy), manifestKind(run)]).toEqual(['code-review', 'code-review', 'test-run'])
    expect(isTestRun(code)).toBe(false)
    expect(isTestRun(run)).toBe(true)
    expect(agentCwd(code)).toBe('/Users/me/Projects/app')
    expect(agentCwd(run)).toBe('/Users/me/Projects/app')
  })

  it('rejects a test run without run and a mixed shape', () => {
    const { run: _run, ...withoutRun } = makeTestRunManifest()
    expect(ManifestSchema.safeParse(withoutRun).success).toBe(false)
    expect(ManifestSchema.safeParse({ ...makeTestRunManifest(), kind: 'other' }).success).toBe(false)
  })
})

describe('review schema for test runs', () => {
  it('accepts scenario/bug/log targets, a comment kind, a log anchor and the test sections', () => {
    const review = {
      ...emptyReview(SESSION_ID, T0),
      nextCommentId: 4,
      ui: { mode: 'swipe', currentFile: 's1-pass', section: 'overview' },
      comments: [
        { id: 'c1', target: { kind: 'scenario', ref: 's1-pass' }, body: 'x', kind: 'not-clear', timestampSec: 3, createdAt: T0, updatedAt: null, sentAt: null, resolvedAt: null, reopenedAt: null },
        { id: 'c2', target: { kind: 'bug', ref: 'x' }, body: 'y', timestampSec: null, createdAt: T0, updatedAt: null, sentAt: null, resolvedAt: null, reopenedAt: null },
        { id: 'c3', target: { kind: 'log', ref: 'run:logs/run.log', anchor: { side: 'new', line: 7 } }, body: 'z', kind: 'incorrect', timestampSec: null, createdAt: T0, updatedAt: null, sentAt: null, resolvedAt: null, reopenedAt: null },
      ],
    }
    expect(ReviewSchema.parse(review)).toEqual(review)
    for (const section of ['gaps', 'data-setup', 'logs', 'submit', 'files']) {
      expect(ReviewSchema.safeParse({ ...review, ui: { ...review.ui, section } }).success, section).toBe(true)
    }
  })

  it('rejects a bad comment kind, an old-side log anchor and an anchored scenario comment', () => {
    const base = { id: 'c1', body: 'x', timestampSec: null, createdAt: T0, updatedAt: null, sentAt: null, resolvedAt: null, reopenedAt: null }
    expect(CommentSchema.safeParse({ ...base, kind: 'nope', target: { kind: 'scenario', ref: 's' } }).success).toBe(false)
    expect(CommentSchema.safeParse({ ...base, target: { kind: 'log', ref: 'run:l', anchor: { side: 'old', line: 1 } } }).success).toBe(false)
    expect(CommentSchema.safeParse({ ...base, target: { kind: 'scenario', ref: 's', anchor: { side: 'new', line: 1 } } }).success).toBe(false)
  })
})

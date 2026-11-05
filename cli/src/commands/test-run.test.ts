import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ManifestSchema, SCHEMA_VERSION, isTestRun, type TestRunSentSnapshot } from '@scout/shared'
import { gitText } from '@scout/shared/git/run'
import { makeComment, makeManifest, makeReview, makeTestRunManifest, T1 } from '@scout/shared/testing/fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sessionDir, writeJsonAtomic } from '../store.ts'
import { readLatestFeedback } from './feedback.ts'
import { deriveFeatureArea, initTestRunSession } from './init-test-run.ts'
import { installIntoRepo } from './install.ts'
import { sessionPath } from './path.ts'
import { pendingForRepo } from './pending.ts'
import { checkRunIndex, formatScenarioTable } from './run-index.ts'
import { formatStatusBrief, sessionStatus } from './status.ts'

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'fixtures', 'test-runs', 'demo')
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@e.x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@e.x' }
const NOW = new Date('2026-10-22T09:00:00.000Z')

let home: string
let repo: string
let runPath: string

async function initRepo(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await gitText(dir, ['init', '-q', '-b', 'main'], { env: GIT_ENV })
}

beforeEach(async () => {
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ai-review-testrun-')))
  repo = path.join(home, 'checkout')
  await initRepo(repo)
  await cp(FIXTURE, repo, { recursive: true })
  runPath = path.join(repo, 'plans', 'f', 'a', 'test-runs', 'run-1')
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('init --kind test-run', () => {
  it('writes the test-run manifest, derives feature and area, and reuses the session per run path', async () => {
    const first = await initTestRunSession({ home, run: runPath, repo, agentSession: 'agent-1', now: NOW })
    expect(first.reused).toBe(false)
    expect(first.id).toMatch(/^20261022-\d{4}-run-1-[0-9a-f]{4}$/)
    expect(first.url).toBe(`http://scout.localhost:4546/t/${first.id}`)
    const manifest = ManifestSchema.parse(JSON.parse(await readFile(path.join(first.dir, 'manifest.json'), 'utf8')))
    expect(manifest).toEqual({
      schemaVersion: SCHEMA_VERSION,
      kind: 'test-run',
      id: first.id,
      title: 'run-1',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      agent: { type: 'claude-code', sessionId: 'agent-1', cliVersion: null, entrypoint: 'cli' },
      run: { path: runPath, repo, feature: 'f', area: 'a' },
      tickets: [],
    })

    const later = new Date('2026-10-22T10:00:00.000Z')
    const second = await initTestRunSession({ home, run: runPath, title: 'Renamed', now: later })
    expect(second).toMatchObject({ id: first.id, reused: true })
    expect(second.manifest).toMatchObject({ title: 'Renamed', createdAt: NOW.toISOString(), updatedAt: later.toISOString(), agent: { sessionId: 'agent-1' } })

    const otherRun = path.join(repo, 'plans', 'f', 'a', 'test-runs', 'run-2')
    await mkdir(otherRun)
    const other = await initTestRunSession({ home, run: otherRun, repo, now: later })
    expect(other.reused).toBe(false)
    expect(other.id).not.toBe(first.id)

    const fresh = await initTestRunSession({ home, run: runPath, fresh: true, now: later })
    expect(fresh.reused).toBe(false)
    expect(fresh.id).not.toBe(first.id)
  })

  it('rejects a run folder outside the repository, missing, or the repository itself', async () => {
    const outside = path.join(home, 'elsewhere', 'test-runs', 'r')
    await mkdir(outside, { recursive: true })
    await expect(initTestRunSession({ home, run: outside, repo })).rejects.toThrow(/is not inside the repository/)
    await expect(initTestRunSession({ home, run: path.join(repo, 'nope'), repo })).rejects.toThrow(/does not exist/)
    await expect(initTestRunSession({ home, run: repo, repo })).rejects.toThrow(/is not inside the repository/)

  })

  it('accepts a run folder in the main worktree reached through a symlink from a linked worktree', async () => {
    await gitText(repo, ['commit', '-q', '--allow-empty', '-m', 'base'], { env: GIT_ENV })
    const worktree = path.join(home, 'worktrees', 'wt-1')
    await gitText(repo, ['worktree', 'add', '-q', '-b', 'wt-1', worktree], { env: GIT_ENV })
    await rm(path.join(worktree, 'plans'), { recursive: true, force: true })
    await symlink(path.join(repo, 'plans'), path.join(worktree, 'plans'))
    const result = await initTestRunSession({ home, run: path.join(worktree, 'plans', 'f', 'a', 'test-runs', 'run-1'), repo: worktree, now: NOW })
    expect(result.manifest.run).toMatchObject({ path: runPath, repo: worktree })
    const other = path.join(home, 'other')
    await initRepo(other)
    await expect(initTestRunSession({ home, run: runPath, repo: other })).rejects.toThrow(/is not inside the repository/)
  })

  it('derives feature and area from the two folders above test-runs', () => {
    expect(deriveFeatureArea('/r/plans/05-development/change-summary/diffing/test-runs/2026-10-21-diffing')).toEqual({ feature: 'change-summary', area: 'diffing' })
    expect(deriveFeatureArea('/r/runs/x')).toEqual({ feature: null, area: null })
  })

  it('resets an approved decision on reuse, like per-branch reuse', async () => {
    const first = await initTestRunSession({ home, run: runPath, repo, now: NOW })
    const sent = { at: T1, decision: 'approve' as const }
    await writeJsonAtomic(path.join(first.dir, 'review', 'review.json'), { ...makeReview({ overall: { decision: 'approve' }, sent }), sessionId: first.id })
    await initTestRunSession({ home, run: runPath, repo, now: NOW })
    const review = JSON.parse(await readFile(path.join(first.dir, 'review', 'review.json'), 'utf8')) as { overall: { decision: string } }
    expect(review.overall.decision).toBe('undecided')
  })
})

describe('session commands on test runs', () => {
  async function session(): Promise<{ id: string; dir: string }> {
    const result = await initTestRunSession({ home, run: runPath, repo, now: NOW })
    return { id: result.id, dir: result.dir }
  }

  it('path returns the session folder, or the run folder for `run`; code reviews have no run folder', async () => {
    const { id, dir } = await session()
    expect(await sessionPath({ home, id })).toBe(dir)
    expect(await sessionPath({ home, id, kind: 'run' })).toBe(runPath)
    const code = makeManifest({ id: '20260926-1000-a-aaaa' })
    await writeJsonAtomic(path.join(sessionDir(home, code.id), 'manifest.json'), code)
    await expect(sessionPath({ home, id: code.id, kind: 'run' })).rejects.toThrow(/no run folder/)
  })

  it('status brief shows scenario counts and verdicts', async () => {
    const { id, dir } = await session()
    const files = { 's1-pass': { verdict: 'approved' as const, fingerprint: '0123456789abcdef', viewed: true } }
    await writeJsonAtomic(path.join(dir, 'review', 'review.json'), { ...makeReview({ files }), sessionId: id })
    const status = await sessionStatus({ home, repo, id })
    expect(status.session).toMatchObject({ kind: 'test-run', scenarios: { pass: 1, fail: 1, gap: 1 }, verdicts: { approved: 1, rejected: 0 } })
    expect(formatStatusBrief(status)).toBe(
      `test run ${id} "run-1" · f/a · run ${runPath} · scenarios: 3 (1 pass, 1 fail, 1 gap) · verdicts: 1 approved, 0 rejected · open comments: 0 · not sent yet · http://scout.localhost:4546/t/${id}`,
    )
  })

  it('pending matches run.repo and points at /scout-apply-test-review', async () => {
    const { id, dir } = await session()
    const sent = { at: T1, decision: 'request-changes' as const }
    const comment = makeComment({ id: 'c1', target: { kind: 'scenario', ref: 's2-fail' }, sentAt: T1 })
    await writeJsonAtomic(path.join(dir, 'review', 'review.json'), { ...makeReview({ sent, comments: [comment] }), sessionId: id })
    const pending = await pendingForRepo({ home, repo })
    expect(pending.count).toBe(1)
    expect(pending.sessions[0]).toMatchObject({ id, kind: 'test-run', url: `http://scout.localhost:4546/t/${id}` })
    expect(pending.message).toContain(`/scout-apply-test-review ${id}`)
    expect((await pendingForRepo({ home, repo: path.join(home, 'other') })).count).toBe(0)
  })

  it('feedback prefers the .md and renders a test-run snapshot without one', async () => {
    const { id, dir } = await session()
    const snapshot: TestRunSentSnapshot = {
      schemaVersion: SCHEMA_VERSION,
      kind: 'test-run',
      sessionId: id,
      sentAt: T1,
      decision: 'request-changes',
      run: { path: runPath, indexFingerprint: null },
      scenarios: [{ id: 's2-fail', title: 'Failing scenario', status: 'fail', verdict: 'rejected', fingerprint: '0123456789abcdef' }],
      comments: [makeComment({ id: 'c1', target: { kind: 'scenario', ref: 's2-fail' }, body: 'Why does this fail?', kind: 'not-clear', sentAt: T1 })],
      counts: { scenarios: 1, approved: 0, rejected: 1, commented: 1, unreviewed: 0, openComments: 1 },
    }
    const sent = path.join(dir, 'review', 'sent')
    await mkdir(sent, { recursive: true })
    const stem = T1.replaceAll(':', '-')
    await writeFile(path.join(sent, `${stem}.json`), `${JSON.stringify(snapshot)}\n`)

    const rendered = (await readLatestFeedback({ home, id, format: 'markdown' })).content
    expect(rendered).toContain(`# Test review feedback — run-1 (${id})`)
    expect(rendered).toContain(`http://scout.localhost:4546/t/${id}/review`)
    expect(rendered).toContain('### s2-fail')
    expect(rendered).toContain('**[not-clear]** Why does this fail?')
    expect(rendered).toContain('## Required response')

    await writeFile(path.join(sent, `${stem}.md`), '# on disk\n')
    expect((await readLatestFeedback({ home, id, format: 'markdown' })).content).toBe('# on disk\n')
    expect(JSON.parse((await readLatestFeedback({ home, id, format: 'json' })).content)).toMatchObject({ kind: 'test-run' })
  })

  it('reads a test-run manifest through the shared helpers', () => {
    expect(isTestRun(makeTestRunManifest())).toBe(true)
  })
})

describe('run-index validate', () => {
  it('accepts the fixture index and counts scenarios, refs and missing files', async () => {
    const report = await checkRunIndex(runPath)
    expect(report.errors).toEqual([])
    expect(report.scenarios).toBe(3)
    expect(report.refs).toBeGreaterThan(5)
    expect(report.missing).toBe(0)
    expect(report.index).not.toBeNull()
    const table = formatScenarioTable(report.index!)
    expect(table).toContain('s2-fail')
    expect(table.split('\n')).toHaveLength(4)
  })

  it('reports zod issues with paths, unknown aliases as errors, and missing files as warnings', async () => {
    const file = path.join(runPath, 'test-run.json')
    const index = JSON.parse(await readFile(file, 'utf8')) as { scenarios: { status: string; evidence: { videos: { path: string }[]; screenshots: { path: string }[] } }[] }
    const broken = structuredClone(index)
    broken.scenarios[0]!.status = 'bogus'
    await writeFile(file, JSON.stringify(broken))
    const invalid = await checkRunIndex(runPath)
    expect(invalid.errors.some((line) => line.startsWith('scenarios.0.status:'))).toBe(true)

    const dangling = structuredClone(index)
    dangling.scenarios[0]!.evidence.videos[0]!.path = 'nope:x.mp4'
    dangling.scenarios[0]!.evidence.screenshots[0]!.path = 'run:scenarios/gone.png'
    await writeFile(file, JSON.stringify(dangling))
    const refs = await checkRunIndex(runPath)
    expect(refs.errors).toHaveLength(1)
    expect(refs.errors[0]).toContain('alias that is not in roots')
    expect(refs.missing).toBe(1)
    expect(refs.warnings).toContain('scenarios.s1-pass: missing file run:scenarios/gone.png')

    await writeFile(file, '{ nope')
    expect((await checkRunIndex(runPath)).errors[0]).toContain('invalid JSON')
    await rm(file)
    expect((await checkRunIndex(runPath)).errors[0]).toContain('cannot read')
  })
})

describe('install of the test-review skills', () => {
  it('copies the four skills and the hook skips them', async () => {
    const result = await installIntoRepo({ home, repo, claudeBin: null, pathDir: null, cliBundle: '/x/dist/index.js', nodeBin: '/x/node' })
    for (const name of ['scout-test-plan', 'scout-data-setup', 'scout-test-run', 'scout-apply-test-review']) {
      const rel = `.claude/skills/${name}/SKILL.md`
      expect(result.changes.find((change) => change.path === rel)?.action).toBe('created')
      const text = await readFile(path.join(repo, rel), 'utf8')
      expect(text).toContain(`name: ${name}`)
      expect(text).toContain('allowed-tools:')
    }
    for (const name of ['scout-test-plan', 'scout-data-setup', 'scout-test-run']) {
      const text = await readFile(path.join(repo, '.claude', 'skills', name, 'SKILL.md'), 'utf8')
      expect(text).toContain('argument-hint: "<run-folder> [--auto]"')
      expect(text).toContain('ai-review init --kind test-run --run')
      expect(text).toContain('ai-review run-index merge "<run>"')
      expect(text).toContain('ai-review run-index scan')
    }
    const apply = await readFile(path.join(repo, '.claude', 'skills', 'scout-apply-test-review', 'SKILL.md'), 'utf8')
    expect(apply).toContain('!`ai-review feedback $0 --format markdown`')
    expect(apply).toContain('!`ai-review status $0 --format brief`')
    const hook = await readFile(path.join(repo, '.claude', 'hooks', 'ai_review_pending_feedback.sh'), 'utf8')
    for (const name of ['/scout-test-plan*', '/scout-data-setup*', '/scout-test-run*', '/scout-apply-test-review*']) expect(hook).toContain(name)
  })
})

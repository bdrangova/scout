import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ManifestSchema, SCHEMA_VERSION, isTestRun, type TestRunSentSnapshot } from '@scout/shared'
import { gitText } from '@scout/shared/git/run'
import { makeComment, makeManifest, makeReview, makeTestRunManifest, T1 } from '@scout/shared/testing/fixtures'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { archiveSession } from './archive.ts'
import { sessionDir, writeJsonAtomic } from '../store.ts'
import { readLatestFeedback } from './feedback.ts'
import { initTestRunSession } from './init-test-run.ts'
import { installIntoRepo } from './install.ts'
import { sessionPath } from './path.ts'
import { pendingForRepo } from './pending.ts'
import { checkRunIndex, formatScenarioTable } from './run-index.ts'
import { formatStatusBrief, sessionStatus } from './status.ts'

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'fixtures', 'test-runs', 'demo', 'run')
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@e.x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@e.x' }
const NOW = new Date('2026-10-22T09:00:00.000Z')

let home: string
let repo: string

async function initRepo(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await gitText(dir, ['init', '-q', '-b', 'main'], { env: GIT_ENV })
}

beforeEach(async () => {
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ai-review-testrun-')))
  repo = path.join(home, 'checkout')
  await initRepo(repo)
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('init --kind test-run', () => {
  it('creates a session whose run folder lives inside the session folder, with an index skeleton', async () => {
    const first = await initTestRunSession({ home, repo, title: 'Run one', feature: 'f', area: 'a', agentSession: 'agent-1', now: NOW })
    expect(first.reused).toBe(false)
    expect(first.id).toMatch(/^20261022-\d{4}-run-one-[0-9a-f]{4}$/)
    expect(first.url).toBe(`http://scout.localhost:4546/t/${first.id}`)
    expect(first.runPath).toBe(path.join(first.dir, 'run'))
    expect(first.dir).toBe(sessionDir(home, first.id))
    const manifest = ManifestSchema.parse(JSON.parse(await readFile(path.join(first.dir, 'manifest.json'), 'utf8')))
    expect(manifest).toEqual({
      schemaVersion: SCHEMA_VERSION,
      kind: 'test-run',
      id: first.id,
      title: 'Run one',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      agent: { type: 'claude-code', sessionId: 'agent-1', cliVersion: null, entrypoint: 'cli' },
      run: { repo, feature: 'f', area: 'a' },
      tickets: [],
    })
    expect(manifest).not.toHaveProperty('run.path')
    const index = JSON.parse(await readFile(path.join(first.runPath, 'test-run.json'), 'utf8')) as Record<string, unknown>
    expect(index).toMatchObject({ runId: first.id, title: 'Run one', feature: 'f', area: 'a', roots: { run: '.', plan: 'plan', bugs: 'bugs' }, scenarios: [] })
  })

  it('always creates a new session without --session, and reuses the named live one with it', async () => {
    const first = await initTestRunSession({ home, repo, title: 'Run one', agentSession: 'agent-1', now: NOW })
    const other = await initTestRunSession({ home, repo, title: 'Run one', now: NOW })
    expect(other.id).not.toBe(first.id)
    const later = new Date('2026-10-22T10:00:00.000Z')
    const again = await initTestRunSession({ home, repo, session: first.id, title: 'Renamed', now: later })
    expect(again).toMatchObject({ id: first.id, reused: true })
    expect(again.manifest).toMatchObject({ title: 'Renamed', createdAt: NOW.toISOString(), updatedAt: later.toISOString(), agent: { sessionId: 'agent-1' } })
    await writeJsonAtomic(path.join(first.runPath, 'marker.json'), { keep: true })
    await initTestRunSession({ home, repo, session: first.id, now: later })
    expect(JSON.parse(await readFile(path.join(first.runPath, 'marker.json'), 'utf8'))).toEqual({ keep: true })
  })

  it('needs a title for a new session, a git checkout, and a live test-run session for --session', async () => {
    await expect(initTestRunSession({ home, repo })).rejects.toThrow(/--title/)
    await expect(initTestRunSession({ home, repo: path.join(home, 'not-a-repo'), title: 'x' })).rejects.toThrow()
    await expect(initTestRunSession({ home, repo, session: '20260101-0900-nope-abcd' })).rejects.toThrow(/not a live session/)
    const code = makeManifest({ id: '20260926-1000-a-aaaa' })
    await writeJsonAtomic(path.join(sessionDir(home, code.id), 'manifest.json'), code)
    await expect(initTestRunSession({ home, repo, session: code.id })).rejects.toThrow(/code review/)
    const run = await initTestRunSession({ home, repo, title: 'x', now: NOW })
    await archiveSession({ home, id: run.id })
    await expect(initTestRunSession({ home, repo, session: run.id })).rejects.toThrow(/not a live session/)
  })

  it('stores the real path of a linked worktree as run.repo', async () => {
    await gitText(repo, ['commit', '-q', '--allow-empty', '-m', 'base'], { env: GIT_ENV })
    const worktree = path.join(home, 'worktrees', 'wt-1')
    await gitText(repo, ['worktree', 'add', '-q', '-b', 'wt-1', worktree], { env: GIT_ENV })
    const nested = path.join(worktree, 'src')
    await mkdir(nested)
    const result = await initTestRunSession({ home, repo: nested, title: 'wt run', now: NOW })
    expect(result.manifest.run.repo).toBe(worktree)
  })

  it('resets an approved decision on reuse, like per-branch reuse', async () => {
    const first = await initTestRunSession({ home, repo, title: 'Run one', now: NOW })
    const sent = { at: T1, decision: 'approve' as const }
    await writeJsonAtomic(path.join(first.dir, 'review', 'review.json'), { ...makeReview({ overall: { decision: 'approve' }, sent }), sessionId: first.id })
    await initTestRunSession({ home, repo, session: first.id, now: NOW })
    const review = JSON.parse(await readFile(path.join(first.dir, 'review', 'review.json'), 'utf8')) as { overall: { decision: string } }
    expect(review.overall.decision).toBe('undecided')
  })
})

describe('session commands on test runs', () => {
  async function session(): Promise<{ id: string; dir: string; runPath: string }> {
    const result = await initTestRunSession({ home, repo, title: 'run-1', feature: 'f', area: 'a', now: NOW })
    await cp(FIXTURE, result.runPath, { recursive: true })
    return { id: result.id, dir: result.dir, runPath: result.runPath }
  }

  it('path returns the session folder, or the run folder for `run`; code reviews have no run folder', async () => {
    const { id, dir, runPath } = await session()
    expect(await sessionPath({ home, id })).toBe(dir)
    expect(await sessionPath({ home, id, kind: 'run' })).toBe(runPath)
    await archiveSession({ home, id })
    expect(await sessionPath({ home, id, kind: 'run' })).toBe(path.join(home, 'archive', id, 'run'))
    const code = makeManifest({ id: '20260926-1000-a-aaaa' })
    await writeJsonAtomic(path.join(sessionDir(home, code.id), 'manifest.json'), code)
    await expect(sessionPath({ home, id: code.id, kind: 'run' })).rejects.toThrow(/no run folder/)
  })

  it('status brief shows scenario counts and verdicts', async () => {
    const { id, dir, runPath } = await session()
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
      run: { path: path.join(dir, 'run'), indexFingerprint: null },
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
  let runPath: string
  beforeEach(async () => {
    const result = await initTestRunSession({ home, repo, title: 'run-1', now: NOW })
    runPath = result.runPath
    await cp(FIXTURE, runPath, { recursive: true })
  })

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
      expect(text).toContain('argument-hint: "<session id> [--auto]"')
      expect(text).toContain('/test-run-index')
      expect(text).toContain('ai-review run-index merge "<run>"')
      expect(text).toContain('ai-review run-index scan')
    }
    const index = await readFile(path.join(repo, '.claude', 'skills', 'test-run-index', 'SKILL.md'), 'utf8')
    expect(index).toContain('ai-review init --kind test-run --repo')
    expect(index).toContain('ai-review run-index merge "<run>" --owner <owner>')
    const apply = await readFile(path.join(repo, '.claude', 'skills', 'scout-apply-test-review', 'SKILL.md'), 'utf8')
    expect(apply).toContain('!`ai-review feedback $0 --format markdown`')
    expect(apply).toContain('!`ai-review status $0 --format brief`')
    const hook = await readFile(path.join(repo, '.claude', 'hooks', 'ai_review_pending_feedback.sh'), 'utf8')
    for (const name of ['/scout-test-plan*', '/scout-data-setup*', '/scout-test-run*', '/scout-apply-test-review*']) expect(hook).toContain(name)
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SessionDetail, TestRunManifest } from '@review-dash/shared'
import { makeManifest, makeTree } from '@review-dash/shared/testing/fixtures'
import { afterAll, describe, expect, it } from 'vitest'
import type { AdapterEvent } from './adapter.ts'
import { APPLY_REVIEW_ALLOWED_TOOLS, ClaudeCodeAdapter, applyReviewArgv, applyTestReviewArgv, headlessEnv } from './claude-code.ts'
import { DEFAULT_SAMPLE_PATH } from './fake.ts'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-dash-claude-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

function detail(agentSessionId: string | null = 'agent-session-1'): SessionDetail {
  const base = makeManifest()
  const tree = makeTree()
  return {
    manifest: { ...base, agent: { ...base.agent, sessionId: agentSessionId }, repo: { ...base.repo, path: tmp } },
    tree,
    evidence: [],
    extras: [],
    spec: [],
    prDescription: null,
    status: 'sent',
    progress: { reviewed: 0, total: tree.files.length },
    activeRunId: null,
    journalCount: 0,
  }
}

function stubBinary(name: string, script: string): string {
  const file = path.join(tmp, name)
  fs.writeFileSync(file, `#!/bin/sh\n${script}\n`, { mode: 0o755 })
  return file
}

async function collect(handle: AsyncIterable<AdapterEvent>): Promise<AdapterEvent[]> {
  const events: AdapterEvent[] = []
  for await (const event of handle) events.push(event)
  return events
}

describe('applyReviewArgv and headlessEnv', () => {
  it('builds exactly the command from the plan', () => {
    expect(applyReviewArgv('20260926-1830-add-trial-bar-3f2a', 'sid-1', 'request-changes', false)).toEqual([
      '-p',
      '/apply-review 20260926-1830-add-trial-bar-3f2a',
      '--resume',
      'sid-1',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      'Bash(ai-review *)',
      'Bash(git status *)',
      'Bash(git diff *)',
      'Bash(git log *)',
      'Bash(npm test*)',
      'Bash(npm run *)',
      'Bash(npx vitest *)',
      '--max-turns',
      '80',
      '--max-budget-usd',
      '10',
    ])
    expect(applyReviewArgv('s', 'sid', 'request-changes', true)).toContain('--fork-session')
    expect(APPLY_REVIEW_ALLOWED_TOOLS.join(' ')).not.toMatch(/bypass/i)
  })

  it('allows the commit, push and gh pr tools only for an approve decision', () => {
    const prTools = ['Bash(git add *)', 'Bash(git commit *)', 'Bash(git push *)', 'Bash(gh pr create *)', 'Bash(gh pr view *)']
    const approve = applyReviewArgv('s', 'sid', 'approve', false)
    const tools = approve.slice(approve.indexOf('--allowedTools') + 1, approve.indexOf('--max-turns'))
    expect(tools).toEqual([...APPLY_REVIEW_ALLOWED_TOOLS, ...prTools])
    for (const decision of ['undecided', 'request-changes', 'reject'] as const) {
      const argv = applyReviewArgv('s', 'sid', decision, false)
      expect(argv.slice(argv.indexOf('--allowedTools') + 1, argv.indexOf('--max-turns'))).toEqual([...APPLY_REVIEW_ALLOWED_TOOLS])
    }
  })

  it('strips the nested-session variables and adds the review-dash ones', () => {
    const env = headlessEnv(
      { HOME: '/home/u', PATH: '/usr/bin', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_AGENT_SDK_VERSION: '1', CLAUDE_CODE_SESSION_ID: 'x' },
      '/store',
    )
    expect(env).toEqual({ HOME: '/home/u', PATH: `/store/bin${path.delimiter}/usr/bin`, AI_REVIEW_HOME: '/store', AI_REVIEW_HEADLESS: '1' })
  })
})

describe('ClaudeCodeAdapter.canResume', () => {
  it('needs the binary and a Claude Code session id', async () => {
    const noBin = new ClaudeCodeAdapter({ claudeBin: null })
    expect(await noBin.canResume(detail(), { fork: false })).toEqual({ ok: false, reason: expect.stringMatching(/claude CLI was not found/) })
    const adapter = new ClaudeCodeAdapter({ claudeBin: '/opt/claude', listAgents: async () => [] })
    expect(await adapter.canResume(detail(null), { fork: false })).toEqual({ ok: false, reason: expect.stringMatching(/session id/) })
  })

  it('refuses a live session unless forking, and ignores dead pids and failing commands', async () => {
    const live = new ClaudeCodeAdapter({
      claudeBin: '/opt/claude',
      listAgents: async () => [{ pid: process.pid, sessionId: 'agent-session-1', status: 'busy' }],
    })
    expect(await live.canResume(detail(), { fork: false })).toEqual({ ok: false, reason: expect.stringContaining(`pid ${process.pid}`) })
    expect(await live.canResume(detail(), { fork: true })).toEqual({ ok: true })

    const dead = new ClaudeCodeAdapter({
      claudeBin: '/opt/claude',
      listAgents: async () => [{ pid: 999999, sessionId: 'agent-session-1', status: 'idle' }],
      isAlive: () => false,
    })
    expect(await dead.canResume(detail(), { fork: false })).toEqual({ ok: true })

    const failing = new ClaudeCodeAdapter({
      claudeBin: '/opt/claude',
      listAgents: async () => {
        throw new Error('boom')
      },
    })
    expect(await failing.canResume(detail(), { fork: false })).toEqual({ ok: true })
  })
})

describe('ClaudeCodeAdapter.applyFeedback', () => {
  it('spawns the binary, parses stdout with raw lines, forwards stderr and reports the exit', async () => {
    const bin = stubBinary('claude-ok', 'echo "headless=$AI_REVIEW_HEADLESS home=$AI_REVIEW_HOME" >&2\ncat "$SAMPLE_FILE"\nexit 0')
    const adapter = new ClaudeCodeAdapter({ claudeBin: bin, env: { PATH: process.env.PATH ?? '', SAMPLE_FILE: DEFAULT_SAMPLE_PATH } })
    const handle = adapter.applyFeedback({ session: detail(), sentAt: '2026-09-26T18:47:36.000Z', decision: 'request-changes', fork: false, signal: new AbortController().signal, home: tmp })
    expect(handle.argv[0]).toBe(bin)
    expect(handle.argv).toContain('--resume')
    expect(handle.argv).toContain('agent-session-1')
    expect(handle.pid).toBeGreaterThan(0)

    const events = await collect(handle)
    expect(await handle.exit).toEqual({ code: 0, signal: null })
    expect(events.find((e) => e.type === 'stderr')).toEqual({ type: 'stderr', line: `headless=1 home=${tmp}` })
    expect(events.filter((e) => e.type === 'init')).toHaveLength(1)
    const result = events.find((e) => e.type === 'result')
    expect(result).toMatchObject({ type: 'result', costUsd: 0.42 })
    expect(typeof result?.raw).toBe('string')
    expect(events.filter((e) => e.type === 'error')).toEqual([])
  })

  it('reports a non-zero exit without a result as an error event', async () => {
    const bin = stubBinary('claude-fail', 'echo "{\\"type\\":\\"system\\",\\"subtype\\":\\"init\\",\\"model\\":\\"m\\",\\"session_id\\":\\"s\\"}"\nexit 3')
    const adapter = new ClaudeCodeAdapter({ claudeBin: bin, env: {} })
    const handle = adapter.applyFeedback({ session: detail(), sentAt: '2026-09-26T18:47:36.000Z', decision: 'request-changes', fork: false, signal: new AbortController().signal, home: tmp })
    const events = await collect(handle)
    expect(events.map((e) => e.type)).toEqual(['init', 'error'])
    expect(events[1]).toMatchObject({ message: expect.stringContaining('exited with code 3') })
    expect(await handle.exit).toEqual({ code: 3, signal: null })
  })

  it('sends SIGINT on abort and escalates', async () => {
    const bin = stubBinary('claude-hang', "trap '' INT\nexec sleep 30")
    const adapter = new ClaudeCodeAdapter({ claudeBin: bin, env: {}, escalation: { termAfterMs: 100, killAfterMs: 300 } })
    const controller = new AbortController()
    const started = Date.now()
    const handle = adapter.applyFeedback({ session: detail(), sentAt: '2026-09-26T18:47:36.000Z', decision: 'request-changes', fork: false, signal: controller.signal, home: tmp })
    setTimeout(() => controller.abort(), 50)
    const events = await collect(handle)
    const exit = await handle.exit
    expect(exit.code).toBeNull()
    expect(['SIGINT', 'SIGTERM', 'SIGKILL']).toContain(exit.signal)
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(events.filter((e) => e.type === 'error')).toEqual([])
  })

  it('fails cleanly when the binary cannot be started', async () => {
    const adapter = new ClaudeCodeAdapter({ claudeBin: path.join(tmp, 'missing-claude'), env: {} })
    const handle = adapter.applyFeedback({ session: detail(), sentAt: '2026-09-26T18:47:36.000Z', decision: 'request-changes', fork: false, signal: new AbortController().signal, home: tmp })
    const events = await collect(handle)
    expect(events.some((e) => e.type === 'error' && /failed to start/.test(e.message))).toBe(true)
    expect((await handle.exit).code).not.toBe(0)
  })
})

describe('applyTestReviewArgv', () => {
  it('runs /apply-test-review with the PR-free tool list', () => {
    const argv = applyTestReviewArgv('20260926-1830-add-trial-bar-3f2a', 'sid-1', false)
    expect(argv.slice(0, 4)).toEqual(['-p', '/apply-test-review 20260926-1830-add-trial-bar-3f2a', '--resume', 'sid-1'])
    expect(argv.slice(argv.indexOf('--allowedTools') + 1, argv.indexOf('--max-turns'))).toEqual([...APPLY_REVIEW_ALLOWED_TOOLS])
    expect(argv.join(' ')).not.toMatch(/git push|gh pr create|git commit/)
    expect(applyTestReviewArgv('s', 'sid', true)).toContain('--fork-session')
  })

  it('spawns in the checkout of the run and never grants PR tools, even for approve', async () => {
    const checkout = fs.mkdtempSync(path.join(tmp, 'checkout-'))
    const bin = stubBinary('claude-cwd', 'echo "cwd=$(pwd -P)" >&2\nexit 0')
    const base = makeManifest()
    const manifest: TestRunManifest = {
      schemaVersion: base.schemaVersion,
      id: base.id,
      title: base.title,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      agent: { ...base.agent, sessionId: 'agent-session-9' },
      tickets: [],
      kind: 'test-run',
      run: { path: path.join(checkout, 'plans', 'run'), repo: checkout, feature: null, area: null },
    }
    const adapter = new ClaudeCodeAdapter({ claudeBin: bin, env: { PATH: process.env.PATH ?? '' } })
    expect(await adapter.canResume({ manifest }, { fork: true })).toEqual({ ok: true })
    const handle = adapter.applyFeedback({ session: { manifest }, sentAt: '2026-09-26T18:47:36.000Z', decision: 'approve', fork: false, signal: new AbortController().signal, home: tmp })
    expect(handle.argv[1]).toBe('-p')
    expect(handle.argv[2]).toBe(`/apply-test-review ${manifest.id}`)
    expect(handle.argv.join(' ')).not.toMatch(/git push|gh pr create/)
    const events = await collect(handle)
    expect(events.find((e) => e.type === 'stderr')).toEqual({ type: 'stderr', line: `cwd=${fs.realpathSync(checkout)}` })
  })
})

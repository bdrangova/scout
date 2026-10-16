import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SessionDetail } from '@review-dash/shared'
import { makeManifest, makeTree } from '@review-dash/shared/testing/fixtures'
import { afterAll, describe, expect, it } from 'vitest'
import type { AdapterEvent } from './adapter.ts'
import { APPLY_REVIEW_ALLOWED_TOOLS, ClaudeCodeAdapter, applyReviewArgv, headlessEnv } from './claude-code.ts'
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
    expect(applyReviewArgv('20260926-1830-add-trial-bar-3f2a', 'sid-1', false)).toEqual([
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
    expect(applyReviewArgv('s', 'sid', true)).toContain('--fork-session')
    expect(APPLY_REVIEW_ALLOWED_TOOLS.join(' ')).not.toMatch(/bypass/i)
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
    const handle = adapter.applyFeedback({ session: detail(), sentAt: '2026-09-26T18:47:36.000Z', fork: false, signal: new AbortController().signal, home: tmp })
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
    const handle = adapter.applyFeedback({ session: detail(), sentAt: '2026-09-26T18:47:36.000Z', fork: false, signal: new AbortController().signal, home: tmp })
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
    const handle = adapter.applyFeedback({ session: detail(), sentAt: '2026-09-26T18:47:36.000Z', fork: false, signal: controller.signal, home: tmp })
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
    const handle = adapter.applyFeedback({ session: detail(), sentAt: '2026-09-26T18:47:36.000Z', fork: false, signal: new AbortController().signal, home: tmp })
    const events = await collect(handle)
    expect(events.some((e) => e.type === 'error' && /failed to start/.test(e.message))).toBe(true)
    expect((await handle.exit).code).not.toBe(0)
  })
})

import { execFile, spawn } from 'node:child_process'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import path from 'node:path'
import readline from 'node:readline'
import { agentCwd, isTestRun } from '@scout/shared'
import type { Decision } from '@scout/shared'
import { errorMessage } from '../errors.ts'
import type { AdapterEvent, AgentAdapter, AgentExit, AgentSession, AgentRunHandle, ApplyFeedbackRequest, CanResumeResult } from './adapter.ts'
import { AsyncQueue } from './async-queue.ts'
import { parseStreamJsonLine } from './stream-json.ts'

/** The only tools the headless `/apply-review` run may use; never `bypassPermissions`. */
export const APPLY_REVIEW_ALLOWED_TOOLS: readonly string[] = [
  'Bash(ai-review *)',
  'Bash(git status *)',
  'Bash(git diff *)',
  'Bash(git log *)',
  'Bash(npm test*)',
  'Bash(npm run *)',
  'Bash(npx vitest *)',
]

/** Added for `approve` only: the PR step of `/apply-review` commits, pushes and runs `gh pr create`. */
const APPROVE_PR_TOOLS: readonly string[] = ['Bash(git add *)', 'Bash(git commit *)', 'Bash(git push *)', 'Bash(gh pr create *)', 'Bash(gh pr view *)']

function allowedTools(decision: Decision): readonly string[] {
  return decision === 'approve' ? [...APPLY_REVIEW_ALLOWED_TOOLS, ...APPROVE_PR_TOOLS] : APPLY_REVIEW_ALLOWED_TOOLS
}

/** Arguments (without the binary) of the headless apply-review command from the plan. */
export function applyReviewArgv(sessionId: string, agentSessionId: string, decision: Decision, fork: boolean): string[] {
  return [
    '-p',
    `/apply-review ${sessionId}`,
    '--resume',
    agentSessionId,
    ...(fork ? ['--fork-session'] : []),
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    ...allowedTools(decision),
    '--max-turns',
    '80',
    '--max-budget-usd',
    '10',
  ]
}

/**
 * Arguments of the headless `/apply-test-review` command. The tool list is the PR-free base whatever the decision was:
 * a test review never commits, pushes or opens a PR.
 */
export function applyTestReviewArgv(sessionId: string, agentSessionId: string, fork: boolean): string[] {
  return [
    '-p',
    `/apply-test-review ${sessionId}`,
    '--resume',
    agentSessionId,
    ...(fork ? ['--fork-session'] : []),
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    ...APPLY_REVIEW_ALLOWED_TOOLS,
    '--max-turns',
    '80',
    '--max-budget-usd',
    '10',
  ]
}

function isNestedSessionVar(name: string): boolean {
  return name === 'CLAUDECODE' || name.startsWith('CLAUDE_CODE_') || name.startsWith('CLAUDE_AGENT_SDK_')
}

/**
 * The environment of the headless run: the nested-session guard variables removed (otherwise the
 * CLI refuses to start inside another Claude Code session), `AI_REVIEW_HOME`, `AI_REVIEW_HEADLESS=1`
 * and `PATH` prefixed with `<home>/bin` so the `ai-review` launcher is found.
 */
export function headlessEnv(base: NodeJS.ProcessEnv, home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(base)) {
    if (!isNestedSessionVar(name) && value !== undefined) env[name] = value
  }
  env.AI_REVIEW_HOME = home
  env.AI_REVIEW_HEADLESS = '1'
  env.PATH = [path.join(home, 'bin'), base.PATH ?? ''].filter((p) => p !== '').join(path.delimiter)
  return env
}

export interface LiveAgent {
  pid: number
  sessionId: string
  status: string
}

/** `claude agents --json`; a failing or unparsable command counts as "nothing live". */
export async function listLiveAgents(claudeBin: string): Promise<LiveAgent[]> {
  const stdout = await new Promise<string>((resolve) => {
    execFile(claudeBin, ['agents', '--json'], { timeout: 5_000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      resolve(err ? '' : String(out))
    })
  })
  try {
    const parsed: unknown = JSON.parse(stdout)
    if (!Array.isArray(parsed)) return []
    const agents: LiveAgent[] = []
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue
      const { pid, sessionId, status } = entry as { pid?: unknown; sessionId?: unknown; status?: unknown }
      if (typeof pid === 'number' && typeof sessionId === 'string') {
        agents.push({ pid, sessionId, status: typeof status === 'string' ? status : 'unknown' })
      }
    }
    return agents
  } catch {
    return []
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as { code?: unknown }).code === 'EPERM'
  }
}

export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess

export interface ClaudeCodeAdapterOptions {
  claudeBin: string | null
  env?: NodeJS.ProcessEnv
  listAgents?: (claudeBin: string) => Promise<LiveAgent[]>
  isAlive?: (pid: number) => boolean
  spawn?: SpawnFn
  /** Delays after SIGINT before escalating to SIGTERM and SIGKILL. */
  escalation?: { termAfterMs: number; killAfterMs: number }
}

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly kind = 'claude-code' as const
  private readonly claudeBin: string | null
  private readonly env: NodeJS.ProcessEnv
  private readonly listAgents: (claudeBin: string) => Promise<LiveAgent[]>
  private readonly isAlive: (pid: number) => boolean
  private readonly spawnFn: SpawnFn
  private readonly escalation: { termAfterMs: number; killAfterMs: number }

  constructor(options: ClaudeCodeAdapterOptions) {
    this.claudeBin = options.claudeBin
    this.env = options.env ?? process.env
    this.listAgents = options.listAgents ?? listLiveAgents
    this.isAlive = options.isAlive ?? isProcessAlive
    this.spawnFn = options.spawn ?? spawn
    this.escalation = options.escalation ?? { termAfterMs: 10_000, killAfterMs: 20_000 }
  }

  async canResume(session: AgentSession, opts: { fork: boolean }): Promise<CanResumeResult> {
    if (this.claudeBin === null) {
      return { ok: false, reason: 'the claude CLI was not found: set AI_REVIEW_CLAUDE_BIN or install it in ~/.local/bin' }
    }
    const agentSessionId = session.manifest.agent.sessionId
    if (agentSessionId === null) {
      return { ok: false, reason: 'this session was published without a Claude Code session id, so it cannot be resumed' }
    }
    if (!opts.fork) {
      const live = await this.findLiveAgent(agentSessionId)
      if (live) {
        return {
          ok: false,
          reason: `Claude Code session ${agentSessionId} is still open (pid ${live.pid}, ${live.status}): run /apply-review there, close it, or run as a fork`,
        }
      }
    }
    return { ok: true }
  }

  private async findLiveAgent(agentSessionId: string): Promise<LiveAgent | null> {
    if (this.claudeBin === null) return null
    let agents: LiveAgent[]
    try {
      agents = await this.listAgents(this.claudeBin)
    } catch {
      return null
    }
    return agents.find((agent) => agent.sessionId === agentSessionId && this.isAlive(agent.pid)) ?? null
  }

  applyFeedback(req: ApplyFeedbackRequest): AgentRunHandle {
    const queue = new AsyncQueue<AdapterEvent>()
    const { manifest } = req.session
    const agentSessionId = manifest.agent.sessionId
    const bin = this.claudeBin

    if (bin === null || agentSessionId === null) {
      const message =
        bin === null ? 'the claude CLI was not found' : 'the session has no Claude Code session id to resume'
      queue.push({ type: 'error', message })
      queue.end()
      return { argv: [], pid: null, exit: Promise.resolve({ code: null, signal: null }), [Symbol.asyncIterator]: () => queue[Symbol.asyncIterator]() }
    }

    const args = isTestRun(manifest) ? applyTestReviewArgv(manifest.id, agentSessionId, req.fork) : applyReviewArgv(manifest.id, agentSessionId, req.decision, req.fork)
    const child = this.spawnFn(bin, args, {
      cwd: agentCwd(manifest),
      env: headlessEnv(this.env, req.home),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let sawResult = false
    let settled = false
    const timers: NodeJS.Timeout[] = []
    let resolveExit: (exit: AgentExit) => void = () => undefined
    const exit = new Promise<AgentExit>((resolve) => {
      resolveExit = resolve
    })

    const finish = (result: AgentExit): void => {
      if (settled) return
      settled = true
      for (const timer of timers) clearTimeout(timer)
      req.signal.removeEventListener('abort', onAbort)
      queue.end()
      resolveExit(result)
    }

    const onAbort = (): void => {
      if (settled) return
      child.kill('SIGINT')
      timers.push(setTimeout(() => child.kill('SIGTERM'), this.escalation.termAfterMs))
      timers.push(setTimeout(() => child.kill('SIGKILL'), this.escalation.killAfterMs))
    }

    if (child.stdout) {
      readline.createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (line) => {
        for (const event of parseStreamJsonLine(line)) {
          if (event.type === 'result') sawResult = true
          queue.push({ ...event, raw: line })
        }
      })
    }
    if (child.stderr) {
      readline.createInterface({ input: child.stderr, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (line) => {
        if (line.trim() !== '') queue.push({ type: 'stderr', line })
      })
    }
    child.on('error', (err) => {
      queue.push({ type: 'error', message: `failed to start ${bin}: ${errorMessage(err)}` })
      finish({ code: null, signal: null })
    })
    child.on('close', (code, signal) => {
      if (!sawResult && !req.signal.aborted) {
        queue.push({
          type: 'error',
          message: signal ? `claude was killed by ${signal} before reporting a result` : `claude exited with code ${String(code)} without a result`,
        })
      }
      finish({ code, signal })
    })

    if (req.signal.aborted) onAbort()
    else req.signal.addEventListener('abort', onAbort, { once: true })

    return {
      argv: [bin, ...args],
      pid: child.pid ?? null,
      exit,
      [Symbol.asyncIterator]: () => queue[Symbol.asyncIterator](),
    }
  }
}

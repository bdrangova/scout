// `scout app-status [--repo <path>] [--port <n>...] [--json]`: who listens on this checkout's app ports, whether it
// is this checkout, another worktree or something else, and whether the URL answers. The run-app skill reads it
// instead of chaining lsof, ps and curl by hand.
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { gitText } from '@scout/shared/git/run'
import { topLevel } from '@scout/shared/git/repo'
import { resolveHome } from '../store.ts'
import { checkoutEnv } from './env.ts'

const HTTP_TIMEOUT_MS = 2_000
const COMMAND_TIMEOUT_MS = 5_000

export type PortSource = 'runtime' | 'launch.json' | 'flag'

export interface AppTarget {
  name: string | null
  port: number
  url: string | null
}

export interface Listener {
  pid: number
  command: string | null
  cwd: string | null
  /** Its working directory is inside this checkout. */
  thisCheckout: boolean
  /** Its working directory is inside another worktree of the same repository. */
  otherWorktree: string | null
}

export interface PortStatus extends AppTarget {
  listeners: Listener[]
  /** HTTP status of `url` (any status counts as an answer), null when there is no URL or it did not answer. */
  httpStatus: number | null
}

export interface AppStatus {
  checkout: string
  source: PortSource | null
  /** The command that starts this checkout's app, when the source knows one. */
  start: string | null
  ports: PortStatus[]
}

/** Everything that touches the machine, so tests can fake it. */
export interface AppStatusSystem {
  listeningPids(port: number): Promise<number[]>
  command(pid: number): Promise<string | null>
  cwd(pid: number): Promise<string | null>
  httpStatus(url: string): Promise<number | null>
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    // lsof exits 1 when nothing matches; an empty answer is the same as a failure here.
    execFile(file, args, { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (_error, stdout) => resolve(stdout))
  })
}

export const realSystem: AppStatusSystem = {
  async listeningPids(port) {
    const out = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    return [...new Set(out.split('\n').map((l) => Number(l.trim())).filter((n) => Number.isInteger(n) && n > 0))]
  },
  async command(pid) {
    const out = (await run('ps', ['-o', 'command=', '-p', String(pid)])).trim()
    return out === '' ? null : out
  },
  async cwd(pid) {
    const out = await run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
    const line = out.split('\n').find((l) => l.startsWith('n'))
    return line === undefined ? null : line.slice(1)
  },
  async httpStatus(url) {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })
      await res.body?.cancel()
      return res.status
    } catch {
      return null
    }
  },
}

export function isInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`)
}

/** Paths of every worktree of the repository `repo` is in. */
export async function worktreePaths(repo: string): Promise<string[]> {
  const out = await gitText(repo, ['worktree', 'list', '--porcelain'])
  return out.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice('worktree '.length))
}

/** Which worktree a directory belongs to: the deepest one containing it. */
function owningWorktree(cwd: string, worktrees: readonly string[]): string | null {
  const inside = worktrees.filter((w) => isInside(cwd, w))
  return inside.sort((a, b) => b.length - a.length)[0] ?? null
}

interface LaunchConfig {
  name?: unknown
  runtimeExecutable?: unknown
  runtimeArgs?: unknown
  port?: unknown
  url?: unknown
}

export async function readLaunchJson(checkout: string): Promise<{ apps: AppTarget[]; start: string | null }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path.join(checkout, '.claude', 'launch.json'), 'utf8'))
  } catch {
    return { apps: [], start: null }
  }
  const configs = (parsed as { configurations?: unknown } | null)?.configurations
  const apps: AppTarget[] = []
  const starts: string[] = []
  if (Array.isArray(configs)) {
    for (const c of configs as LaunchConfig[]) {
      if (c === null || typeof c !== 'object' || typeof c.port !== 'number') continue
      const name = typeof c.name === 'string' ? c.name : null
      const url = typeof c.url === 'string' ? c.url : `http://localhost:${c.port}`
      apps.push({ name, port: c.port, url })
      if (typeof c.runtimeExecutable === 'string') {
        const args = Array.isArray(c.runtimeArgs) ? c.runtimeArgs.filter((a): a is string => typeof a === 'string') : []
        starts.push([c.runtimeExecutable, ...args].join(' '))
      }
    }
  }
  return { apps, start: starts.length === 0 ? null : starts.join(' ; ') }
}

function portOfUrl(url: string): number | null {
  try {
    const u = new URL(url)
    return u.port !== '' ? Number(u.port) : u.protocol === 'https:' ? 443 : 80
  } catch {
    return null
  }
}

export async function appStatus(options: { home: string; repo: string; ports?: number[]; system?: AppStatusSystem }): Promise<AppStatus> {
  const system = options.system ?? realSystem
  const checkout = await topLevel(options.repo)
  let source: PortSource | null = null
  let start: string | null = null
  let targets: AppTarget[] = []
  if (options.ports !== undefined && options.ports.length > 0) {
    source = 'flag'
    targets = options.ports.map((port) => ({ name: null, port, url: `http://localhost:${port}` }))
  } else {
    const env = await checkoutEnv({ home: options.home, repo: checkout })
    const runtimeApps = (env.runtime?.apps ?? []).flatMap((a): AppTarget[] => {
      const port = a.port ?? portOfUrl(a.url)
      return port === null ? [] : [{ name: a.name, port, url: a.url }]
    })
    if (runtimeApps.length > 0) {
      source = 'runtime'
      targets = runtimeApps
      start = env.runtime?.start ?? null
    } else {
      const launch = await readLaunchJson(checkout)
      if (launch.apps.length > 0) {
        source = 'launch.json'
        targets = launch.apps
        start = launch.start
      }
    }
  }
  const worktrees = await worktreePaths(checkout)
  const ports: PortStatus[] = []
  for (const target of targets) {
    const listeners: Listener[] = []
    for (const pid of await system.listeningPids(target.port)) {
      const [command, cwd] = await Promise.all([system.command(pid), system.cwd(pid)])
      const owner = cwd === null ? null : owningWorktree(cwd, worktrees)
      listeners.push({ pid, command, cwd, thisCheckout: owner === checkout, otherWorktree: owner !== null && owner !== checkout ? owner : null })
    }
    ports.push({ ...target, listeners, httpStatus: target.url === null ? null : await system.httpStatus(target.url) })
  }
  return { checkout, source, start, ports }
}

export function formatAppStatus(status: AppStatus): string {
  if (status.ports.length === 0) return 'no ports known (no runtime, no .claude/launch.json, no --port)'
  const lines = status.ports.map((p) => {
    const label = `${p.port}${p.name === null ? '' : ` ${p.name}`}`
    if (p.listeners.length === 0) return `${label}: free`
    const who = p.listeners
      .map((l) => `pid ${l.pid} ${l.thisCheckout ? 'this checkout' : l.otherWorktree !== null ? `other worktree ${l.otherWorktree}` : 'other'} (${l.command ?? '?'}; cwd ${l.cwd ?? '?'})`)
      .join(', ')
    const answer = p.url === null ? '' : p.httpStatus === null ? `; ${p.url} no answer` : `; ${p.url} -> ${p.httpStatus}`
    return `${label}: listening ${who}${answer}`
  })
  const head = `Ports from ${status.source ?? 'none'} (${status.checkout})${status.start === null ? '' : `; start: ${status.start}`}`
  return [head, ...lines].join('\n')
}

interface AppStatusFlags {
  repo?: string
  port?: string[]
  json?: boolean
}

export function registerAppStatus(program: Command): void {
  program
    .command('app-status')
    .description("Show who listens on this checkout's app ports (this checkout, another worktree, other) and whether the URLs answer")
    .option('--repo <path>', 'path inside the checkout (default: cwd)')
    .option('--port <n...>', 'check these ports instead of the runtime / .claude/launch.json ones')
    .option('--json', 'print JSON')
    .action(async (flags: AppStatusFlags) => {
      const ports = (flags.port ?? []).map((p) => Number(p))
      if (ports.some((p) => !Number.isInteger(p) || p < 1 || p > 65535)) throw new Error('--port expects port numbers (1-65535)')
      const status = await appStatus({ home: resolveHome(), repo: path.resolve(flags.repo ?? process.cwd()), ports })
      console.log(flags.json === true ? JSON.stringify(status, null, 2) : formatAppStatus(status))
    })
}

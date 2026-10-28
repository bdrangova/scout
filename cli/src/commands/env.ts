// `ai-review env [--repo <path>]`: what the skills need to know about one checkout before they touch its app or data:
// main worktree vs linked worktree, a scratch folder outside the checkout, and the checkout's runtime (app URLs,
// databases, services) as printed by the repository's own runtime command. Scout never guesses ports or file layouts.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { Command } from 'commander'
import { currentBranch, mainWorktree, topLevel } from '@scout/shared/git/repo'
import { CONFIG_FILE, readConfig } from '../config.ts'
import { resolveHome, writeJsonAtomic } from '../store.ts'

const RUNTIME_TIMEOUT_MS = 20_000
const CHECKOUTS_DIR = 'checkouts'

export const RuntimeAppSchema = z.looseObject({
  name: z.string().min(1),
  url: z.string().min(1),
  port: z.number().int().optional(),
})

export const RuntimeDatabaseSchema = z.looseObject({
  name: z.string().min(1).optional(),
  /** `mysql`, `postgres`, `mongo`, `sqlite`, `redis`, … */
  engine: z.string().min(1),
  host: z.string().min(1).optional(),
  port: z.number().int().optional(),
  database: z.string().min(1).optional(),
  /** The compose project that owns it, so dumps and restores reach this checkout's container and no other. */
  compose: z.looseObject({ project: z.string().min(1), file: z.string().min(1).optional(), service: z.string().min(1).optional() }).optional(),
  container: z.string().min(1).optional(),
})

export const RuntimeServiceSchema = z.looseObject({
  name: z.string().min(1),
  url: z.string().min(1).optional(),
  port: z.number().int().optional(),
  container: z.string().min(1).optional(),
})

/** What a repository's runtime command prints. Every field is optional; extra fields are kept and passed through. */
export const CheckoutRuntimeSchema = z.looseObject({
  /** A short name for this checkout's environment, e.g. its CI slot. */
  label: z.string().min(1).optional(),
  apps: z.array(RuntimeAppSchema).optional(),
  databases: z.array(RuntimeDatabaseSchema).optional(),
  services: z.array(RuntimeServiceSchema).optional(),
  /** The command that brings this checkout's app up, run from the checkout. */
  start: z.string().min(1).optional(),
  notes: z.array(z.string()).optional(),
})
export type CheckoutRuntime = z.infer<typeof CheckoutRuntimeSchema>

export interface CheckoutEnv {
  checkout: string
  mainCheckout: string
  linkedWorktree: boolean
  branch: string | null
  /** Outside the checkout, so removing a worktree never takes snapshots or evidence with it. */
  scratch: string
  runtimeCommand: string | null
  runtime: CheckoutRuntime | null
  runtimeError: string | null
}

const toPosix = (p: string) => p.split(path.sep).join('/')

/** `<home>/checkouts/<folder name>-<hash of the path>`: stable per checkout, readable, never shared by two checkouts. */
export function scratchDir(home: string, checkout: string): string {
  const hash = createHash('sha256').update(checkout).digest('hex').slice(0, 8)
  const name = path.basename(checkout).replace(/[^A-Za-z0-9._-]/g, '-') || 'checkout'
  return path.join(home, CHECKOUTS_DIR, `${name}-${hash}`)
}

function runShell(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/bin/sh', ['-c', command], { cwd, timeout: RUNTIME_TIMEOUT_MS, maxBuffer: 1024 * 1024, env: { ...process.env, AI_REVIEW_CHECKOUT: cwd } }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${error.message.split('\n')[0]}${stderr.trim() === '' ? '' : `: ${stderr.trim().split('\n').slice(-3).join(' | ')}`}`))
      else resolve(stdout)
    })
  })
}

export async function runRuntimeCommand(command: string, checkout: string): Promise<CheckoutRuntime> {
  const stdout = await runShell(command, checkout)
  let json: unknown
  try {
    json = JSON.parse(stdout)
  } catch {
    throw new Error('the runtime command did not print JSON')
  }
  const parsed = CheckoutRuntimeSchema.safeParse(json)
  if (!parsed.success) throw new Error(`the runtime command printed an unexpected shape: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  return parsed.data
}

export async function checkoutEnv(options: { home: string; repo: string }): Promise<CheckoutEnv> {
  const checkout = toPosix(await topLevel(options.repo))
  const mainCheckout = toPosix(await mainWorktree(checkout))
  const config = await readConfig(options.home)
  const runtimeCommand = config.repos?.[mainCheckout]?.runtime ?? null
  let runtime: CheckoutRuntime | null = null
  let runtimeError: string | null = null
  if (runtimeCommand !== null) {
    try {
      runtime = await runRuntimeCommand(runtimeCommand, checkout)
    } catch (err) {
      runtimeError = err instanceof Error ? err.message : String(err)
    }
  }
  return {
    checkout,
    mainCheckout,
    linkedWorktree: checkout !== mainCheckout,
    branch: await currentBranch(checkout),
    scratch: toPosix(scratchDir(options.home, checkout)),
    runtimeCommand,
    runtime,
    runtimeError,
  }
}

/**
 * Stores (or with `null` clears) the runtime command of the repository `repo` is in. Edits the raw file, so keys this
 * CLI version does not know survive. Terminal only: the command runs on every `ai-review env`, so an agent must not be
 * able to plant one.
 */
export async function setRuntimeCommand(options: { home: string; repo: string; command: string | null; interactive?: boolean }): Promise<{ mainCheckout: string }> {
  const interactive = options.interactive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true)
  if (!interactive) throw new Error('env --set-runtime must be run by you in a terminal, not by an agent: the command runs every time a skill asks for the checkout runtime')
  const mainCheckout = toPosix(await mainWorktree(await topLevel(options.repo)))
  const file = path.join(options.home, CONFIG_FILE)
  let raw: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>
  } catch {
    raw = {}
  }
  const config = await readConfig(options.home)
  const repos: Record<string, unknown> = { ...(raw.repos !== null && typeof raw.repos === 'object' ? (raw.repos as Record<string, unknown>) : {}) }
  const entry = { ...((repos[mainCheckout] as Record<string, unknown> | undefined) ?? {}) }
  if (options.command === null) delete entry.runtime
  else entry.runtime = options.command
  if (Object.keys(entry).length === 0) delete repos[mainCheckout]
  else repos[mainCheckout] = entry
  await writeJsonAtomic(file, { ...raw, port: raw.port ?? config.port, repos })
  return { mainCheckout }
}

interface EnvFlags {
  repo?: string
  setRuntime?: string
  clearRuntime?: boolean
}

export function registerEnv(program: Command): void {
  program
    .command('env')
    .description("Print a checkout's worktree facts, scratch folder and runtime (app URLs, databases, services) as JSON")
    .option('--repo <path>', 'path inside the checkout (default: cwd)')
    .option('--set-runtime <command>', "store the shell command that prints this repository's runtime as JSON (terminal only)")
    .option('--clear-runtime', "remove this repository's runtime command (terminal only)")
    .action(async (flags: EnvFlags) => {
      const home = resolveHome()
      const repo = path.resolve(flags.repo ?? process.cwd())
      if (flags.setRuntime !== undefined || flags.clearRuntime === true) {
        const { mainCheckout } = await setRuntimeCommand({ home, repo, command: flags.clearRuntime === true ? null : (flags.setRuntime ?? null) })
        console.log(`${flags.clearRuntime === true ? 'cleared' : 'stored'} the runtime command for ${mainCheckout} and its worktrees`)
        return
      }
      console.log(JSON.stringify(await checkoutEnv({ home, repo }), null, 2))
    })
}

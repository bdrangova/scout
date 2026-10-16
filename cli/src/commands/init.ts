// `ai-review init`: writes the session manifest (repo top level, branch, base ref) and creates the
// folders the agent drops files into. The dashboard reads the repo working tree live from then on.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { SCHEMA_VERSION, SESSION_EVIDENCE_DIR, SESSION_EXTRAS_DIR, SESSION_SPEC_DIR, type Manifest } from '@review-dash/shared'
import { currentBranch, defaultBase, refExists, remoteUrl, topLevel } from '@review-dash/shared/git/repo'
import { dashboardUrl, readConfig } from '../config.ts'
import { openSessionForBranch } from '../sessions.ts'
import { newSessionId, resolveHome, sessionDir, writeManifest } from '../store.ts'

/** Folders created under the session so the agent can write into them right away. */
export const SESSION_SUBDIRS = [SESSION_EVIDENCE_DIR, SESSION_EXTRAS_DIR, SESSION_SPEC_DIR, 'review'] as const

export interface InitOptions {
  home: string
  /** A path inside the repository. */
  repo: string
  title?: string | null
  tickets?: Manifest['tickets']
  /** Base ref name; default `defaultBase(repo)` (origin/master → master → origin/main → main → origin/HEAD). */
  base?: string | null
  agentSession?: string | null
  /** Always create a new session instead of reusing the open one for this branch. */
  fresh?: boolean
  now?: Date
}

export interface InitResult {
  id: string
  dir: string
  url: string
  manifest: Manifest
  /** True when the open session for (repo, branch) was reused and its manifest refreshed. */
  reused: boolean
}

/** `KEY` or `KEY=url` → ticket. */
export function parseTicket(spec: string): Manifest['tickets'][number] {
  const eq = spec.indexOf('=')
  const key = (eq === -1 ? spec : spec.slice(0, eq)).trim()
  if (key === '') throw new Error(`invalid --ticket "${spec}": expected KEY or KEY=url`)
  const url = eq === -1 ? '' : spec.slice(eq + 1).trim()
  return { key, url: url === '' ? null : url }
}

function defaultTitle(tickets: Manifest['tickets'], branch: string | null): string {
  const subject = branch ?? 'review'
  const key = tickets[0]?.key
  return key === undefined ? subject : `${key}: ${subject}`
}

export async function initSession(options: InitOptions): Promise<InitResult> {
  const now = (options.now ?? new Date()).toISOString()
  const repo = (await topLevel(options.repo)).split(path.sep).join('/')
  const branch = await currentBranch(repo)
  if (options.base !== undefined && options.base !== null && !(await refExists(repo, options.base))) {
    throw new Error(`base ref "${options.base}" does not exist in ${repo}`)
  }
  const open = options.fresh ? null : await openSessionForBranch(options.home, repo, branch)
  const previous = open?.manifest ?? null
  const tickets = options.tickets !== undefined && options.tickets.length > 0 ? options.tickets : (previous?.tickets ?? [])
  const title = options.title ?? previous?.title ?? defaultTitle(tickets, branch)
  const id = previous?.id ?? newSessionId(title, new Date(now))
  const dir = sessionDir(options.home, id)
  for (const sub of SESSION_SUBDIRS) await mkdir(path.join(dir, sub), { recursive: true })

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    id,
    title,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    agent: {
      type: 'claude-code',
      sessionId: options.agentSession ?? previous?.agent.sessionId ?? null,
      cliVersion: previous?.agent.cliVersion ?? null,
      entrypoint: previous?.agent.entrypoint ?? 'cli',
    },
    repo: {
      path: repo,
      remote: await remoteUrl(repo),
      branch,
      baseRef: options.base ?? previous?.repo.baseRef ?? (await defaultBase(repo)),
    },
    tickets,
  }
  const written = await writeManifest(dir, manifest)
  const url = dashboardUrl(await readConfig(options.home), id)
  return { id, dir, url, manifest: written, reused: previous !== null }
}

interface InitFlags {
  repo: string
  title?: string
  ticket?: string[]
  base?: string
  agentSession?: string
  new?: boolean
  format: string
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Create a review session for a repository, or refresh the open one for this branch; prints id, folder and URL')
    .requiredOption('--repo <path>', 'path inside the repository')
    .option('--base <ref>', 'base ref (default: origin/master, master, origin/main, main, then origin/HEAD)')
    .option('--title <title>', 'session title, e.g. "QI-15472: Trial bar"')
    .option('--ticket <KEY[=url]>', 'ticket key with an optional URL (repeatable)', (value: string, previous: string[] = []) => [...previous, value])
    .option('--new', 'always create a new session instead of reusing the open one for this branch')
    .option('--agent-session <id>', 'Claude Code session id')
    .option('--format <format>', 'json | brief', 'json')
    .action(async (flags: InitFlags) => {
      const result = await initSession({
        home: resolveHome(),
        repo: path.resolve(flags.repo),
        title: flags.title ?? null,
        tickets: (flags.ticket ?? []).map(parseTicket),
        base: flags.base ?? null,
        agentSession: flags.agentSession ?? null,
        fresh: flags.new === true,
      })
      if (flags.format === 'brief') {
        console.log(`${result.id}${result.reused ? ' (reused)' : ''}\n${result.dir}\n${result.url}`)
      } else {
        const { id, dir, url, reused, manifest } = result
        console.log(JSON.stringify({ id, dir, url, reused, branch: manifest.repo.branch, baseRef: manifest.repo.baseRef }))
      }
    })
}

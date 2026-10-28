// `ai-review init`: writes the session manifest (repo top level, branch, base ref) and creates the
// folders the agent drops files into. The dashboard reads the repo working tree live from then on.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { commentsSince, SCHEMA_VERSION, SESSION_EVIDENCE_DIR, SESSION_EXTRAS_DIR, SESSION_SPEC_DIR, type CodeReviewManifest } from '@scout/shared'
import { currentBranch, defaultBase, refExists, remoteUrl, topLevel } from '@scout/shared/git/repo'
import { dashboardUrl, readConfig } from '../config.ts'
import { openSessionForBranch, resetApprovedDecision, unapproveAfterRerun } from '../sessions.ts'
import { initTestRunSession, type InitTestRunResult } from './init-test-run.ts'
import { newSessionId, resolveHome, sessionDir, writeManifest } from '../store.ts'

/** Folders created under the session so the agent can write into them right away. */
export const SESSION_SUBDIRS = [SESSION_EVIDENCE_DIR, SESSION_EXTRAS_DIR, SESSION_SPEC_DIR, 'review'] as const

export interface InitOptions {
  home: string
  /** A path inside the repository. */
  repo: string
  title?: string | null
  tickets?: CodeReviewManifest['tickets']
  /** Base ref name; default `defaultBase(repo)` (origin/master → master → origin/main → main → origin/HEAD). */
  base?: string | null
  agentSession?: string | null
  /** Always create a new session instead of reusing the latest one for this branch. */
  kind?: 'code-review' | 'pr-review'
  fresh?: boolean
  now?: Date
}

export interface InitResult {
  id: string
  dir: string
  url: string
  manifest: CodeReviewManifest
  /** True when the latest session for (repo, branch) was reused and its manifest refreshed. */
  reused: boolean
}

/** `KEY` or `KEY=url` → ticket. */
export function parseTicket(spec: string): CodeReviewManifest['tickets'][number] {
  const eq = spec.indexOf('=')
  const key = (eq === -1 ? spec : spec.slice(0, eq)).trim()
  if (key === '') throw new Error(`invalid --ticket "${spec}": expected KEY or KEY=url`)
  const url = eq === -1 ? '' : spec.slice(eq + 1).trim()
  return { key, url: url === '' ? null : url }
}

function defaultTitle(tickets: CodeReviewManifest['tickets'], branch: string | null): string {
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
  const open = options.fresh ? null : await openSessionForBranch(options.home, repo, branch, options.kind)
  const previous = open?.manifest ?? null
  const tickets = options.tickets !== undefined && options.tickets.length > 0 ? options.tickets : (previous?.tickets ?? [])
  const title = options.title ?? previous?.title ?? defaultTitle(tickets, branch)
  const id = previous?.id ?? newSessionId(title, new Date(now))
  const dir = sessionDir(options.home, id)
  for (const sub of SESSION_SUBDIRS) await mkdir(path.join(dir, sub), { recursive: true })

  const manifest: CodeReviewManifest = {
    schemaVersion: SCHEMA_VERSION,
    ...(options.kind === 'pr-review' ? { kind: 'pr-review' as const } : {}),
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
  if (open !== null) {
    await resetApprovedDecision(open.dir, now)
    // Published again: an approved item commented on since the previous publish needs another look.
    await unapproveAfterRerun(open.dir, open.manifest, (review) => commentsSince(review, open.manifest.updatedAt), now)
  }
  const url = dashboardUrl(await readConfig(options.home), id)
  return { id, dir, url, manifest: written, reused: previous !== null }
}

interface InitFlags {
  kind: string
  repo?: string
  run?: string
  title?: string
  ticket?: string[]
  base?: string
  feature?: string
  area?: string
  agentSession?: string
  new?: boolean
  format: string
}

function printTestRun(result: InitTestRunResult, format: string): void {
  if (format === 'brief') {
    console.log(`${result.id}${result.reused ? ' (reused)' : ''}\n${result.dir}\n${result.url}`)
    return
  }
  const { id, dir, url, reused, manifest } = result
  console.log(JSON.stringify({ id, dir, url, reused, kind: 'test-run', runPath: manifest.run.path, repo: manifest.run.repo, feature: manifest.run.feature, area: manifest.run.area }))
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Create or refresh a review session; prints id, folder, URL')
    .option('--kind <kind>', 'code-review | test-run | pr-review', 'code-review')
    .option('--repo <path>', 'path inside the repository (test-run: the checkout containing the run folder; default: the run folder)')
    .option('--run <path>', 'test-run: the feature-test run folder (must be inside the repository)')
    .option('--base <ref>', 'code-review: base ref (default: origin/master, master, origin/main, main, then origin/HEAD)')
    .option('--title <title>', 'session title, e.g. "QI-15472: Trial bar" (test-run default: the run folder name)')
    .option('--ticket <KEY[=url]>', 'ticket key with an optional URL (repeatable)', (value: string, previous: string[] = []) => [...previous, value])
    .option('--feature <name>', 'test-run: feature name (default: the folder two levels above test-runs/)')
    .option('--area <name>', 'test-run: area name (default: the folder one level above test-runs/)')
    .option('--new', 'always create a new session instead of reusing the latest one for this branch (run folder)')
    .option('--agent-session <id>', 'Claude Code session id')
    .option('--format <format>', 'json | brief', 'json')
    .action(async (flags: InitFlags) => {
      const tickets = (flags.ticket ?? []).map(parseTicket)
      if (flags.kind === 'test-run') {
        if (flags.run === undefined) throw new Error('--run <path> is required with --kind test-run')
        printTestRun(
          await initTestRunSession({
            home: resolveHome(),
            run: path.resolve(flags.run),
            repo: flags.repo === undefined ? null : path.resolve(flags.repo),
            title: flags.title ?? null,
            tickets,
            feature: flags.feature ?? null,
            area: flags.area ?? null,
            agentSession: flags.agentSession ?? null,
            fresh: flags.new === true,
          }),
          flags.format,
        )
        return
      }
      if (flags.kind !== 'code-review' && flags.kind !== 'pr-review') throw new Error(`--kind must be code-review, test-run or pr-review, got "${flags.kind}"`)
      if (flags.repo === undefined) throw new Error('--repo <path> is required')
      const result = await initSession({
        home: resolveHome(),
        kind: flags.kind,
        repo: path.resolve(flags.repo),
        title: flags.title ?? null,
        tickets,
        base: flags.base ?? null,
        agentSession: flags.agentSession ?? null,
        fresh: flags.new === true,
      })
      if (flags.format === 'brief') {
        console.log(`${result.id}${result.reused ? ' (reused)' : ''}\n${result.dir}\n${result.url}`)
      } else {
        const { id, dir, url, reused, manifest } = result
        console.log(JSON.stringify({ id, dir, url, reused, kind: manifest.kind ?? 'code-review', branch: manifest.repo.branch, baseRef: manifest.repo.baseRef }))
      }
    })
}

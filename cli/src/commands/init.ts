// `scout init`: writes the session manifest (repo top level, branch, base ref) and creates the
// folders the agent drops files into. The dashboard reads the repo working tree live from then on.
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { commentsSince, PendingPrReviewSchema, PR_PENDING_DIR, SCHEMA_VERSION, SESSION_EVIDENCE_DIR, SESSION_EXTRAS_DIR, SESSION_SPEC_DIR, type CodeReviewManifest } from '@scout/shared'
import { currentBranch, defaultBase, refExists, remoteUrl, topLevel } from '@scout/shared/git/repo'
import { dashboardUrl, readConfig } from '../config.ts'
import { openSessionForBranch, resetApprovedDecision, unapproveAfterRerun } from '../sessions.ts'
import { initTestRunSession, type InitTestRunResult } from './init-test-run.ts'
import { archivedSessionDir, manifestExists, newSessionId, resolveHome, sessionDir, writeManifest } from '../store.ts'

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
  /** pr-review: the PR's URL; claims the not-started placeholder Scout made for it. */
  pr?: string | null
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

/** Lower-cases, trims, and drops a trailing slash and `/files`-style tabs so equal PRs compare equal. */
export function normalizePrUrl(url: string): string {
  return url
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/(?:files|commits|checks|conversation)?\/?$/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/** Placeholders under `<home>/pr-pending` whose PR matches `url`. Unreadable or invalid files are skipped. */
async function matchingPlaceholders(home: string, url: string): Promise<{ id: string; file: string }[]> {
  const dir = path.join(home, PR_PENDING_DIR)
  const names = await readdir(dir).catch(() => [] as string[])
  const wanted = normalizePrUrl(url)
  const found: { id: string; file: string }[] = []
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    const file = path.join(dir, name)
    try {
      const parsed = PendingPrReviewSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
      if (parsed.success && normalizePrUrl(parsed.data.pr.url) === wanted) found.push({ id: parsed.data.id, file })
    } catch {
      // unreadable placeholder: ignore
    }
  }
  return found
}

export async function initSession(options: InitOptions): Promise<InitResult> {
  const prUrl = options.pr?.trim() ?? ''
  if (prUrl !== '' && options.kind !== 'pr-review') throw new Error('--pr is only valid with --kind pr-review')
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
  const placeholders = prUrl === '' ? [] : await matchingPlaceholders(options.home, prUrl)
  let claimed: string | null = null
  if (previous === null) {
    for (const p of placeholders) {
      if (!(await manifestExists(sessionDir(options.home, p.id))) && !(await manifestExists(archivedSessionDir(options.home, p.id)))) {
        claimed = p.id
        break
      }
    }
  }
  const id = previous?.id ?? claimed ?? newSessionId(title, new Date(now))
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
    ...(prUrl !== '' ? { pr: { url: prUrl } } : previous?.pr !== undefined ? { pr: previous.pr } : {}),
  }
  const written = await writeManifest(dir, manifest)
  for (const p of placeholders) await rm(p.file, { force: true })
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
  pr?: string
  repo?: string
  session?: string
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
    console.log(`${result.id}${result.reused ? ' (reused)' : ''}\n${result.dir}\n${result.runPath}\n${result.url}`)
    return
  }
  const { id, dir, url, reused, manifest, runPath } = result
  console.log(JSON.stringify({ id, dir, url, reused, kind: 'test-run', run: runPath, repo: manifest.run.repo, feature: manifest.run.feature, area: manifest.run.area }))
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Create or refresh a review session; prints id, folder, URL')
    .option('--kind <kind>', 'code-review | test-run | pr-review', 'code-review')
    .option('--repo <path>', 'path inside the repository (test-run: the checkout the feature test runs against; a linked worktree is fine)')
    .option('--pr <url>', 'pr-review: the PR URL; takes over the not-started review Scout made for it')
    .option('--session <id>', 'test-run: reuse this live test-run session instead of creating one')
    .option('--base <ref>', 'code-review: base ref (default: origin/master, master, origin/main, main, then origin/HEAD)')
    .option('--title <title>', 'session title, e.g. "QI-15472: Trial bar" (test-run: required for a new session)')
    .option('--ticket <KEY[=url]>', 'ticket key with an optional URL (repeatable)', (value: string, previous: string[] = []) => [...previous, value])
    .option('--feature <name>', 'test-run: feature name')
    .option('--area <name>', 'test-run: area name')
    .option('--new', 'always create a new session instead of reusing the latest one for this branch')
    .option('--agent-session <id>', 'Claude Code session id')
    .option('--format <format>', 'json | brief', 'json')
    .action(async (flags: InitFlags) => {
      if (flags.pr !== undefined && flags.kind !== 'pr-review') throw new Error('--pr is only valid with --kind pr-review')
      if (flags.session !== undefined && flags.kind !== 'test-run') throw new Error('--session is only valid with --kind test-run')
      const tickets = (flags.ticket ?? []).map(parseTicket)
      if (flags.kind === 'test-run') {
        if (flags.repo === undefined) throw new Error('--repo <checkout> is required with --kind test-run')
        printTestRun(
          await initTestRunSession({
            home: resolveHome(),
            repo: path.resolve(flags.repo),
            session: flags.session ?? null,
            title: flags.title ?? null,
            tickets,
            feature: flags.feature ?? null,
            area: flags.area ?? null,
            agentSession: flags.agentSession ?? null,
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
        pr: flags.pr ?? null,
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

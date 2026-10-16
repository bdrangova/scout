// `ai-review status [id] --repo <path>`: the review session of this branch from the store files only
// (manifest, review.json, resolutions.json); the tree itself is computed by the dashboard, not here.
import path from 'node:path'
import type { Command } from 'commander'
import type { Decision } from '@review-dash/shared'
import { currentBranch, topLevel } from '@review-dash/shared/git/repo'
import { dashboardUrl, readConfig, type Config } from '../config.ts'
import { countOpenComments, openSessionForBranch, readReview } from '../sessions.ts'
import { manifestExists, readManifest, resolveHome, sessionDir } from '../store.ts'

export interface StatusSession {
  id: string
  title: string
  dir: string
  branch: string | null
  baseRef: string
  openComments: number
  sent: { at: string; decision: Decision } | null
  url: string
}

export interface StatusResult {
  repo: string
  branch: string | null
  session: StatusSession | null
}

async function describe(dir: string, config: Config): Promise<StatusSession> {
  const manifest = await readManifest(dir)
  const review = await readReview(dir)
  return {
    id: manifest.id,
    title: manifest.title,
    dir,
    branch: manifest.repo.branch,
    baseRef: manifest.repo.baseRef,
    openComments: await countOpenComments(dir, review),
    sent: review?.sent ?? null,
    url: dashboardUrl(config, manifest.id),
  }
}

export async function sessionStatus(options: { home: string; repo: string; id?: string | null }): Promise<StatusResult> {
  const repo = await topLevel(options.repo)
  const branch = await currentBranch(repo)
  const config = await readConfig(options.home)
  let session: StatusSession | null = null
  if (options.id) {
    const dir = sessionDir(options.home, options.id)
    if (!(await manifestExists(dir))) throw new Error(`session ${options.id} not found under ${options.home} (no manifest.json)`)
    session = await describe(dir, config)
  } else {
    const open = await openSessionForBranch(options.home, repo, branch)
    if (open !== null) session = await describe(open.dir, config)
  }
  return { repo, branch, session }
}

export function formatStatusBrief(status: StatusResult): string {
  if (status.session === null) return `no open review session for ${status.branch ?? 'detached HEAD'} in ${status.repo}`
  const s = status.session
  const sent = s.sent === null ? 'not sent yet' : `sent ${s.sent.at} (${s.sent.decision})`
  return `session ${s.id} "${s.title}" · branch ${s.branch ?? 'detached'} · base ${s.baseRef} · open comments: ${s.openComments} · ${sent} · ${s.url}`
}

interface StatusFlags {
  repo?: string
  format: string
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .argument('[id]', 'session id (default: the open session for this branch)')
    .description('Show the review session of a repository branch: base ref, open comments, last send, URL')
    .option('--repo <path>', 'path inside the repository (default: cwd)')
    .option('--format <format>', 'brief | json', 'brief')
    .action(async (id: string | undefined, flags: StatusFlags) => {
      const status = await sessionStatus({ home: resolveHome(), repo: path.resolve(flags.repo ?? process.cwd()), id: id ?? null })
      if (flags.format === 'json') console.log(JSON.stringify(status))
      else console.log(formatStatusBrief(status))
    })
}

// `ai-review pending --repo <path>`: sessions of a repo whose sent review still has open comments.
import { createHash } from 'node:crypto'
import path from 'node:path'
import type { Command } from 'commander'
import { ManifestSchema, mergeComments } from '@review-dash/shared'
import { topLevel } from '@review-dash/shared/git/repo'
import { dashboardUrl, readConfig } from '../config.ts'
import { listSessionIds, peekManifest, readResolutions, readReview } from '../sessions.ts'
import { resolveHome } from '../store.ts'

export interface PendingSession {
  id: string
  title: string
  sentAt: string
  openComments: number
  url: string
}

export interface PendingResult {
  /** Total open sent comments across the listed sessions. */
  count: number
  /** Stable for an unchanged set of (session, open comment ids); changes when anything is resolved or sent. */
  fingerprint: string
  sessions: PendingSession[]
  message: string
}

export function pendingMessage(sessions: PendingSession[]): string {
  return sessions
    .map(
      (s) =>
        `The review dashboard has ${s.openComments} open comment${s.openComments === 1 ? '' : 's'} on session ${s.id} ("${s.title}", sent ${s.sentAt}). ` +
        `Run /apply-review ${s.id} when appropriate: ${s.url}`,
    )
    .join('\n')
}

export async function pendingForRepo(options: { home: string; repo: string }): Promise<PendingResult> {
  const repoPath = await topLevel(options.repo).catch(() => path.resolve(options.repo))
  const config = await readConfig(options.home)
  const sessions: PendingSession[] = []
  const parts: string[] = []
  for (const id of await listSessionIds(options.home)) {
    const peek = await peekManifest(options.home, id)
    if (peek === null || peek.repoPath !== repoPath) continue
    const review = await readReview(peek.dir)
    if (review === null || review.sent === null) continue
    const manifest = ManifestSchema.safeParse(peek.raw)
    if (!manifest.success) continue
    const open = mergeComments(review, await readResolutions(peek.dir)).filter((c) => c.status === 'open' && c.sentAt !== null)
    if (open.length === 0) continue
    sessions.push({ id, title: manifest.data.title, sentAt: review.sent.at, openComments: open.length, url: dashboardUrl(config, id) })
    parts.push(`${id}:${open.map((c) => c.id).sort().join(',')}`)
  }
  sessions.sort((a, b) => (a.sentAt < b.sentAt ? 1 : a.sentAt > b.sentAt ? -1 : 0))
  const fingerprint = createHash('sha256').update(parts.sort().join('\n')).digest('hex').slice(0, 16)
  return { count: sessions.reduce((sum, s) => sum + s.openComments, 0), fingerprint, sessions, message: pendingMessage(sessions) }
}

interface PendingFlags {
  repo?: string
  format: string
}

export function registerPending(program: Command): void {
  program
    .command('pending')
    .description('List sessions of a repository with sent review comments still open (for the UserPromptSubmit hook)')
    .option('--repo <path>', 'path inside the repository (default: cwd)')
    .option('--format <format>', 'json | brief', 'json')
    .action(async (flags: PendingFlags) => {
      const result = await pendingForRepo({ home: resolveHome(), repo: path.resolve(flags.repo ?? process.cwd()) })
      if (flags.format === 'brief') console.log(result.sessions.length === 0 ? 'no pending review feedback' : result.message)
      else console.log(JSON.stringify(result))
    })
}

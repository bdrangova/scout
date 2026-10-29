// `ai-review pr-sync [id] [--repo <path>] [--pr N] [--json]`: fetches the PR of the current branch through `gh`
// into review/pr-comments.json (identity + external comments), keeping what is already there.
import path from 'node:path'
import type { Command } from 'commander'
import { SCHEMA_VERSION, derivePrComments, hashPrBody, lapsedCommentGrants, prCommentCounts, type PrCommentCounts, type PrIdentity } from '@scout/shared'
import { readConfig } from '../config.ts'
import { topLevel } from '@scout/shared/git/repo'
import type { PrComment } from '@scout/shared'
import { fetchPr } from '../pr/fetch.ts'
import { defaultGhRunner, PrSyncError, type GhRunner } from '../pr/gh.ts'
import { mergeFetched } from '../pr/normalize.ts'
import { findPrSession } from '../pr/session.ts'
import { prCommentsPath, readPrComments, readPrReplies, readPrResolutions, readReview, writePrComments, writePrResolutions } from '../sessions.ts'
import { resolveHome } from '../store.ts'

export interface PrSyncResult {
  sessionId: string
  file: string
  pr: PrIdentity
  fetchedAt: string
  counts: PrCommentCounts
  added: number
  updated: number
  removed: number
  /** Open comments from untrusted authors: stored and shown in the dashboard, never handed to an agent. */
  untrustedOpen: number
  /** Comments the user trusted that were edited since: untrusted again (their ids). */
  trustLapsed: string[]
  warnings: string[]
}

export interface PrSyncOptions {
  home: string
  repo: string
  id?: string | null
  pr?: number | null
  gh?: GhRunner
  now?: Date
}

export async function prSync(options: PrSyncOptions): Promise<PrSyncResult> {
  const session = await findPrSession(options)
  const now = (options.now ?? new Date()).toISOString()
  const cwd = await topLevel(options.repo)
  const fetched = await fetchPr(options.gh ?? defaultGhRunner, { cwd, pr: options.pr ?? null, now })
  const existing = await readPrComments(session.dir)
  const warnings = [...fetched.warnings]
  if (existing !== null && existing.pr.number !== fetched.pr.number) {
    warnings.push(`the session was linked to PR #${existing.pr.number}; replaced by #${fetched.pr.number} (resolutions for the old comments stay in pr-resolutions.json)`)
  }
  const trustedAuthors = (await readConfig(options.home)).trustedPrCommentAuthors ?? []
  const trustLapsed = await pinAndLapseTrust(session.dir, existing?.comments ?? [], fetched.comments, now)
  const merged = mergeFetched(existing?.comments ?? [], fetched.comments, fetched.pr.number, now)
  const written = await writePrComments(session.dir, {
    schemaVersion: SCHEMA_VERSION,
    sessionId: session.id,
    fetchedAt: now,
    pr: fetched.pr,
    ...(trustedAuthors.length > 0 ? { trustedAuthors } : {}),
    comments: merged.comments,
  })
  const lastSend = (await readReview(session.dir))?.sent?.at ?? null
  const views = derivePrComments(written, await readPrResolutions(session.dir), lastSend, await readPrReplies(session.dir))
  const counts = prCommentCounts(written, views)
  if (counts === null) throw new Error('unreachable: written comments have counts')
  return {
    sessionId: session.id,
    file: prCommentsPath(session.dir),
    pr: fetched.pr,
    fetchedAt: now,
    counts,
    added: merged.added,
    updated: merged.updated,
    removed: merged.removed,
    trustLapsed,
    untrustedOpen: views.filter((v) => !v.isReply && v.status === 'open' && !v.trusted).length,
    warnings,
  }
}

/**
 * Keeps the user's comment-level trust honest across a sync: a legacy bare-id grant is pinned to the body stored
 * before this fetch, and a pinned grant whose comment body changed is dropped (the comment is untrusted again).
 * Returns the ids that lapsed.
 */
async function pinAndLapseTrust(dir: string, stored: readonly PrComment[], fetched: readonly PrComment[], now: string): Promise<string[]> {
  const resolutions = await readPrResolutions(dir)
  const trust = resolutions?.trust
  if (resolutions === null || trust === undefined || trust.comments.length === 0) return []
  const grants = trust.comments.map((grant) => {
    if (typeof grant !== 'string') return grant
    const before = stored.find((c) => c.id === grant)
    return before === undefined ? grant : { id: grant, bodyHash: hashPrBody(before.body), updatedAt: before.updatedAt }
  })
  const lapsed = lapsedCommentGrants({ authors: [], comments: grants }, fetched)
  const kept = grants.filter((grant) => typeof grant === 'string' || !lapsed.includes(grant.id))
  if (lapsed.length > 0 || kept.some((grant, i) => grant !== trust.comments[i])) {
    await writePrResolutions(dir, { ...resolutions, updatedAt: now, trust: { authors: trust.authors, comments: kept } })
  }
  return lapsed
}

export function formatPrSync(result: PrSyncResult): string {
  const c = result.counts
  const lines = [
    `PR #${result.pr.number} ${result.pr.title} (${result.pr.state}${result.pr.draft ? ', draft' : ''}) ${result.pr.url}`,
    `${c.total} comment${c.total === 1 ? '' : 's'}: ${c.open} open, ${c.addressed} addressed, ${c.declined} declined, ${c.outdated} outdated · +${result.added} new, ${result.updated} changed, ${result.removed} gone since the last sync${result.untrustedOpen > 0 ? ` · ${result.untrustedOpen} open from untrusted authors (not shown to the agent)` : ''}`,
    ...(result.trustLapsed.length > 0 ? [`${result.trustLapsed.length} trusted comment${result.trustLapsed.length === 1 ? ' was' : 's were'} edited since you trusted ${result.trustLapsed.length === 1 ? 'it' : 'them'} and ${result.trustLapsed.length === 1 ? 'is' : 'are'} untrusted again: ${result.trustLapsed.join(', ')}`] : []),
    ...result.warnings.map((w) => `warning: ${w}`),
    result.file,
  ]
  return lines.join('\n')
}

/** Prints the error as JSON (`--json`) or rethrows it; always sets the exit code. */
export function reportPrError(error: unknown, json: boolean): void {
  if (!(error instanceof PrSyncError) || !json) throw error
  console.log(JSON.stringify({ ok: false, error: { code: error.code, message: error.message, exitCode: error.exitCode } }))
  process.exitCode = error.exitCode
}

interface PrSyncFlags {
  repo?: string
  pr?: string
  json?: boolean
}

export function registerPrSync(program: Command): void {
  program
    .command('pr-sync')
    .argument('[id]', 'session id (default: the open session for this branch)')
    .description('Fetch the PR of this branch (or --pr N) and its comments, via gh')
    .option('--repo <path>', 'path inside the repository (default: cwd)')
    .option('--pr <number>', 'pull request number (default: the PR of the current branch)')
    .option('--json', 'print the result (or { ok: false, error: { code, message, exitCode } }) as JSON')
    .action(async (id: string | undefined, flags: PrSyncFlags) => {
      try {
        const pr = flags.pr === undefined ? null : Number(flags.pr)
        if (pr !== null && (!Number.isInteger(pr) || pr < 1)) throw new Error(`--pr must be a positive integer, got "${flags.pr}"`)
        const result = await prSync({ home: resolveHome(), repo: path.resolve(flags.repo ?? process.cwd()), id: id ?? null, pr })
        console.log(flags.json ? JSON.stringify({ ok: true, ...result }) : formatPrSync(result))
      } catch (error) {
        reportPrError(error, flags.json === true)
      }
    })
}

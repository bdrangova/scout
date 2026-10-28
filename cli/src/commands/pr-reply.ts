// `ai-review pr-reply [--session <id>] [--dry-run]`: posts the replies the user approved with their last Submit to the
// GitHub threads, through `gh`. The only source of text is the latest sent snapshot (review/sent/*.json, `prReplies`
// of kind `reply`): never a proposed reply, never a draft that was not submitted.
import path from 'node:path'
import type { Command } from 'commander'
import { SCHEMA_VERSION, type PrReplies, type SentPrReply } from '@scout/shared'
import { classifyGhError, defaultGhRunner, PrSyncError, type GhRunner } from '../pr/gh.ts'
import { findPrSession } from '../pr/session.ts'
import { readLatestSent, readPrComments, readPrReplies, writePrReplies } from '../sessions.ts'
import { resolveHome } from '../store.ts'

export type PrReplyOutcome =
  | { commentId: string; status: 'posted'; url: string | null }
  | { commentId: string; status: 'would-post'; target: string }
  | { commentId: string; status: 'skipped'; reason: string }
  | { commentId: string; status: 'failed'; reason: string }

export interface PrReplyResult {
  sessionId: string
  /** `sentAt` of the snapshot the replies came from; null when nothing was ever sent. */
  sentAt: string | null
  dryRun: boolean
  outcomes: PrReplyOutcome[]
}

export interface PrReplyOptions {
  home: string
  repo: string
  id?: string | null
  dryRun?: boolean
  gh?: GhRunner
  now?: Date
}

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/** The `gh api` call for one reply: a review-thread reply for `rc` comments, a conversation comment for `ic` and `rv` (a review summary has no thread). */
function replyRequest(repo: string, prNumber: number, commentId: string, githubId: number): string {
  return commentId.startsWith('rc') ? `repos/${repo}/pulls/${prNumber}/comments/${githubId}/replies` : `repos/${repo}/issues/${prNumber}/comments`
}

function htmlUrl(stdout: string): string | null {
  try {
    const parsed: unknown = JSON.parse(stdout)
    if (typeof parsed === 'object' && parsed !== null && 'html_url' in parsed && typeof parsed.html_url === 'string') return parsed.html_url
  } catch {
    // gh printed something else: the reply was still posted
  }
  return null
}

export async function prReply(options: PrReplyOptions): Promise<PrReplyResult> {
  const session = await findPrSession(options)
  const dryRun = options.dryRun === true
  const gh = options.gh ?? defaultGhRunner
  const sent = await readLatestSent(session.dir)
  const approved = new Map<string, SentPrReply>()
  for (const entry of sent?.prReplies ?? []) if (entry.kind === 'reply') approved.set(entry.commentId, entry)
  const result: PrReplyResult = { sessionId: session.id, sentAt: sent?.sentAt ?? null, dryRun, outcomes: [] }
  if (approved.size === 0) return result

  const prComments = await readPrComments(session.dir)
  if (prComments === null) throw new PrSyncError('no-pr', `session ${session.id} has no PR comments: run ai-review pr-sync first`)
  const { repo, number } = prComments.pr
  if (!REPO_RE.test(repo)) throw new Error(`pr-comments.json has an unusable repo ${JSON.stringify(repo)}`)
  const known = new Map(prComments.comments.map((comment) => [comment.id, comment]))

  for (const entry of approved.values()) {
    const comment = known.get(entry.commentId)
    if (comment === undefined) {
      result.outcomes.push({ commentId: entry.commentId, status: 'skipped', reason: 'not a comment of this session (not in pr-comments.json)' })
      continue
    }
    if (comment.inReplyTo !== null && known.has(comment.inReplyTo)) {
      result.outcomes.push({ commentId: entry.commentId, status: 'skipped', reason: `a reply inside a thread; replies go to the root ${comment.inReplyTo}` })
      continue
    }
    if (comment.removedAt !== null) {
      result.outcomes.push({ commentId: entry.commentId, status: 'skipped', reason: 'the comment no longer exists on GitHub' })
      continue
    }
    const stored = (await readPrReplies(session.dir))?.replies[entry.commentId]
    if (stored !== undefined && stored.postedAt !== null) {
      result.outcomes.push({ commentId: entry.commentId, status: 'skipped', reason: `already posted at ${stored.postedAt}` })
      continue
    }
    // Only a draft that is a reply is ever posted: an instruction is the user's private note to Claude.
    if (stored !== undefined && stored.kind !== 'reply') {
      result.outcomes.push({ commentId: entry.commentId, status: 'skipped', reason: 'the draft is an instruction for Claude, not a reply: never posted' })
      continue
    }
    // The Submit is the approval of exactly this text: a draft removed or edited since needs a new Submit.
    if (stored === undefined || stored.body !== entry.body) {
      result.outcomes.push({ commentId: entry.commentId, status: 'skipped', reason: stored === undefined ? 'the draft was removed since the last Submit' : 'the draft was edited since the last Submit: submit again to approve the new text' })
      continue
    }
    const endpoint = replyRequest(repo, number, entry.commentId, comment.githubId)
    if (dryRun) {
      result.outcomes.push({ commentId: entry.commentId, status: 'would-post', target: endpoint })
      continue
    }
    try {
      const stdout = await gh(['api', '--method', 'POST', endpoint, '--input', '-'], options.repo, { input: JSON.stringify({ body: entry.body }) })
      const url = htmlUrl(stdout)
      await markPosted(session.dir, session.id, entry, (options.now ?? new Date()).toISOString(), url)
      result.outcomes.push({ commentId: entry.commentId, status: 'posted', url })
    } catch (error) {
      result.outcomes.push({ commentId: entry.commentId, status: 'failed', reason: classifyGhError(error).message })
    }
  }
  return result
}

/** Records the post right away (before the next reply), so a crash later cannot make a retry post it twice. */
async function markPosted(dir: string, sessionId: string, entry: SentPrReply, now: string, url: string | null): Promise<void> {
  const current = await readPrReplies(dir)
  const replies: PrReplies['replies'] = { ...(current?.replies ?? {}) }
  replies[entry.commentId] = { body: entry.body, kind: 'reply', editedAt: replies[entry.commentId]?.editedAt ?? now, postedAt: now, ...(url === null ? {} : { githubUrl: url }) }
  await writePrReplies(dir, { schemaVersion: SCHEMA_VERSION, sessionId, updatedAt: now, replies })
}

export function formatPrReply(result: PrReplyResult): string {
  if (result.sentAt === null) return 'nothing was submitted yet: no replies to post'
  if (result.outcomes.length === 0) return `the last Submit (${result.sentAt}) approved no replies to post`
  const lines = result.outcomes.map((o) => {
    if (o.status === 'posted') return `${o.commentId}: posted${o.url === null ? '' : ` ${o.url}`}`
    if (o.status === 'would-post') return `${o.commentId}: would post (${o.target})`
    return `${o.commentId}: ${o.status} — ${o.reason}`
  })
  const count = (status: PrReplyOutcome['status']): number => result.outcomes.filter((o) => o.status === status).length
  const summary = result.dryRun
    ? `dry run: ${count('would-post')} would be posted, ${count('skipped')} skipped`
    : `${count('posted')} posted, ${count('skipped')} skipped, ${count('failed')} failed`
  return [...lines, summary].join('\n')
}

interface PrReplyFlags {
  session?: string
  repo?: string
  dryRun?: boolean
}

export function registerPrReply(program: Command): void {
  program
    .command('pr-reply')
    .description('Post replies approved in the last Submit to their GitHub threads, via gh')
    .option('--session <id>', 'session id (default: the open session for this branch)')
    .option('--repo <path>', 'path inside the repository (default: cwd)')
    .option('--dry-run', 'print what would be posted without calling GitHub')
    .action(async (flags: PrReplyFlags) => {
      const result = await prReply({ home: resolveHome(), repo: path.resolve(flags.repo ?? process.cwd()), id: flags.session ?? null, dryRun: flags.dryRun === true })
      console.log(formatPrReply(result))
      if (result.outcomes.some((o) => o.status === 'failed')) process.exitCode = 1
    })
}

// `ai-review pr-resolve <id> --comment <rc123> --status addressed|declined --note … [--commit sha] [--files a,b]`:
// records how the agent handled a GitHub PR comment in review/pr-resolutions.json.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { Command } from 'commander'
import { PR_COMMENT_ID_RE, PR_REPLY_MAX_LENGTH, PR_RESOLUTION_STATUSES, SCHEMA_VERSION, type PrResolutions } from '@review-dash/shared'
import { prCommentsPath, readPrComments, readPrResolutions, readReview, writePrResolutions } from '../sessions.ts'
import { manifestExists, resolveHome, sessionDir } from '../store.ts'

export const PrResolveItemSchema = z.object({
  comment: z.string().regex(PR_COMMENT_ID_RE),
  status: z.enum(PR_RESOLUTION_STATUSES),
  note: z.string(),
  commit: z.string().regex(/^[0-9a-f]{7,40}$/i, 'commit must be a 7-40 hex char sha').optional(),
  files: z.array(z.string()).optional(),
  /** The reply the agent proposes for the reviewer on GitHub (stored as `proposedReply`; the user edits it, and it is posted only after a Submit). */
  reply: z.string().trim().min(1).max(PR_REPLY_MAX_LENGTH).optional(),
})
export type PrResolveItem = z.infer<typeof PrResolveItemSchema>
export const PrResolveFileSchema = z.array(PrResolveItemSchema).min(1)

export interface PrResolveOptions {
  home: string
  id: string
  items: PrResolveItem[]
  now?: Date
}

export async function resolvePrComments(options: PrResolveOptions): Promise<{ resolutions: PrResolutions; file: string }> {
  const dir = sessionDir(options.home, options.id)
  if (!(await manifestExists(dir))) throw new Error(`session ${options.id} not found under ${options.home} (no manifest.json)`)
  const prComments = await readPrComments(dir)
  if (prComments === null) throw new Error(`session ${options.id} has no PR comments: run ai-review pr-sync first`)
  const known = new Map(prComments.comments.map((comment) => [comment.id, comment]))
  for (const item of options.items) {
    const comment = known.get(item.comment)
    if (comment === undefined) throw new Error(`unknown PR comment ${item.comment} in session ${options.id} (see ${prCommentsPath(dir)}; run ai-review pr-sync if it is new)`)
    if (comment.inReplyTo !== null && known.has(comment.inReplyTo)) throw new Error(`${item.comment} is a reply: resolve the thread root ${comment.inReplyTo}`)
    if (item.status === 'declined' && item.note.trim() === '') throw new Error(`${item.comment}: a declined comment needs the reason in --note`)
  }
  const nowIso = (options.now ?? new Date()).toISOString()
  const sentAt = (await readReview(dir))?.sent?.at ?? null
  const existing = await readPrResolutions(dir)
  const comments: PrResolutions['comments'] = { ...(existing?.comments ?? {}) }
  for (const item of options.items) {
    comments[item.comment] = { status: item.status, note: item.note, commitSha: item.commit ?? null, files: item.files ?? [], at: nowIso, sentAt, ...(item.reply === undefined ? {} : { proposedReply: item.reply }) }
  }
  const resolutions = await writePrResolutions(dir, { schemaVersion: SCHEMA_VERSION, sessionId: options.id, updatedAt: nowIso, comments, ...(existing?.trust ? { trust: existing.trust } : {}) })
  return { resolutions, file: path.join(dir, 'review', 'pr-resolutions.json') }
}

interface PrResolveFlags {
  comment?: string
  status?: string
  note?: string
  commit?: string
  files?: string
  reply?: string
  from?: string
}

export function registerPrResolve(program: Command): void {
  program
    .command('pr-resolve')
    .argument('<id>', 'session id')
    .description('Record how a GitHub PR comment was handled in pr-resolutions.json (addressed with a note, or declined with a reason)')
    .option('--comment <id>', 'PR comment id from pr-comments.json, e.g. rc123, rv45, ic67')
    .option('--status <status>', 'addressed | declined')
    .option('--note <text>', 'what changed and where, or the reason it was declined')
    .option('--commit <sha>', 'the commit that contains the fix (omit while uncommitted)')
    .option('--files <paths>', 'comma-separated paths touched for this comment')
    .option('--reply <text>', 'one or two sentences for the reviewer on GitHub, written as the author; the user can edit it in the dashboard and it is posted only after they submit')
    .option('--from <file>', 'JSON array of { comment, status, note, commit?, files?, reply? } instead of the flags')
    .action(async (id: string, flags: PrResolveFlags) => {
      let items: PrResolveItem[]
      if (flags.from) {
        items = PrResolveFileSchema.parse(JSON.parse(await readFile(path.resolve(flags.from), 'utf8')))
      } else {
        if (!flags.comment || !flags.status || flags.note === undefined) throw new Error('pr-resolve needs --comment, --status and --note (or --from <file>)')
        items = [
          PrResolveItemSchema.parse({
            comment: flags.comment,
            status: flags.status,
            note: flags.note,
            commit: flags.commit,
            reply: flags.reply,
            files: flags.files ? flags.files.split(',').map((p) => p.trim()).filter((p) => p !== '') : [],
          }),
        ]
      }
      const result = await resolvePrComments({ home: resolveHome(), id, items })
      for (const item of items) console.log(`${item.comment}: ${item.status} — ${item.note}${item.reply === undefined ? '' : ` (proposed reply: ${item.reply})`}`)
      console.log(result.file)
    })
}

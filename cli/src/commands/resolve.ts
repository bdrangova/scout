// `ai-review resolve <id>`: records how the agent addressed comments in review/resolutions.json.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { Command } from 'commander'
import { COMMENT_ID_RE, SCHEMA_VERSION, type Resolutions } from '@review-dash/shared'
import { RESOLUTIONS_FILE, readResolutions, readReview, unapproveAfterRerun, writeResolutions } from '../sessions.ts'
import { manifestExists, readManifest, resolveHome, sessionDir } from '../store.ts'

export const ResolveItemSchema = z.object({
  comment: z.string().regex(COMMENT_ID_RE),
  status: z.enum(['resolved', 'open']),
  note: z.string(),
  files: z.array(z.string()).optional(),
})
export type ResolveItem = z.infer<typeof ResolveItemSchema>
export const ResolveFileSchema = z.array(ResolveItemSchema).min(1)

export interface ResolveOptions {
  home: string
  id: string
  items: ResolveItem[]
  now?: Date
}

export async function resolveComments(options: ResolveOptions): Promise<{ resolutions: Resolutions; file: string }> {
  const dir = sessionDir(options.home, options.id)
  if (!(await manifestExists(dir))) throw new Error(`session ${options.id} not found under ${options.home} (no manifest.json)`)
  const review = await readReview(dir)
  const known = new Set(review?.comments.map((comment) => comment.id) ?? [])
  for (const item of options.items) {
    if (!known.has(item.comment)) throw new Error(`unknown comment ${item.comment} in session ${options.id}`)
  }
  const nowIso = (options.now ?? new Date()).toISOString()
  const existing = await readResolutions(dir)
  const comments: Resolutions['comments'] = { ...(existing?.comments ?? {}) }
  for (const item of options.items) {
    comments[item.comment] = { status: item.status, note: item.note, at: nowIso, files: item.files ?? [] }
  }
  const resolutions = await writeResolutions(dir, { schemaVersion: SCHEMA_VERSION, sessionId: options.id, updatedAt: nowIso, comments })
  // The agent answered these comments: an approved file or scenario they are on needs another look.
  const answered = new Set(options.items.map((item) => item.comment))
  await unapproveAfterRerun(dir, await readManifest(dir), (current) => current.comments.filter((comment) => answered.has(comment.id)), nowIso)
  return { resolutions, file: path.join(dir, RESOLUTIONS_FILE) }
}

interface ResolveFlags {
  comment?: string
  status?: string
  note?: string
  files?: string
  from?: string
}

export function registerResolve(program: Command): void {
  program
    .command('resolve')
    .argument('<id>', 'session id')
    .description('Record how a comment was addressed')
    .option('--comment <id>', 'comment id, e.g. c3')
    .option('--status <status>', 'resolved | open (open = reply without resolving)')
    .option('--note <text>', 'one line: what changed, where, how it was verified')
    .option('--files <paths>', 'comma-separated paths touched for this comment')
    .option('--from <file>', 'JSON array of { comment, status, note, files? } instead of the flags')
    .action(async (id: string, flags: ResolveFlags) => {
      let items: ResolveItem[]
      if (flags.from) {
        items = ResolveFileSchema.parse(JSON.parse(await readFile(path.resolve(flags.from), 'utf8')))
      } else {
        if (!flags.comment || !flags.status || flags.note === undefined) {
          throw new Error('resolve needs --comment, --status and --note (or --from <file>)')
        }
        items = [
          ResolveItemSchema.parse({
            comment: flags.comment,
            status: flags.status,
            note: flags.note,
            files: flags.files ? flags.files.split(',').map((p) => p.trim()).filter((p) => p !== '') : [],
          }),
        ]
      }
      const result = await resolveComments({ home: resolveHome(), id, items })
      for (const item of items) console.log(`${item.comment}: ${item.status} — ${item.note}`)
      console.log(result.file)
    })
}

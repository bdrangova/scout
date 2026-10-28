// `ai-review pr-trust <id> --comment <cid> | --author <login>`: the user's explicit choice to hand a comment (or every
// comment of an author) from an untrusted GitHub author to the agent. Terminal only: an agent (no TTY) is refused,
// so a comment cannot talk the agent into trusting itself.
import path from 'node:path'
import type { Command } from 'commander'
import { PR_COMMENT_ID_RE, SCHEMA_VERSION, hashPrBody, type PrResolutions } from '@scout/shared'
import { findPrSession } from '../pr/session.ts'
import { readPrComments, readPrResolutions, writePrResolutions } from '../sessions.ts'
import { resolveHome } from '../store.ts'

export interface PrTrustOptions {
  home: string
  repo: string
  id?: string | null
  comment?: string
  author?: string
  /** Whether a person is at a terminal; the default checks stdin and stdout. */
  interactive?: boolean
  now?: Date
}

export async function prTrust(options: PrTrustOptions): Promise<{ trust: NonNullable<PrResolutions['trust']> }> {
  const interactive = options.interactive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true)
  if (!interactive) throw new Error('pr-trust must be run by you in a terminal, not by an agent: trusting a GitHub author lets their comments steer the agent')
  if ((options.comment === undefined) === (options.author === undefined)) throw new Error('pr-trust needs exactly one of --comment <id> or --author <login>')
  const session = await findPrSession(options)
  const prComments = await readPrComments(session.dir)
  if (prComments === null) throw new Error(`session ${session.id} has no PR comments: run ai-review pr-sync first`)
  const existing = await readPrResolutions(session.dir)
  const trust: NonNullable<PrResolutions['trust']> = { authors: [...(existing?.trust?.authors ?? [])], comments: [...(existing?.trust?.comments ?? [])] }
  if (options.comment !== undefined) {
    const target = prComments.comments.find((c) => c.id === options.comment)
    if (!PR_COMMENT_ID_RE.test(options.comment) || target === undefined) throw new Error(`unknown PR comment ${options.comment}`)
    // Pinned to what is stored now: editing the comment on GitHub withdraws the grant at the next sync.
    trust.comments = trust.comments.filter((grant) => (typeof grant === 'string' ? grant : grant.id) !== target.id)
    trust.comments.push({ id: target.id, bodyHash: hashPrBody(target.body), updatedAt: target.updatedAt })
  } else if (options.author !== undefined) {
    const login = options.author.replace(/^@/, '')
    if (!prComments.comments.some((c) => c.author.login.toLowerCase() === login.toLowerCase())) throw new Error(`no comment by ${login} on PR #${prComments.pr.number}`)
    if (!trust.authors.some((a) => a.toLowerCase() === login.toLowerCase())) trust.authors.push(login)
  }
  await writePrResolutions(session.dir, {
    schemaVersion: SCHEMA_VERSION,
    sessionId: session.id,
    updatedAt: (options.now ?? new Date()).toISOString(),
    comments: existing?.comments ?? {},
    trust,
  })
  return { trust }
}

export function registerPrTrust(program: Command): void {
  program
    .command('pr-trust')
    .argument('[id]', 'session id (default: the open session for this branch)')
    .description('Let the agent see comments from an untrusted author. Terminal only.')
    .option('--repo <path>', 'path inside the repository (default: cwd)')
    .option('--comment <id>', 'PR comment id, e.g. rc123')
    .option('--author <login>', 'GitHub login')
    .action(async (id: string | undefined, flags: { repo?: string; comment?: string; author?: string }) => {
      const { trust } = await prTrust({ home: resolveHome(), repo: path.resolve(flags.repo ?? process.cwd()), id: id ?? null, comment: flags.comment, author: flags.author })
      const ids = trust.comments.map((grant) => (typeof grant === 'string' ? grant : grant.id))
      console.log(`trusted comments: ${ids.join(', ') || '-'} · trusted authors: ${trust.authors.join(', ') || '-'}`)
      if (flags.comment !== undefined) console.log('Trust lapses if the comment is edited on GitHub (pr-sync reports it).')
      if (flags.author !== undefined) console.log('Author trust is standing: later edits and new comments stay trusted.')
    })
}

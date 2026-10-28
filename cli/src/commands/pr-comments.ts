// `ai-review pr-comments [id]`: the open, trusted GitHub PR comments of the session as the agent should read them
// (untrusted bodies delimited as data; comments from untrusted authors only counted). Read-only.
import path from 'node:path'
import type { Command } from 'commander'
import { derivePrComments, renderPrCommentsMarkdown } from '@scout/shared'
import { findPrSession } from '../pr/session.ts'
import { readPrComments, readPrResolutions, readReview } from '../sessions.ts'
import { resolveHome } from '../store.ts'

/** The `## GitHub PR comments` section, or a one-line note when nothing is open. */
export async function renderSessionPrComments(options: { home: string; repo: string; id?: string | null }): Promise<string> {
  const session = await findPrSession(options)
  const prComments = await readPrComments(session.dir)
  if (prComments === null) return `no GitHub PR synced for session ${session.id}: run ai-review pr-sync first`
  const lastSend = (await readReview(session.dir))?.sent?.at ?? null
  const views = derivePrComments(prComments, await readPrResolutions(session.dir), lastSend)
  return renderPrCommentsMarkdown({ sessionId: session.id, pr: prComments.pr, views }) ?? `no open GitHub PR comments on #${prComments.pr.number}`
}

export function registerPrComments(program: Command): void {
  program
    .command('pr-comments')
    .argument('[id]', 'session id (default: the open session for this branch)')
    .description('Print open PR comments from trusted authors as untrusted data (never read pr-comments.json directly)')
    .option('--repo <path>', 'path inside the repository (default: cwd)')
    .action(async (id: string | undefined, flags: { repo?: string }) => {
      console.log(await renderSessionPrComments({ home: resolveHome(), repo: path.resolve(flags.repo ?? process.cwd()), id: id ?? null }))
    })
}

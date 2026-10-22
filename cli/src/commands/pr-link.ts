// `ai-review pr-link <id> --url <github pull url> [--number N]`: records a PR opened outside the flow, without gh.
import path from 'node:path'
import type { Command } from 'commander'
import { isTestRun, SCHEMA_VERSION, type PrComments } from '@review-dash/shared'
import { findPrSession } from '../pr/session.ts'
import { prCommentsPath, readPrComments, writePrComments } from '../sessions.ts'
import { readManifest, resolveHome } from '../store.ts'

const PULL_URL_RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)(?:[/?#].*)?$/

/** `https://github.com/<owner>/<repo>/pull/<n>` → its parts, or null for anything else. */
export function parsePullUrl(url: string): { repo: string; number: number; url: string } | null {
  const match = PULL_URL_RE.exec(url.trim())
  if (match === null) return null
  const [, owner = '', name = '', number = ''] = match
  return { repo: `${owner}/${name}`, number: Number(number), url: `https://github.com/${owner}/${name}/pull/${number}` }
}

export interface PrLinkOptions {
  home: string
  repo: string
  id?: string | null
  url: string
  number?: number | null
  now?: Date
}

/**
 * Writes the PR identity into `pr-comments.json` (keeping comments of the same PR, dropping those of another).
 * Title, state and head sha are placeholders until a `pr-sync` fills them in.
 */
export async function prLink(options: PrLinkOptions): Promise<{ file: string; prComments: PrComments }> {
  const parsed = parsePullUrl(options.url)
  if (parsed === null) throw new Error(`not a GitHub pull request url (expected https://github.com/<owner>/<repo>/pull/<number>): ${options.url}`)
  if (options.number != null && options.number !== parsed.number) throw new Error(`--number ${options.number} does not match the url (#${parsed.number})`)
  const session = await findPrSession(options)
  const manifest = await readManifest(session.dir)
  if (isTestRun(manifest)) throw new Error(`session ${session.id} is a test run: GitHub pull requests only apply to code reviews`)
  const existing = await readPrComments(session.dir)
  const same = existing !== null && existing.pr.number === parsed.number && existing.pr.repo === parsed.repo
  const pr: PrComments['pr'] = same
    ? existing.pr
    : {
        repo: parsed.repo,
        number: parsed.number,
        url: parsed.url,
        title: `Pull request #${parsed.number}`,
        state: 'open',
        draft: false,
        baseRef: manifest.repo.baseRef.replace(/^origin\//, ''),
        headRef: manifest.repo.branch ?? 'HEAD',
        headSha: '',
      }
  const prComments = await writePrComments(session.dir, {
    schemaVersion: SCHEMA_VERSION,
    sessionId: session.id,
    fetchedAt: (options.now ?? new Date()).toISOString(),
    pr,
    comments: same ? existing.comments : [],
  })
  return { file: prCommentsPath(session.dir), prComments }
}

interface PrLinkFlags {
  repo?: string
  url?: string
  number?: string
}

export function registerPrLink(program: Command): void {
  program
    .command('pr-link')
    .argument('[id]', 'session id (default: the open session for this branch)')
    .description('Record a GitHub PR opened outside the flow (no gh needed); run pr-sync later for its title, state and comments')
    .option('--repo <path>', 'path inside the repository (default: cwd)')
    .requiredOption('--url <url>', 'https://github.com/<owner>/<repo>/pull/<number>')
    .option('--number <n>', 'pull request number (checked against the url)')
    .action(async (id: string | undefined, flags: PrLinkFlags) => {
      const result = await prLink({
        home: resolveHome(),
        repo: path.resolve(flags.repo ?? process.cwd()),
        id: id ?? null,
        url: flags.url ?? '',
        number: flags.number === undefined ? null : Number(flags.number),
      })
      console.log(`linked PR #${result.prComments.pr.number} ${result.prComments.pr.url}`)
      console.log(result.file)
    })
}

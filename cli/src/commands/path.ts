// `ai-review path <id> [evidence|extras|spec]`: the absolute folder the agent writes into.
import path from 'node:path'
import type { Command } from 'commander'
import { SESSION_EVIDENCE_DIR, SESSION_EXTRAS_DIR, SESSION_SPEC_DIR } from '@review-dash/shared'
import { manifestExists, resolveHome, sessionDir } from '../store.ts'

export const PATH_KINDS = [SESSION_EVIDENCE_DIR, SESSION_EXTRAS_DIR, SESSION_SPEC_DIR] as const
export type PathKind = (typeof PATH_KINDS)[number]

function isPathKind(value: string): value is PathKind {
  return (PATH_KINDS as readonly string[]).includes(value)
}

export async function sessionPath(options: { home: string; id: string; kind?: string | null }): Promise<string> {
  const dir = sessionDir(options.home, options.id)
  if (!(await manifestExists(dir))) throw new Error(`session ${options.id} not found under ${options.home} (no manifest.json)`)
  if (options.kind === undefined || options.kind === null) return dir
  if (!isPathKind(options.kind)) throw new Error(`unknown folder "${options.kind}": expected ${PATH_KINDS.join(' | ')}`)
  return path.join(dir, options.kind)
}

export function registerPath(program: Command): void {
  program
    .command('path')
    .argument('<id>', 'session id')
    .argument('[folder]', `${PATH_KINDS.join(' | ')} (default: the session folder)`)
    .description('Print the absolute path of a session folder, or of its evidence, extras or spec folder')
    .action(async (id: string, folder: string | undefined) => {
      console.log(await sessionPath({ home: resolveHome(), id, kind: folder ?? null }))
    })
}

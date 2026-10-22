// `ai-review path <id> [evidence|extras|spec|run]`: the absolute folder the agent writes into (`run`: the run folder of a test-run session).
import path from 'node:path'
import type { Command } from 'commander'
import { isTestRun, SESSION_EVIDENCE_DIR, SESSION_EXTRAS_DIR, SESSION_SPEC_DIR } from '@review-dash/shared'
import { manifestExists, readManifest, resolveHome, sessionDir } from '../store.ts'

export const PATH_KINDS = [SESSION_EVIDENCE_DIR, SESSION_EXTRAS_DIR, SESSION_SPEC_DIR] as const
const RUN_KIND = 'run'
export type PathKind = (typeof PATH_KINDS)[number]

function isPathKind(value: string): value is PathKind {
  return (PATH_KINDS as readonly string[]).includes(value)
}

export async function sessionPath(options: { home: string; id: string; kind?: string | null }): Promise<string> {
  const dir = sessionDir(options.home, options.id)
  if (!(await manifestExists(dir))) throw new Error(`session ${options.id} not found under ${options.home} (no manifest.json)`)
  if (options.kind === undefined || options.kind === null) return dir
  if (options.kind === RUN_KIND) {
    const manifest = await readManifest(dir)
    if (!isTestRun(manifest)) throw new Error(`session ${options.id} is a code review: it has no run folder`)
    return manifest.run.path
  }
  if (!isPathKind(options.kind)) throw new Error(`unknown folder "${options.kind}": expected ${[...PATH_KINDS, RUN_KIND].join(' | ')}`)
  return path.join(dir, options.kind)
}

export function registerPath(program: Command): void {
  program
    .command('path')
    .argument('<id>', 'session id')
    .argument('[folder]', `${[...PATH_KINDS, RUN_KIND].join(' | ')} (default: the session folder; run: the run folder of a test-run session)`)
    .description('Print the absolute path of a session folder, of its evidence, extras or spec folder, or the run folder of a test-run session')
    .action(async (id: string, folder: string | undefined) => {
      console.log(await sessionPath({ home: resolveHome(), id, kind: folder ?? null }))
    })
}

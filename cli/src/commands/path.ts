// `scout path <id> [evidence|extras|spec|run]`: the absolute folder the agent writes into (`run`: the run folder of a test-run session).
import path from 'node:path'
import type { Command } from 'commander'
import { isTestRun, runFolderOf, SESSION_EVIDENCE_DIR, SESSION_EXTRAS_DIR, SESSION_SPEC_DIR } from '@scout/shared'
import { archivedSessionDir, manifestExists, readManifest, resolveHome, sessionDir } from '../store.ts'

export const PATH_KINDS = [SESSION_EVIDENCE_DIR, SESSION_EXTRAS_DIR, SESSION_SPEC_DIR] as const
const RUN_KIND = 'run'
export type PathKind = (typeof PATH_KINDS)[number]

function isPathKind(value: string): value is PathKind {
  return (PATH_KINDS as readonly string[]).includes(value)
}

export async function sessionPath(options: { home: string; id: string; kind?: string | null }): Promise<string> {
  const live = sessionDir(options.home, options.id)
  // The run folder moves with the session, so `run` also answers for an archived session.
  const dir = options.kind === RUN_KIND && !(await manifestExists(live)) && (await manifestExists(archivedSessionDir(options.home, options.id))) ? archivedSessionDir(options.home, options.id) : live
  if (!(await manifestExists(dir))) throw new Error(`session ${options.id} not found under ${options.home} (no manifest.json)`)
  if (options.kind === undefined || options.kind === null) return dir
  if (options.kind === RUN_KIND) {
    const manifest = await readManifest(dir)
    if (!isTestRun(manifest)) throw new Error(`session ${options.id} is a code review: it has no run folder`)
    return runFolderOf(dir)
  }
  if (!isPathKind(options.kind)) throw new Error(`unknown folder "${options.kind}": expected ${[...PATH_KINDS, RUN_KIND].join(' | ')}`)
  return path.join(dir, options.kind)
}

export function registerPath(program: Command): void {
  program
    .command('path')
    .argument('<id>', 'session id')
    .argument('[folder]', `${[...PATH_KINDS, RUN_KIND].join(' | ')} (default: the session folder; run: the run folder of a test-run session)`)
    .description('Print the path of a session folder, or its evidence, extras, spec or run folder')
    .action(async (id: string, folder: string | undefined) => {
      console.log(await sessionPath({ home: resolveHome(), id, kind: folder ?? null }))
    })
}

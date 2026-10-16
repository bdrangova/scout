// `ai-review archive <id> [--undo]` moves a session folder between sessions/ and archive/; `ai-review delete <id> --yes` removes an archived one (no server needed).
import { cp, lstat, mkdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { ARCHIVED_FILE, ARCHIVE_DIR, SESSION_ID_RE } from '@review-dash/shared'
import { archivedSessionDir, manifestExists, resolveHome, sessionDir } from '../store.ts'

async function isDir(dir: string): Promise<boolean> {
  return stat(dir).then(
    (s) => s.isDirectory(),
    () => false,
  )
}

/** `fs.rename`, or copy + remove when the two folders are on different volumes. */
async function moveDir(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch (error) {
    if ((error as { code?: string }).code !== 'EXDEV') throw error
    await cp(from, to, { recursive: true, errorOnExist: true, force: false })
    await rm(from, { recursive: true, force: true })
  }
}

export interface ArchiveOptions {
  home: string
  id: string
  undo?: boolean
  now?: Date
}

/** Returns the folder the session now lives in. */
export async function archiveSession({ home, id, undo = false, now = new Date() }: ArchiveOptions): Promise<string> {
  if (!SESSION_ID_RE.test(id)) throw new Error(`"${id}" is not a session id`)
  const live = sessionDir(home, id)
  const archived = archivedSessionDir(home, id)
  if (undo) {
    if (!(await isDir(archived))) throw new Error(`session ${id} is not archived under ${home}`)
    if (await isDir(live)) throw new Error(`session ${id} already exists under ${path.dirname(live)}`)
    await rm(path.join(archived, ARCHIVED_FILE), { force: true })
    await moveDir(archived, live)
    return live
  }
  if (!(await manifestExists(live))) throw new Error(`session ${id} not found under ${home} (no manifest.json)`)
  if (await isDir(archived)) throw new Error(`session ${id} is already archived`)
  await writeFile(path.join(live, ARCHIVED_FILE), `${JSON.stringify({ archivedAt: now.toISOString() }, null, 2)}\n`, 'utf8')
  await moveDir(live, archived)
  return archived
}

export interface DeleteOptions {
  home: string
  id: string
}

/**
 * `ai-review delete <id>`: removes `archive/<id>` for good (archived sessions only; a live session is
 * refused and untouched). The repository itself is never touched. Returns the folder it removed.
 */
export async function deleteArchivedSession({ home, id }: DeleteOptions): Promise<string> {
  if (!SESSION_ID_RE.test(id)) throw new Error(`"${id}" is not a session id`)
  const archiveDir = path.resolve(home, ARCHIVE_DIR)
  const archived = path.resolve(archivedSessionDir(home, id))
  if (path.dirname(archived) !== archiveDir) throw new Error(`"${id}" does not resolve inside ${archiveDir}`)
  const entry = await lstat(archived).catch(() => null)
  if (entry === null) {
    const hint = (await isDir(sessionDir(home, id))) ? 'is live, not archived (archive it first)' : `is not archived under ${home}`
    throw new Error(`session ${id} ${hint}`)
  }
  // A symlinked entry only loses the link, never what it points at.
  if (entry.isSymbolicLink()) await unlink(archived)
  else await rm(archived, { recursive: true, force: true })
  return archived
}

export function registerArchive(program: Command): void {
  program
    .command('delete')
    .argument('<id>', 'archived session id')
    .option('--yes', 'actually delete; without it, print what would be deleted and exit 2')
    .description('Delete an archived session permanently (review state, comments and run logs; the repository is not touched)')
    .action(async (id: string, options: { yes?: boolean }) => {
      const home = resolveHome()
      if (options.yes !== true) {
        if (!(await isDir(archivedSessionDir(home, id)))) throw new Error(`session ${id} is not archived under ${home}`)
        console.log(`Would delete ${archivedSessionDir(home, id)} (review state, comments and run logs). The repository is not touched. Re-run with --yes.`)
        process.exitCode = 2
        return
      }
      console.log(await deleteArchivedSession({ home, id }))
    })

  program
    .command('archive')
    .argument('<id>', 'session id')
    .option('--undo', 'move an archived session back to the live list')
    .description('Archive a session (moves its folder to archive/; reversible with --undo)')
    .action(async (id: string, options: { undo?: boolean }) => {
      console.log(await archiveSession({ home: resolveHome(), id, undo: options.undo ?? false }))
    })
}

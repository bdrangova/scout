import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { gitText, gitTry } from '@review-dash/shared/git/run'
import { errorMessage } from '../errors.ts'
import { isMissing } from '../store/fs.ts'

/** A linked worktree found through a configured folder. */
export interface FoundWorktree {
  /** Realpath'd, posix separators. */
  path: string
  folder: string
}

export interface Discovery {
  found: FoundWorktree[]
  errors: { folder: string; error: string }[]
}

export const worktreeId = (worktreePath: string): string => createHash('sha256').update(worktreePath).digest('hex').slice(0, 12)

const posix = (p: string): string => p.split(path.sep).join('/')

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function isFileEntry(p: string): Promise<boolean> {
  try {
    return (await fs.lstat(p)).isFile()
  } catch (err) {
    if (isMissing(err)) return false
    throw err
  }
}

/** The linked worktrees `git worktree list` reports for a main checkout (the first entry is the main one). */
async function listLinked(main: string): Promise<string[]> {
  const out = await gitText(main, ['worktree', 'list', '--porcelain'])
  const found: string[] = []
  for (const [index, block] of out.split('\n\n').entries()) {
    if (index === 0) continue
    const lines = block.split('\n')
    const line = lines.find((l) => l.startsWith('worktree '))
    if (line === undefined || lines.some((l) => l === 'bare' || l.startsWith('prunable'))) continue
    found.push(line.slice('worktree '.length))
  }
  return found
}

async function scanFolder(folder: string): Promise<string[]> {
  if (await isDir(path.join(folder, '.git'))) return listLinked(folder)
  const entries = await fs.readdir(folder, { withFileTypes: true })
  const children = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => path.join(folder, e.name))
  const linked = await Promise.all(children.map(async (child) => ((await isFileEntry(path.join(child, '.git'))) ? child : null)))
  return linked.filter((p): p is string => p !== null)
}

/** Linked worktrees of every folder, deduplicated by path; a folder that cannot be read is reported in `errors`. */
export async function discoverWorktrees(folders: readonly string[]): Promise<Discovery> {
  const byPath = new Map<string, FoundWorktree>()
  const errors: Discovery['errors'] = []
  for (const folder of folders) {
    try {
      for (const raw of await scanFolder(folder)) {
        const real = posix(await fs.realpath(raw))
        if (!byPath.has(real)) byPath.set(real, { path: real, folder })
      }
    } catch (err) {
      errors.push({ folder, error: isMissing(err) ? 'folder does not exist' : errorMessage(err) })
    }
  }
  return { found: [...byPath.values()], errors }
}

/** Absolute path of the main checkout; null for a bare repo or when git cannot say. */
export async function mainRepoOf(worktree: string): Promise<string | null> {
  const out = await gitTry(worktree, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const commonDir = out?.replace(/\n$/, '')
  if (commonDir === undefined || commonDir === '' || path.basename(commonDir) !== '.git') return null
  return posix(path.dirname(commonDir))
}

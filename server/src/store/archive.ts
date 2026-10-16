import fs from 'node:fs/promises'
import path from 'node:path'
import { ARCHIVED_FILE, ArchivedMarkerSchema } from '@review-dash/shared'
import type { ArchivedSession, Manifest } from '@review-dash/shared'
import { isMissing, readTextIfExists, writeFileAtomic } from './fs.ts'

function errorCode(err: unknown): string | undefined {
  return err !== null && typeof err === 'object' ? (err as { code?: string }).code : undefined
}

/** Moves a folder; across volumes (`EXDEV`) it copies and then removes the source. */
export async function moveDir(from: string, to: string): Promise<void> {
  await fs.mkdir(path.dirname(to), { recursive: true })
  try {
    await fs.rename(from, to)
  } catch (err) {
    if (errorCode(err) !== 'EXDEV') throw err
    await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false })
    await fs.rm(from, { recursive: true, force: true })
  }
}

export async function isDir(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory()
  } catch (err) {
    if (isMissing(err)) return false
    throw err
  }
}

export type ArchiveEntry = 'missing' | 'symlink' | 'dir' | 'other'

/** What `archive/<id>` is on disk, without following symlinks. */
export async function archiveEntryKind(dir: string): Promise<ArchiveEntry> {
  try {
    const stat = await fs.lstat(dir)
    if (stat.isSymbolicLink()) return 'symlink'
    return stat.isDirectory() ? 'dir' : 'other'
  } catch (err) {
    if (isMissing(err)) return 'missing'
    throw err
  }
}

/**
 * Removes `archive/<id>` for good. The path must be a direct child of `archiveDir` (no traversal);
 * a symlinked entry only loses the link, never what it points at.
 */
export async function removeArchivedDir(archiveDir: string, dir: string): Promise<void> {
  const root = path.resolve(archiveDir)
  const target = path.resolve(dir)
  if (path.dirname(target) !== root || target === root) throw new Error(`${dir} is not inside ${archiveDir}`)
  if ((await archiveEntryKind(target)) === 'symlink') {
    await fs.unlink(target)
    return
  }
  await fs.rm(target, { recursive: true, force: true })
}

export function writeArchivedMarker(dir: string, archivedAt: string): Promise<void> {
  return writeFileAtomic(path.join(dir, ARCHIVED_FILE), `${JSON.stringify({ archivedAt }, null, 2)}\n`)
}

export function removeArchivedMarker(dir: string): Promise<void> {
  return fs.rm(path.join(dir, ARCHIVED_FILE), { force: true })
}

/** `archived.json`'s timestamp; falls back to the folder's mtime when the file is missing or invalid. */
export async function readArchivedAt(dir: string): Promise<string> {
  const text = await readTextIfExists(path.join(dir, ARCHIVED_FILE))
  if (text !== null) {
    try {
      const parsed = ArchivedMarkerSchema.safeParse(JSON.parse(text))
      if (parsed.success) return parsed.data.archivedAt
    } catch {
      // fall through to the folder mtime
    }
  }
  return (await fs.stat(dir)).mtime.toISOString()
}

export function archivedSession(manifest: Manifest, archivedAt: string): ArchivedSession {
  return {
    id: manifest.id,
    title: manifest.title,
    tickets: manifest.tickets,
    repo: { path: manifest.repo.path, branch: manifest.repo.branch, baseRef: manifest.repo.baseRef },
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    archivedAt,
  }
}

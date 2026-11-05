// Session store: where sessions live on disk and how the manifest is read and written.
import { randomBytes } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ARCHIVE_DIR, ManifestSchema, SESSIONS_DIR, type Manifest } from '@scout/shared'

export const MANIFEST_FILE = 'manifest.json'
export const SLUG_MAX_LENGTH = 40

/** `SCOUT_HOME`, or `~/.scout`. */
export function resolveHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.SCOUT_HOME
  if (fromEnv !== undefined && fromEnv.trim() !== '') return path.resolve(fromEnv)
  return path.join(os.homedir(), '.scout')
}

export function sessionDir(home: string, id: string): string {
  return path.join(home, SESSIONS_DIR, id)
}

/** `<home>/archive/<id>`: where `scout archive` moves a session folder. */
export function archivedSessionDir(home: string, id: string): string {
  return path.join(home, ARCHIVE_DIR, id)
}

/** Lower-cased, runs of anything outside `[a-z0-9]` become `-`, trimmed, at most 40 chars. */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')
  return slug === '' ? 'session' : slug
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/** `<yyyymmdd>-<hhmm>-<slug>-<4hex>` in local time. */
export function newSessionId(slug: string, now: Date = new Date(), hex: string = randomBytes(2).toString('hex')): string {
  const stamp = `${pad(now.getFullYear(), 4)}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}-${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}`
  return `${stamp}-${slugify(slug)}-${hex}`
}

/** Writes JSON through a temp file in the same directory and renames it into place. */
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  await mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  try {
    await rename(tmp, filePath)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}

export async function manifestExists(dir: string): Promise<boolean> {
  try {
    await access(path.join(dir, MANIFEST_FILE))
    return true
  } catch {
    return false
  }
}

export async function readManifest(dir: string): Promise<Manifest> {
  const raw = await readFile(path.join(dir, MANIFEST_FILE), 'utf8')
  return ManifestSchema.parse(JSON.parse(raw))
}

/** Validates, then writes atomically. Call this last: the manifest is the index of everything else. */
export async function writeManifest<M extends Manifest>(dir: string, manifest: M): Promise<M> {
  ManifestSchema.parse(manifest)
  await writeJsonAtomic(path.join(dir, MANIFEST_FILE), manifest)
  return manifest
}

import os from 'node:os'
import path from 'node:path'
import { CONFIG_FILE, PutSettingsRequestSchema, SettingsSchema } from '@review-dash/shared'
import type { Settings } from '@review-dash/shared'
import { badRequest, formatZodError, invalidStoreFile } from './errors.ts'
import { readTextIfExists, writeFileAtomic } from './store/fs.ts'

function expandHome(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

/** `~` expanded, absolute, no trailing slash, posix separators. */
export function normalizeFolder(folder: string): string {
  return path.resolve(expandHome(folder.trim())).split(path.sep).join('/')
}

/** Normalised, deduplicated folders in the order given. */
export function normalizeSettings(settings: Settings): Settings {
  return { worktreeFolders: [...new Set(settings.worktreeFolders.map(normalizeFolder))] }
}

/** `<home>/config.json`; a missing file reads as the defaults, an unreadable one is a 422. */
export async function readSettings(home: string): Promise<Settings> {
  const text = await readTextIfExists(path.join(home, CONFIG_FILE))
  if (text === null) return SettingsSchema.parse({})
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw invalidStoreFile(`${CONFIG_FILE} is not valid JSON`)
  }
  const parsed = SettingsSchema.safeParse(json)
  if (!parsed.success) throw invalidStoreFile(`${CONFIG_FILE}: ${formatZodError(parsed.error)}`)
  return parsed.data
}

/** Validates, normalises and writes the whole settings object; returns what was stored. */
export async function writeSettings(home: string, body: unknown): Promise<Settings> {
  const parsed = PutSettingsRequestSchema.safeParse(body)
  if (!parsed.success) throw badRequest(formatZodError(parsed.error))
  const settings = normalizeSettings(parsed.data)
  await writeFileAtomic(path.join(home, CONFIG_FILE), `${JSON.stringify(settings, null, 2)}\n`)
  return settings
}

import os from 'node:os'
import path from 'node:path'
import { CONFIG_FILE, PutSettingsRequestSchema, SettingsSchema } from '@scout/shared'
import type { Settings } from '@scout/shared'
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

/**
 * Validates, normalises and writes the settings; returns what was stored. The file is shared with the CLI
 * (`port`, `repos` runtime commands, trusted PR authors), so every other key is kept as it was.
 */
export async function writeSettings(home: string, body: unknown): Promise<Settings> {
  const parsed = PutSettingsRequestSchema.safeParse(body)
  if (!parsed.success) throw badRequest(formatZodError(parsed.error))
  const settings = normalizeSettings(parsed.data)
  const file = path.join(home, CONFIG_FILE)
  const text = await readTextIfExists(file)
  let existing: unknown = {}
  if (text !== null) {
    try {
      existing = JSON.parse(text)
    } catch {
      throw invalidStoreFile(`${CONFIG_FILE} is not valid JSON`)
    }
  }
  const base = existing !== null && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}
  await writeFileAtomic(file, `${JSON.stringify({ ...base, ...settings }, null, 2)}\n`)
  return settings
}

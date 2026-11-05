import fs from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { PR_PENDING_DIR, PendingPrReviewSchema, SESSION_ID_RE } from '@scout/shared'
import type { PendingPrReview } from '@scout/shared'
import { notFound } from '../errors.ts'
import { isMissing, readTextIfExists, writeFileAtomic } from '../store/fs.ts'
import { prKey } from './pr-url.ts'

const SLUG_MAX_LENGTH = 40
const pad = (value: number, width: number): string => String(value).padStart(width, '0')

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')
  return slug === '' ? 'session' : slug
}

/** `<yyyymmdd>-<hhmm>-<slug>-<4hex>` in local time, the same shape the CLI gives a session. */
export function newPendingId(title: string, now: Date = new Date(), hex: string = randomBytes(2).toString('hex')): string {
  const stamp = `${pad(now.getFullYear(), 4)}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}-${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}`
  return `${stamp}-${slugify(title)}-${hex}`
}

export const pendingDir = (home: string): string => path.join(home, PR_PENDING_DIR)

function pendingFile(home: string, id: string): string {
  if (!SESSION_ID_RE.test(id)) throw notFound(`no pending PR review ${JSON.stringify(id)}`)
  return path.join(pendingDir(home), `${id}.json`)
}

function parse(text: string, label: string): PendingPrReview {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
  return PendingPrReviewSchema.parse(json)
}

/** Every readable placeholder, newest first; a file that does not parse is skipped. */
export async function listPending(home: string): Promise<PendingPrReview[]> {
  let names: string[]
  try {
    names = await fs.readdir(pendingDir(home))
  } catch (err) {
    if (isMissing(err)) return []
    throw err
  }
  const items = await Promise.all(
    names
      .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
      .map(async (name) => {
        try {
          return parse((await readTextIfExists(path.join(pendingDir(home), name))) ?? '', name)
        } catch {
          return null
        }
      }),
  )
  return items.filter((item): item is PendingPrReview => item !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
}

export async function readPending(home: string, id: string): Promise<PendingPrReview> {
  const text = await readTextIfExists(pendingFile(home, id))
  if (text === null) throw notFound(`no pending PR review ${id}`)
  try {
    return parse(text, `${id}.json`)
  } catch {
    throw notFound(`pending PR review ${id} is unreadable`)
  }
}

export async function writePending(home: string, pending: PendingPrReview): Promise<void> {
  await writeFileAtomic(pendingFile(home, pending.id), `${JSON.stringify(pending, null, 2)}\n`)
}

export async function deletePending(home: string, id: string): Promise<void> {
  const file = pendingFile(home, id)
  try {
    await fs.unlink(file)
  } catch (err) {
    if (isMissing(err)) throw notFound(`no pending PR review ${id}`)
    throw err
  }
}

/** Normalised PR key → placeholder id (the newest when several exist). */
export async function pendingByPr(home: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (const item of (await listPending(home)).reverse()) {
    const key = prKey(item.pr.url)
    if (key !== null) map.set(key, item.id)
  }
  return map
}

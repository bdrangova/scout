// Store scanning and the review-side files of a session (review.json, resolutions.json, review/sent).
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ManifestSchema,
  ResolutionsSchema,
  ReviewSchema,
  mergeComments,
  type Manifest,
  type Resolutions,
  type Review,
} from '@review-dash/shared'
import { MANIFEST_FILE, sessionDir, writeJsonAtomic } from './store.ts'

export const REVIEW_FILE = path.join('review', 'review.json')
export const RESOLUTIONS_FILE = path.join('review', 'resolutions.json')
export const SENT_DIR = path.join('review', 'sent')

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return undefined
  }
}

export async function listSessionIds(home: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(home, 'sessions'), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

/** A cheap look at a manifest: parsed JSON, `repo.path`/`repo.branch` read without full validation. */
export interface ManifestPeek {
  id: string
  dir: string
  repoPath: string | null
  branch: string | null
  raw: unknown
}

export async function peekManifest(home: string, id: string): Promise<ManifestPeek | null> {
  const dir = sessionDir(home, id)
  const raw = await readJson(path.join(dir, MANIFEST_FILE))
  if (raw === undefined || typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const repo = typeof record.repo === 'object' && record.repo !== null ? (record.repo as Record<string, unknown>) : {}
  return {
    id,
    dir,
    repoPath: typeof repo.path === 'string' ? repo.path : null,
    branch: typeof repo.branch === 'string' ? repo.branch : null,
    raw,
  }
}

export async function readReview(dir: string): Promise<Review | null> {
  const raw = await readJson(path.join(dir, REVIEW_FILE))
  if (raw === undefined) return null
  const parsed = ReviewSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export async function readResolutions(dir: string): Promise<Resolutions | null> {
  const raw = await readJson(path.join(dir, RESOLUTIONS_FILE))
  if (raw === undefined) return null
  const parsed = ResolutionsSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export async function writeResolutions(dir: string, resolutions: Resolutions): Promise<Resolutions> {
  const valid = ResolutionsSchema.parse(resolutions)
  await writeJsonAtomic(path.join(dir, RESOLUTIONS_FILE), valid)
  return valid
}

/** Open comments = review comments whose latest event (agent resolution or reviewer mark) leaves them open. */
export async function countOpenComments(dir: string, review: Review | null): Promise<number> {
  if (review === null) return 0
  return mergeComments(review, await readResolutions(dir)).filter((comment) => comment.status === 'open').length
}

/** Stems (`<sentAt with ':' → '-'>`) of the sent snapshots, oldest first; ISO stamps sort lexicographically. */
export async function listSentStems(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(dir, SENT_DIR))
    return entries
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length))
      .sort()
  } catch {
    return []
  }
}

export interface SessionMatch {
  id: string
  dir: string
  manifest: Manifest
}

/** Sessions of one repository (and branch when given) with a valid manifest, newest first by `updatedAt`. */
export async function sessionsForRepo(home: string, repoPath: string, branch: string | null = null): Promise<SessionMatch[]> {
  const matches: SessionMatch[] = []
  for (const id of await listSessionIds(home)) {
    const peek = await peekManifest(home, id)
    if (peek === null || peek.repoPath !== repoPath || (branch !== null && peek.branch !== branch)) continue
    const parsed = ManifestSchema.safeParse(peek.raw)
    if (!parsed.success) continue
    matches.push({ id, dir: peek.dir, manifest: parsed.data })
  }
  return matches.sort((a, b) => (a.manifest.updatedAt < b.manifest.updatedAt ? 1 : a.manifest.updatedAt > b.manifest.updatedAt ? -1 : 0))
}

/** The latest session for (repo, branch) unless its review was sent with an approve decision. */
export async function openSessionForBranch(home: string, repoPath: string, branch: string | null): Promise<SessionMatch | null> {
  const latest = (await sessionsForRepo(home, repoPath, branch))[0]
  if (latest === undefined) return null
  const review = await readReview(latest.dir)
  if (review?.sent?.decision === 'approve') return null
  return latest
}

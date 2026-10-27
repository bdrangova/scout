import fs from 'node:fs/promises'
import path from 'node:path'
import type { z } from 'zod'
import { AgentRunSchema, JOURNAL_FILE, JournalSchema, PR_COMMENTS_FILE, PR_REPLIES_FILE, PR_RESOLUTIONS_FILE, PrCommentsSchema, PrRepliesSchema, PrResolutionsSchema, ResolutionsSchema, ReviewSchema, sentFileStem } from '@review-dash/shared'
import type { AgentRun, Journal, PrComments, PrReplies, PrResolutions, Resolutions, Review } from '@review-dash/shared'
import { errorMessage, formatZodError, invalidStoreFile } from '../errors.ts'
import { isMissing, readTextIfExists, writeFileAtomic } from './fs.ts'

export const REVIEW_FILE = path.join('review', 'review.json')
export const RESOLUTIONS_FILE = path.join('review', 'resolutions.json')
export const RUNS_DIR = path.join('review', 'runs')

function parseValidated<T>(text: string, label: string, schema: z.ZodType<T>): T {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (err) {
    throw invalidStoreFile(`${label} is not valid JSON: ${errorMessage(err)}`)
  }
  const result = schema.safeParse(json)
  if (!result.success) throw invalidStoreFile(`${label} is invalid: ${formatZodError(result.error)}`)
  return result.data
}

async function readValidated<T>(file: string, label: string, schema: z.ZodType<T>): Promise<T | null> {
  const text = await readTextIfExists(file)
  return text === null ? null : parseValidated(text, label, schema)
}

/** `review/review.json`, validated; `null` when the reviewer has not saved anything yet. */
export async function readReview(sessionDir: string, sessionId: string): Promise<Review | null> {
  const review = await readValidated(path.join(sessionDir, REVIEW_FILE), 'review/review.json', ReviewSchema)
  if (review !== null && review.sessionId !== sessionId) {
    throw invalidStoreFile(`review/review.json belongs to session ${review.sessionId}, not ${sessionId}`)
  }
  return review
}

/** Atomic write (tmp + rename) of `review/review.json`. */
export async function writeReview(sessionDir: string, review: Review): Promise<void> {
  await writeFileAtomic(path.join(sessionDir, REVIEW_FILE), `${JSON.stringify(review, null, 2)}\n`)
}

/** `review/resolutions.json` (agent-owned), validated; `null` when absent. */
export async function readResolutions(sessionDir: string, sessionId: string): Promise<Resolutions | null> {
  const resolutions = await readValidated(
    path.join(sessionDir, RESOLUTIONS_FILE),
    'review/resolutions.json',
    ResolutionsSchema,
  )
  if (resolutions !== null && resolutions.sessionId !== sessionId) {
    throw invalidStoreFile(`review/resolutions.json belongs to session ${resolutions.sessionId}, not ${sessionId}`)
  }
  return resolutions
}

/** `review/journal.json` (Scout's journal, written by `ai-review journal`); `null` when absent, invalid or another session's. */
export async function readJournal(sessionDir: string, sessionId: string): Promise<Journal | null> {
  try {
    const journal = await readValidated(path.join(sessionDir, ...JOURNAL_FILE.split('/')), JOURNAL_FILE, JournalSchema)
    return journal !== null && journal.sessionId === sessionId ? journal : null
  } catch {
    return null
  }
}

/** `review/pr-comments.json` (written by `ai-review pr-sync`), validated; `null` when the session was never synced. */
export async function readPrComments(sessionDir: string, sessionId: string): Promise<PrComments | null> {
  const value = await readValidated(path.join(sessionDir, ...PR_COMMENTS_FILE.split('/')), PR_COMMENTS_FILE, PrCommentsSchema)
  if (value !== null && value.sessionId !== sessionId) throw invalidStoreFile(`${PR_COMMENTS_FILE} belongs to session ${value.sessionId}, not ${sessionId}`)
  return value
}

/** `review/pr-resolutions.json` (written by `ai-review pr-resolve`), validated; `null` when absent. */
export async function readPrResolutions(sessionDir: string, sessionId: string): Promise<PrResolutions | null> {
  const value = await readValidated(path.join(sessionDir, ...PR_RESOLUTIONS_FILE.split('/')), PR_RESOLUTIONS_FILE, PrResolutionsSchema)
  if (value !== null && value.sessionId !== sessionId) throw invalidStoreFile(`${PR_RESOLUTIONS_FILE} belongs to session ${value.sessionId}, not ${sessionId}`)
  return value
}

/** `review/pr-replies.json` (the user's drafts, written here and by `ai-review pr-reply`), validated; `null` when absent. */
export async function readPrReplies(sessionDir: string, sessionId: string): Promise<PrReplies | null> {
  const value = await readValidated(path.join(sessionDir, ...PR_REPLIES_FILE.split('/')), PR_REPLIES_FILE, PrRepliesSchema)
  if (value !== null && value.sessionId !== sessionId) throw invalidStoreFile(`${PR_REPLIES_FILE} belongs to session ${value.sessionId}, not ${sessionId}`)
  return value
}

/** Atomic write of `review/pr-replies.json`. Not registered as an own write: the watcher reports it as `pr-comments.updated`. */
export async function writePrReplies(sessionDir: string, replies: PrReplies): Promise<void> {
  await writeFileAtomic(path.join(sessionDir, ...PR_REPLIES_FILE.split('/')), `${JSON.stringify(replies, null, 2)}\n`)
}

/**
 * Every `review/runs/*.json` that validates as an `AgentRun`, oldest first. Files that do not
 * parse (for example one being written right now) are skipped.
 */
export async function listRuns(sessionDir: string): Promise<AgentRun[]> {
  const dir = path.join(sessionDir, RUNS_DIR)
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch (err) {
    if (isMissing(err)) return []
    throw err
  }
  const runs: AgentRun[] = []
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    const text = await readTextIfExists(path.join(dir, name))
    if (text === null) continue
    try {
      runs.push(parseValidated(text, `review/runs/${name}`, AgentRunSchema))
    } catch {
      // ignore: mid-write or foreign file
    }
  }
  return runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
}

/** The id of the run that is `queued` or `running`, if any. */
export function activeRunId(runs: readonly AgentRun[]): string | null {
  return runs.find((run) => run.status === 'queued' || run.status === 'running')?.id ?? null
}

/** Status of the newest run (run files sort by their time-stamped id), if any. */
export function latestRunStatus(runs: readonly AgentRun[]): AgentRun['status'] | null {
  return runs[runs.length - 1]?.status ?? null
}

export const SENT_DIR = path.join('review', 'sent')

export function runFile(sessionDir: string, runId: string): string {
  return path.join(sessionDir, RUNS_DIR, `${runId}.json`)
}

export function runLogFile(sessionDir: string, runId: string): string {
  return path.join(sessionDir, RUNS_DIR, `${runId}.jsonl`)
}

/** One `review/runs/<id>.json`, validated; `null` when absent. */
export async function readRun(sessionDir: string, runId: string): Promise<AgentRun | null> {
  return readValidated(runFile(sessionDir, runId), `review/runs/${runId}.json`, AgentRunSchema)
}

/** `review/sent/<stem>.json`, `.md` and `.patch` for one Submit; stem = `sentFileStem(sentAt)`. */
export function sentFiles(sessionDir: string, sentAt: string): { json: string; markdown: string; patch: string } {
  const base = path.join(sessionDir, SENT_DIR, sentFileStem(sentAt))
  return { json: `${base}.json`, markdown: `${base}.md`, patch: `${base}.patch` }
}

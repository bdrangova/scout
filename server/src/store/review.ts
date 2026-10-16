import fs from 'node:fs/promises'
import path from 'node:path'
import type { z } from 'zod'
import { AgentRunSchema, ResolutionsSchema, ReviewSchema, sentFileStem } from '@review-dash/shared'
import type { AgentRun, Resolutions, Review } from '@review-dash/shared'
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

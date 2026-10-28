// Store scanning and the review-side files of a session (review.json, resolutions.json, review/sent).
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ManifestSchema,
  PR_COMMENTS_FILE,
  PR_REPLIES_FILE,
  PR_RESOLUTIONS_FILE,
  PrCommentsSchema,
  PrRepliesSchema,
  PrResolutionsSchema,
  SentSnapshotSchema,
  ResolutionsSchema,
  ReviewSchema,
  TEST_RUN_INDEX_FILE,
  TestRunIndexSchema,
  isTestRun,
  isTestRunSent,
  mergeComments,
  runFileOwners,
  unapproveCommented,
  type Comment,
  type CodeReviewManifest,
  type Manifest,
  type TestRunManifest,
  type PrComments,
  type PrReplies,
  type PrResolutions,
  type SentSnapshot,
  type Resolutions,
  type Review,
} from '@scout/shared'
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

/** A cheap look at a manifest: parsed JSON, `repo.path`/`repo.branch` (or `run.path`/`run.repo`) read without full validation. */
export interface ManifestPeek {
  id: string
  dir: string
  repoPath: string | null
  branch: string | null
  /** `run.path` of a test-run manifest. */
  runPath: string | null
  /** `run.repo` of a test-run manifest (the checkout the run belongs to). */
  runRepo: string | null
  raw: unknown
}

export async function peekManifest(home: string, id: string): Promise<ManifestPeek | null> {
  const dir = sessionDir(home, id)
  const raw = await readJson(path.join(dir, MANIFEST_FILE))
  if (raw === undefined || typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const section = (key: string): Record<string, unknown> => {
    const value = record[key]
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  }
  const repo = section('repo')
  const run = section('run')
  return {
    id,
    dir,
    repoPath: typeof repo.path === 'string' ? repo.path : null,
    branch: typeof repo.branch === 'string' ? repo.branch : null,
    runPath: typeof run.path === 'string' ? run.path : null,
    runRepo: typeof run.repo === 'string' ? run.repo : null,
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

const prFile = (dir: string, posix: string): string => path.join(dir, ...posix.split('/'))

export const prCommentsPath = (dir: string): string => prFile(dir, PR_COMMENTS_FILE)

/** `review/pr-comments.json`; null when absent or invalid (a sync rewrites it). */
export async function readPrComments(dir: string): Promise<PrComments | null> {
  const raw = await readJson(prFile(dir, PR_COMMENTS_FILE))
  const parsed = PrCommentsSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export async function writePrComments(dir: string, value: PrComments): Promise<PrComments> {
  const valid = PrCommentsSchema.parse(value)
  await writeJsonAtomic(prFile(dir, PR_COMMENTS_FILE), valid)
  return valid
}

export async function readPrResolutions(dir: string): Promise<PrResolutions | null> {
  const raw = await readJson(prFile(dir, PR_RESOLUTIONS_FILE))
  const parsed = PrResolutionsSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export async function writePrResolutions(dir: string, value: PrResolutions): Promise<PrResolutions> {
  const valid = PrResolutionsSchema.parse(value)
  await writeJsonAtomic(prFile(dir, PR_RESOLUTIONS_FILE), valid)
  return valid
}

/** `review/pr-replies.json` (the user's drafts); null when absent or invalid. */
export async function readPrReplies(dir: string): Promise<PrReplies | null> {
  const raw = await readJson(prFile(dir, PR_REPLIES_FILE))
  const parsed = PrRepliesSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export async function writePrReplies(dir: string, value: PrReplies): Promise<PrReplies> {
  const valid = PrRepliesSchema.parse(value)
  await writeJsonAtomic(prFile(dir, PR_REPLIES_FILE), valid)
  return valid
}

/** The newest code-review `review/sent/*.json` that validates; null when nothing was sent (test-run snapshots are skipped). */
export async function readLatestSent(dir: string): Promise<SentSnapshot | null> {
  const stems = await listSentStems(dir)
  for (const stem of stems.reverse()) {
    const parsed = SentSnapshotSchema.safeParse(await readJson(path.join(dir, SENT_DIR, `${stem}.json`)))
    if (parsed.success && !isTestRunSent(parsed.data)) return parsed.data
  }
  return null
}

export async function writeResolutions(dir: string, resolutions: Resolutions): Promise<Resolutions> {
  const valid = ResolutionsSchema.parse(resolutions)
  await writeJsonAtomic(path.join(dir, RESOLUTIONS_FILE), valid)
  return valid
}

export async function writeReview(dir: string, review: Review): Promise<Review> {
  const valid = ReviewSchema.parse(review)
  await writeJsonAtomic(path.join(dir, REVIEW_FILE), valid)
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

export interface SessionMatch<M extends Manifest = Manifest> {
  id: string
  dir: string
  manifest: M
}

function newestFirst<M extends Manifest>(matches: SessionMatch<M>[]): SessionMatch<M>[] {
  return matches.sort((a, b) => (a.manifest.updatedAt < b.manifest.updatedAt ? 1 : a.manifest.updatedAt > b.manifest.updatedAt ? -1 : 0))
}

/** Code-review sessions of one repository (and branch when given) with a valid manifest, newest first by `updatedAt`. */
export async function sessionsForRepo(home: string, repoPath: string, branch: string | null = null, kind: 'code-review' | 'pr-review' = 'code-review'): Promise<SessionMatch<CodeReviewManifest>[]> {
  const matches: SessionMatch<CodeReviewManifest>[] = []
  for (const id of await listSessionIds(home)) {
    const peek = await peekManifest(home, id)
    if (peek === null || peek.repoPath !== repoPath || (branch !== null && peek.branch !== branch)) continue
    const parsed = ManifestSchema.safeParse(peek.raw)
    if (!parsed.success || isTestRun(parsed.data) || (parsed.data.kind ?? 'code-review') !== kind) continue
    matches.push({ id, dir: peek.dir, manifest: parsed.data })
  }
  return newestFirst(matches)
}

/**
 * The latest live session for (repo, branch), approved or not: file verdicts are pinned to content
 * fingerprints, so after an approval only the files changed since come back for review. Archived
 * sessions live under `archive/` and are never found here.
 */
export async function openSessionForBranch(home: string, repoPath: string, branch: string | null, kind: 'code-review' | 'pr-review' = 'code-review'): Promise<SessionMatch<CodeReviewManifest> | null> {
  return (await sessionsForRepo(home, repoPath, branch, kind))[0] ?? null
}

/** The latest live test-run session of a run folder (`manifest.run.path`), newest first by `updatedAt`. Archived sessions are never found here. */
export async function openSessionForRun(home: string, runPath: string): Promise<SessionMatch<TestRunManifest> | null> {
  const matches: SessionMatch<TestRunManifest>[] = []
  for (const id of await listSessionIds(home)) {
    const peek = await peekManifest(home, id)
    if (peek === null || peek.runPath !== runPath) continue
    const parsed = ManifestSchema.safeParse(peek.raw)
    if (!parsed.success || !isTestRun(parsed.data)) continue
    matches.push({ id, dir: peek.dir, manifest: parsed.data })
  }
  return newestFirst(matches)[0] ?? null
}

/**
 * Reusing a session after an approval: the reviewer decides again, so the overall decision goes back
 * to undecided. File verdicts, comments and resolutions stay; `effectiveVerdict` drops the verdicts of
 * files whose content changed since.
 */
export async function resetApprovedDecision(dir: string, now: string): Promise<void> {
  const review = await readReview(dir)
  if (review === null || review.sent?.decision !== 'approve' || review.overall.decision === 'undecided') return
  await writeReview(dir, { ...review, overall: { decision: 'undecided' }, updatedAt: now })
}

/** The `run-file` owners of a test-run session's index; empty for a code review or when the index is missing or invalid. */
async function runFileOwnersOf(manifest: Manifest): Promise<Map<string, string>> {
  if (!isTestRun(manifest)) return new Map()
  const parsed = TestRunIndexSchema.safeParse(await readJson(path.join(manifest.run.path, TEST_RUN_INDEX_FILE)))
  return parsed.success ? runFileOwners(parsed.data) : new Map()
}

/** A rerun: approved items (files, scenarios) with one of the picked comments lose their verdict (see `unapproveCommented`). */
export async function unapproveAfterRerun(dir: string, manifest: Manifest, pick: (review: Review) => readonly Comment[], now: string): Promise<void> {
  const review = await readReview(dir)
  if (review === null) return
  const next = unapproveCommented(review, pick(review), now, await runFileOwnersOf(manifest))
  if (next !== review) await writeReview(dir, next)
}

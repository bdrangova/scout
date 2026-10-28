import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ResolutionsSchema, SCHEMA_VERSION, isTestRun, mergeComments } from '@scout/shared'
import type { Resolutions } from '@scout/shared'
import { writeFileAtomic } from '../store/fs.ts'
import { storePaths } from '../store/paths.ts'
import { RESOLUTIONS_FILE, readResolutions, readReview } from '../store/review.ts'
import type { AdapterEvent, AgentAdapter, AgentSession, AgentExit, AgentRunHandle, ApplyFeedbackRequest, CanResumeResult } from './adapter.ts'
import { AsyncQueue, sleep } from './async-queue.ts'
import { parseStreamJsonLine } from './stream-json.ts'

export const DEFAULT_SAMPLE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/agent-run.sample.jsonl',
)
export const FAKE_RESOLUTION_NOTE = 'Applied by the fake adapter'

export interface FakeAdapterOptions {
  samplePath?: string
  /** Delay before each replayed line (default 150 ms). */
  delayMs?: number
  now?: () => string
}

/**
 * Replays a recorded stream-json transcript and, at the end, resolves every sent comment that
 * is still open, so the whole Submit → run → resolved flow can be demoed without the CLI.
 */
export class FakeAdapter implements AgentAdapter {
  readonly kind = 'fake' as const
  private readonly samplePath: string
  private readonly delayMs: number
  private readonly now: () => string

  constructor(options: FakeAdapterOptions = {}) {
    this.samplePath = options.samplePath ?? DEFAULT_SAMPLE_PATH
    this.delayMs = options.delayMs ?? 150
    this.now = options.now ?? (() => new Date().toISOString())
  }

  async canResume(_session: AgentSession, _opts: { fork: boolean }): Promise<CanResumeResult> {
    return { ok: true }
  }

  applyFeedback(req: ApplyFeedbackRequest): AgentRunHandle {
    const queue = new AsyncQueue<AdapterEvent>()
    const exit = this.replay(req, queue)
      .catch((err: unknown): AgentExit => {
        queue.push({ type: 'error', message: err instanceof Error ? err.message : String(err) })
        return { code: 1, signal: null }
      })
      .finally(() => queue.end())
    return {
      argv: ['fake-agent', '--sample', this.samplePath],
      pid: null,
      exit,
      [Symbol.asyncIterator]: () => queue[Symbol.asyncIterator](),
    }
  }

  private async replay(req: ApplyFeedbackRequest, queue: AsyncQueue<AdapterEvent>): Promise<AgentExit> {
    const lines = (await fs.readFile(this.samplePath, 'utf8')).split('\n').filter((line) => line.trim() !== '')
    for (const line of lines) {
      await sleep(this.delayMs, req.signal)
      if (req.signal.aborted) return { code: null, signal: 'SIGINT' }
      for (const event of parseStreamJsonLine(line)) queue.push({ ...event, raw: line })
    }
    const { manifest } = req.session
    const applied = await this.resolveSentComments(manifest.id, req.home)
    // A test run's checkout is not a fixture repo and nothing is written into it: the resolutions are the whole effect.
    if (applied.length > 0 && !isTestRun(manifest)) await markFixtureRepo(manifest.repo.path, req.home, applied)
    return { code: 0, signal: null }
  }

  /** Marks every comment with `sentAt` that is still open as resolved, merging into an existing file; returns their ids. */
  private async resolveSentComments(sessionId: string, home: string): Promise<string[]> {
    const dir = storePaths({ home }).sessionDir(sessionId)
    const review = await readReview(dir, sessionId)
    if (review === null) return []
    const existing = await readResolutions(dir, sessionId)
    const now = this.now()
    const resolutions: Resolutions = existing ?? { schemaVersion: SCHEMA_VERSION, sessionId, updatedAt: now, comments: {} }
    const comments = { ...resolutions.comments }
    const applied: string[] = []
    for (const comment of mergeComments(review, resolutions)) {
      if (comment.sentAt === null || comment.status !== 'open') continue
      comments[comment.id] = { status: 'resolved', note: FAKE_RESOLUTION_NOTE, at: now, files: [] }
      applied.push(comment.id)
    }
    if (applied.length === 0) return []
    const next = ResolutionsSchema.parse({ ...resolutions, updatedAt: now, comments })
    await writeFileAtomic(path.join(dir, RESOLUTIONS_FILE), `${JSON.stringify(next, null, 2)}\n`)
    return applied
  }
}

/** True when `candidate` resolves to a path strictly inside `root` (both realpath'd). */
export async function isInside(root: string, candidate: string): Promise<boolean> {
  const [rootReal, candidateReal] = await Promise.all([fs.realpath(root).catch(() => null), fs.realpath(candidate).catch(() => null)])
  if (rootReal === null || candidateReal === null) return false
  return candidateReal.startsWith(rootReal + path.sep)
}

/**
 * Appends a marker line to the repo's `README.md` so the fixture shows a live "updated" card after
 * a run. Only for repos inside `AI_REVIEW_HOME` (the fixture's own temp repos): the server never
 * writes into a real repo.
 */
export async function markFixtureRepo(repo: string, home: string, applied: readonly string[]): Promise<boolean> {
  if (!(await isInside(home, repo))) return false
  await fs.appendFile(path.join(repo, 'README.md'), `<!-- ai-review fake adapter: applied ${applied.join(', ')} -->\n`, 'utf8')
  return true
}

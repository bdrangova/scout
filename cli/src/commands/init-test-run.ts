// `scout init --kind test-run`: a feature-test session. The run folder lives inside the session folder (`<session>/run`):
// the agent writes scenarios, evidence and logs there, and `scout run-file add` copies the test plan and the bugs in.
// The dashboard reads that folder live (through `run/test-run.json`); the session also holds the manifest and the review state.
import { mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { commentsSince, isTestRun, runFolderOf, SCHEMA_VERSION, SESSION_ID_RE, TEST_RUN_INDEX_FILE, type TestRunManifest } from '@scout/shared'
import { topLevel } from '@scout/shared/git/repo'
import { dashboardUrl, readConfig } from '../config.ts'
import { resetApprovedDecision, unapproveAfterRerun } from '../sessions.ts'
import { manifestExists, newSessionId, readManifest, sessionDir, writeJsonAtomic, writeManifest } from '../store.ts'
import { indexSkeleton } from './run-index-merge.ts'

export interface InitTestRunOptions {
  home: string
  /** A path inside the checkout the run belongs to (a git repository; a linked worktree is fine). */
  repo: string
  /** Required for a new session; a reused session keeps its title unless one is given. */
  title?: string | null
  tickets?: TestRunManifest['tickets']
  feature?: string | null
  area?: string | null
  agentSession?: string | null
  /** Reuse this live test-run session instead of creating a new one. */
  session?: string | null
  now?: Date
}

export interface InitTestRunResult {
  id: string
  dir: string
  url: string
  /** Absolute run folder: `<dir>/run`. */
  runPath: string
  manifest: TestRunManifest
  /** True when `--session` named an existing session whose manifest was refreshed. */
  reused: boolean
}

/** The manifest of a live test-run session; throws for an unknown, archived or code-review session. */
export async function liveTestRun(home: string, id: string): Promise<TestRunManifest> {
  if (!SESSION_ID_RE.test(id)) throw new Error(`"${id}" is not a session id`)
  const dir = sessionDir(home, id)
  if (!(await manifestExists(dir))) throw new Error(`session ${id} is not a live session under ${home} (archived sessions cannot be reused)`)
  const manifest = await readManifest(dir)
  if (!isTestRun(manifest)) throw new Error(`session ${id} is a code review, not a test run`)
  return manifest
}

export async function initTestRunSession(options: InitTestRunOptions): Promise<InitTestRunResult> {
  const now = (options.now ?? new Date()).toISOString()
  const repo = (await realpath(await topLevel(path.resolve(options.repo)))).split(path.sep).join('/')
  const previous = options.session === undefined || options.session === null ? null : await liveTestRun(options.home, options.session)
  const title = options.title ?? previous?.title
  if (title === undefined || title === '') throw new Error('--title <text> is required when creating a test-run session')
  const id = previous?.id ?? newSessionId(title, new Date(now))
  const dir = sessionDir(options.home, id)
  const runPath = runFolderOf(dir)
  await mkdir(path.join(dir, 'review'), { recursive: true })
  await mkdir(runPath, { recursive: true })

  const feature = options.feature ?? previous?.run.feature ?? null
  const area = options.area ?? previous?.run.area ?? null
  if (previous === null) await writeJsonAtomic(path.join(runPath, TEST_RUN_INDEX_FILE), indexSkeleton({ runId: id, title, feature, area }, now))

  const manifest: TestRunManifest = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'test-run',
    id,
    title,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    agent: {
      type: 'claude-code',
      sessionId: options.agentSession ?? previous?.agent.sessionId ?? null,
      cliVersion: previous?.agent.cliVersion ?? null,
      entrypoint: previous?.agent.entrypoint ?? 'cli',
    },
    run: { repo, feature, area, ...(previous?.run.sources === undefined ? {} : { sources: previous.run.sources }) },
    tickets: options.tickets !== undefined && options.tickets.length > 0 ? options.tickets : (previous?.tickets ?? []),
  }
  const written = await writeManifest(dir, manifest)
  if (previous !== null) {
    await resetApprovedDecision(dir, now)
    // Published again: an approved item commented on since the previous publish needs another look.
    await unapproveAfterRerun(dir, previous, (review) => commentsSince(review, previous.updatedAt), now)
  }
  const url = dashboardUrl(await readConfig(options.home), id, 'test-run')
  return { id, dir, url, runPath, manifest: written, reused: previous !== null }
}

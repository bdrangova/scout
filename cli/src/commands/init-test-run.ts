// `ai-review init --kind test-run`: the session of a feature-test run folder. The run folder is read live by the dashboard
// (through `<run>/test-run.json`); the session only holds the manifest and the review state.
import { mkdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { SCHEMA_VERSION, type TestRunManifest } from '@review-dash/shared'
import { topLevel } from '@review-dash/shared/git/repo'
import { dashboardUrl, readConfig } from '../config.ts'
import { openSessionForRun, resetApprovedDecision } from '../sessions.ts'
import { newSessionId, sessionDir, writeManifest } from '../store.ts'

export interface InitTestRunOptions {
  home: string
  /** The run folder; resolved to an absolute path and required to exist inside the repo top level. */
  run: string
  /** A path inside the checkout the run belongs to; default: the run folder itself. */
  repo?: string | null
  title?: string | null
  tickets?: TestRunManifest['tickets']
  feature?: string | null
  area?: string | null
  agentSession?: string | null
  /** Always create a new session instead of reusing the latest one for this run folder. */
  fresh?: boolean
  now?: Date
}

export interface InitTestRunResult {
  id: string
  dir: string
  url: string
  manifest: TestRunManifest
  /** True when the latest session for this run folder was reused and its manifest refreshed. */
  reused: boolean
}

/** `<feature>/<area>/test-runs/<run>` → `{ feature, area }` (the two folder names above `test-runs/`); nulls when the path has no such shape. */
export function deriveFeatureArea(runPath: string): { feature: string | null; area: string | null } {
  const segments = runPath.split(/[\\/]/).filter((segment) => segment !== '')
  const at = segments.lastIndexOf('test-runs')
  if (at < 2) return { feature: null, area: null }
  return { feature: segments[at - 2] ?? null, area: segments[at - 1] ?? null }
}

async function resolveRunPath(run: string, repoTop: string): Promise<string> {
  const absolute = path.resolve(run)
  let real: string
  try {
    real = await realpath(absolute)
  } catch {
    throw new Error(`run folder ${absolute} does not exist`)
  }
  if (!(await stat(real)).isDirectory()) throw new Error(`run path ${absolute} is not a folder`)
  const relative = path.relative(repoTop, real)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`run folder ${real} is not inside the repository ${repoTop}: pass --repo <checkout that contains the run folder>`)
  }
  return real.split(path.sep).join('/')
}

export async function initTestRunSession(options: InitTestRunOptions): Promise<InitTestRunResult> {
  const now = (options.now ?? new Date()).toISOString()
  const repoTop = await realpath(await topLevel(path.resolve(options.repo ?? options.run)))
  const runPath = await resolveRunPath(options.run, repoTop)
  const open = options.fresh ? null : await openSessionForRun(options.home, runPath)
  const previous = open?.manifest ?? null
  const derived = deriveFeatureArea(runPath)
  const title = options.title ?? previous?.title ?? path.posix.basename(runPath)
  const id = previous?.id ?? newSessionId(title, new Date(now))
  const dir = sessionDir(options.home, id)
  await mkdir(path.join(dir, 'review'), { recursive: true })

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
    run: {
      path: runPath,
      repo: repoTop.split(path.sep).join('/'),
      feature: options.feature ?? previous?.run.feature ?? derived.feature,
      area: options.area ?? previous?.run.area ?? derived.area,
    },
    tickets: options.tickets !== undefined && options.tickets.length > 0 ? options.tickets : (previous?.tickets ?? []),
  }
  const written = await writeManifest(dir, manifest)
  if (open !== null) await resetApprovedDecision(open.dir, now)
  const url = dashboardUrl(await readConfig(options.home), id, 'test-run')
  return { id, dir, url, manifest: written, reused: previous !== null }
}

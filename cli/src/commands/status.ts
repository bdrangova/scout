// `ai-review status [id] --repo <path>`: the review session of this branch from the store files only
// (manifest, review.json, resolutions.json); the tree itself is computed by the dashboard, not here.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { isTestRun, ScenarioStatusSchema, TestRunIndexSchema, TEST_RUN_INDEX_FILE, type Decision, type ScenarioStatus } from '@scout/shared'
import { currentBranch, topLevel } from '@scout/shared/git/repo'
import { dashboardUrl, readConfig, type Config } from '../config.ts'
import { countOpenComments, openSessionForBranch, readReview } from '../sessions.ts'
import { manifestExists, readManifest, resolveHome, sessionDir } from '../store.ts'

export interface CodeReviewStatusSession {
  kind?: undefined
  id: string
  title: string
  dir: string
  branch: string | null
  baseRef: string
  openComments: number
  sent: { at: string; decision: Decision } | null
  url: string
}

export type ScenarioCounts = Record<ScenarioStatus, number>

export interface TestRunStatusSession {
  kind: 'test-run'
  id: string
  title: string
  dir: string
  run: { path: string; feature: string | null; area: string | null }
  /** Scenario counts by status from `<run>/test-run.json`; null when the index is missing or invalid. */
  scenarios: ScenarioCounts | null
  /** Verdicts the reviewer gave so far (from review.json). */
  verdicts: { approved: number; rejected: number }
  openComments: number
  sent: { at: string; decision: Decision } | null
  url: string
}

export type StatusSession = CodeReviewStatusSession | TestRunStatusSession

export interface StatusResult {
  repo: string
  branch: string | null
  session: StatusSession | null
}

async function readScenarioCounts(runPath: string): Promise<ScenarioCounts | null> {
  try {
    const parsed = TestRunIndexSchema.safeParse(JSON.parse(await readFile(path.join(runPath, TEST_RUN_INDEX_FILE), 'utf8')))
    if (!parsed.success) return null
    const counts = Object.fromEntries(ScenarioStatusSchema.options.map((status) => [status, 0])) as ScenarioCounts
    for (const scenario of parsed.data.scenarios) counts[scenario.status] += 1
    return counts
  } catch {
    return null
  }
}

async function describe(dir: string, config: Config): Promise<StatusSession> {
  const manifest = await readManifest(dir)
  const review = await readReview(dir)
  const openComments = await countOpenComments(dir, review)
  if (isTestRun(manifest)) {
    const verdicts = Object.values(review?.files ?? {})
    return {
      kind: 'test-run',
      id: manifest.id,
      title: manifest.title,
      dir,
      run: { path: manifest.run.path, feature: manifest.run.feature, area: manifest.run.area },
      scenarios: await readScenarioCounts(manifest.run.path),
      verdicts: {
        approved: verdicts.filter((file) => file.verdict === 'approved').length,
        rejected: verdicts.filter((file) => file.verdict === 'rejected').length,
      },
      openComments,
      sent: review?.sent ?? null,
      url: dashboardUrl(config, manifest.id, 'test-run'),
    }
  }
  return {
    id: manifest.id,
    title: manifest.title,
    dir,
    branch: manifest.repo.branch,
    baseRef: manifest.repo.baseRef,
    openComments,
    sent: review?.sent ?? null,
    url: dashboardUrl(config, manifest.id),
  }
}

export async function sessionStatus(options: { home: string; repo: string; id?: string | null }): Promise<StatusResult> {
  const repo = await topLevel(options.repo)
  const branch = await currentBranch(repo)
  const config = await readConfig(options.home)
  let session: StatusSession | null = null
  if (options.id) {
    const dir = sessionDir(options.home, options.id)
    if (!(await manifestExists(dir))) throw new Error(`session ${options.id} not found under ${options.home} (no manifest.json)`)
    session = await describe(dir, config)
  } else {
    const open = await openSessionForBranch(options.home, repo, branch)
    if (open !== null) session = await describe(open.dir, config)
  }
  return { repo, branch, session }
}

function formatTestRunBrief(s: TestRunStatusSession): string {
  const sent = s.sent === null ? 'not sent yet' : `sent ${s.sent.at} (${s.sent.decision})`
  let scenarios = 'scenarios: no valid test-run.json'
  if (s.scenarios !== null) {
    const total = Object.values(s.scenarios).reduce((sum, n) => sum + n, 0)
    const parts = ScenarioStatusSchema.options.filter((status) => s.scenarios?.[status]).map((status) => `${s.scenarios?.[status]} ${status}`)
    scenarios = `scenarios: ${total}${parts.length === 0 ? '' : ` (${parts.join(', ')})`}`
  }
  const where = [s.run.feature, s.run.area].filter((part) => part !== null).join('/')
  return `test run ${s.id} "${s.title}"${where === '' ? '' : ` · ${where}`} · run ${s.run.path} · ${scenarios} · verdicts: ${s.verdicts.approved} approved, ${s.verdicts.rejected} rejected · open comments: ${s.openComments} · ${sent} · ${s.url}`
}

export function formatStatusBrief(status: StatusResult): string {
  if (status.session === null) return `no open review session for ${status.branch ?? 'detached HEAD'} in ${status.repo}`
  const s = status.session
  if (s.kind === 'test-run') return formatTestRunBrief(s)
  const sent = s.sent === null ? 'not sent yet' : `sent ${s.sent.at} (${s.sent.decision})`
  return `session ${s.id} "${s.title}" · branch ${s.branch ?? 'detached'} · base ${s.baseRef} · open comments: ${s.openComments} · ${sent} · ${s.url}`
}

interface StatusFlags {
  repo?: string
  format: string
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .argument('[id]', 'session id (default: the open session for this branch)')
    .description('Show a session (current branch or by id): open comments, last send, URL')
    .option('--repo <path>', 'path inside the repository (default: cwd)')
    .option('--format <format>', 'brief | json', 'brief')
    .action(async (id: string | undefined, flags: StatusFlags) => {
      const status = await sessionStatus({ home: resolveHome(), repo: path.resolve(flags.repo ?? process.cwd()), id: id ?? null })
      if (flags.format === 'json') console.log(JSON.stringify(status))
      else console.log(formatStatusBrief(status))
    })
}

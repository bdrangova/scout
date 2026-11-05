// The Worktrees page: `store/worktrees/` holds linked worktrees of `clean-app` (a git repo with a local origin) and
// `store/config.json` points Scout's worktree folders at it. Three worktrees: one clean and ahead of the base, one
// with uncommitted changes, one with a code review, a PR review and a test run linked to it (so deleting it is refused).
import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { CONFIG_FILE, SCHEMA_VERSION, type GithubSettings, type TestRunManifest } from '@scout/shared'
import { computeWorkingTree } from '@scout/shared/git/working-tree'
import { publishReport } from '@scout/shared/pr-review/report'
import { makePrReport } from '@scout/shared/testing/pr-review'
import { writeJsonAtomic } from '../../cli/src/store.ts'
import { BASE_REF, fixturesDir, git, makeManifest, storeDir, writeFiles, writeSessionFolder } from './common.ts'
import { WORKTREE_CODE_REVIEW_SESSION_ID, WORKTREE_PR_REVIEW_SESSION_ID, WORKTREE_TEST_RUN_SESSION_ID } from './ids.ts'

export const worktreesDir = path.join(storeDir, 'worktrees')

export interface WorktreeReport {
  path: string
  branch: string
  covers: string
}

async function addWorktree(main: string, name: string, branch: string): Promise<string> {
  const dir = path.join(worktreesDir, name)
  await git(main, ['worktree', 'add', '-q', '-b', branch, dir, BASE_REF])
  return dir
}

async function commit(dir: string, files: Record<string, string>, message: string): Promise<void> {
  await writeFiles(dir, files)
  await git(dir, ['add', '-A'])
  await git(dir, ['commit', '-q', '-m', message])
}

/** The PR reviews' Assigned PRs tab follows the real qbdvision repo (through the local `gh` login) and the Dream Team and Core UI. */
const FIXTURE_GITHUB: GithubSettings = {
  repos: ['QbDVision-Inc/qbdvision'],
  teams: [
    { id: 'dream-team', name: 'Dream Team', githubTeams: ['QbDVision-Inc/dream-team'], members: ['dnp1204', 'geveit', 'karimmady', 'bdrangova', 'NooreldeenAbd'] },
    { id: 'core-ui', name: 'Core UI', githubTeams: ['QbDVision-Inc/core-ui'], members: [] },
  ],
}

/** Creates the worktrees of `main` (the `clean-app` checkout), the two linked sessions and `config.json`. */
export async function writeWorktrees(main: string, origin: string): Promise<WorktreeReport[]> {
  await mkdir(worktreesDir, { recursive: true })
  // A plain folder next to the worktrees: scanning ignores it (no `.git` file).
  await mkdir(path.join(worktreesDir, 'notes'), { recursive: true })

  const exportFilters = await addWorktree(main, 'qi-15500-export-filters', 'qi-15500-export-filters')
  await commit(exportFilters, { 'src/export/filters.ts': 'export const filters = ["status", "owner"] as const\n' }, 'Add export filters')
  await commit(exportFilters, { 'src/export/filters.test.ts': 'import { filters } from "./filters"\nconsole.assert(filters.length === 2)\n' }, 'Test export filters')

  const bulkArchive = await addWorktree(main, 'qi-15512-bulk-archive', 'qi-15512-bulk-archive')
  await commit(bulkArchive, { 'src/archive/bulk.ts': 'export function archiveAll(ids: string[]): number {\n  return ids.length\n}\n' }, 'Add bulk archive')
  await writeFiles(bulkArchive, { 'src/archive/bulk.ts': 'export function archiveAll(ids: string[]): number {\n  return new Set(ids).size\n}\n', 'src/archive/notes.md': 'TODO: confirm dialog\n' })

  const polish = await addWorktree(main, 'qi-15531-trial-bar-polish', 'qi-15531-trial-bar-polish')
  await commit(polish, { 'src/components/TrialBar.tsx': 'export function TrialBar(): string {\n  return "Trial ends soon"\n}\n' }, 'Polish the trial bar')
  await cp(path.join(fixturesDir, 'test-runs', 'demo', 'plans'), path.join(polish, 'plans'), { recursive: true })
  await git(polish, ['add', '-A'])
  await git(polish, ['commit', '-q', '-m', 'Add the trial bar test plan'])

  const review = makeManifest({
    id: WORKTREE_CODE_REVIEW_SESSION_ID,
    title: 'QI-15531: Trial bar polish',
    repo: polish,
    origin,
    branch: 'qi-15531-trial-bar-polish',
    createdAt: '2026-10-26T09:00:00.000Z',
    tickets: [{ key: 'QI-15531', url: null }],
  })
  await writeSessionFolder(review, {})

  const run: TestRunManifest = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'test-run',
    id: WORKTREE_TEST_RUN_SESSION_ID,
    title: 'QI-15531: Trial bar polish, test run',
    createdAt: '2026-10-26T09:30:00.000Z',
    updatedAt: '2026-10-26T09:30:00.000Z',
    agent: { type: 'claude-code', sessionId: null, cliVersion: null, entrypoint: null },
    tickets: [{ key: 'QI-15531', url: null }],
    run: { path: path.join(polish, 'plans', 'f', 'a', 'test-runs', 'run-1'), repo: polish, feature: 'f', area: 'a' },
  }
  await writeSessionFolder(run, {})

  const prReview = { ...makeManifest({
    id: WORKTREE_PR_REVIEW_SESSION_ID,
    title: 'QI-15531: Trial bar polish, PR review',
    repo: polish,
    origin,
    branch: 'qi-15531-trial-bar-polish',
    createdAt: '2026-10-26T10:00:00.000Z',
    tickets: [{ key: 'QI-15531', url: null }],
  }), kind: 'pr-review' as const }
  const prDir = await writeSessionFolder(prReview, {
    spec: {
      files: [{ file: 'jira-QI-15531.md', text: '# QI-15531: Trial bar polish\n\n- **Type:** Story · **Status:** In Review · **Assignee:** Mira Chen\n\nShow trial users how long they have left, and let them upgrade from the bar.\n\n## Acceptance criteria\n\n- The bar shows the date the trial ends.\n- An expired trial cannot be dismissed.\n' }],
      index: { items: [{ file: 'jira-QI-15531.md', type: 'jira', title: 'QI-15531: Trial bar polish', url: 'https://example.atlassian.net/browse/QI-15531' }] },
    },
  })
  const { tree, patches } = await computeWorkingTree({ repo: polish, baseRef: BASE_REF })
  const report = makePrReport(tree)
  report.id = 'trial-bar-polish-review'
  report.findings[0]!.path = 'src/components/TrialBar.tsx'
  report.findings[0]!.title = 'The trial bar hides its end date'
  report.findings[0]!.body = 'Show the date the trial ends next to "Trial ends soon".'
  report.overview = {
    summary: [
      'Trial users now see a bar at the top of every page saying their trial ends soon, with an Upgrade button.',
      'Once the trial has expired the bar turns red and cannot be dismissed.',
      'The upgrade request now waits for the payment to confirm before showing the plan as active.',
      'One finding: the bar never says when the trial ends, so "soon" can mean today or next month.',
    ],
    tags: ['feature', 'frontend', 'backend'],
    title: 'Trial bar polish',
    description: '## What\n\nPolishes the trial bar from QI-15531.\n\n- Adds the expired state\n- Waits for the payment before switching plans\n\n## Testing\n\nChecked by hand on a trial account.',
    author: 'mira-chen',
    headRef: 'qi-15531-trial-bar-polish',
    baseRef: 'master',
    labels: ['trial', 'ui'],
    draft: false,
    openedAt: '2026-10-25T14:20:00.000Z',
    commits: 2,
    tickets: [{ key: 'QI-15531', title: 'Trial bar polish', url: 'https://example.atlassian.net/browse/QI-15531' }],
  }
  await publishReport(prDir, report, prDir, tree, patches)

  await writeJsonAtomic(path.join(storeDir, CONFIG_FILE), { worktreeFolders: [worktreesDir], github: FIXTURE_GITHUB })
  return [
    { path: exportFilters, branch: 'qi-15500-export-filters', covers: 'clean, 2 commits ahead' },
    { path: bulkArchive, branch: 'qi-15512-bulk-archive', covers: '1 commit ahead, a modified file and an untracked file (delete refused: dirty)' },
    { path: polish, branch: 'qi-15531-trial-bar-polish', covers: `clean, 2 commits ahead, linked to ${WORKTREE_CODE_REVIEW_SESSION_ID}, ${WORKTREE_PR_REVIEW_SESSION_ID} and ${WORKTREE_TEST_RUN_SESSION_ID} (delete refused: sessions)` },
  ]
}

import {
  emptyReview,
  mergeComments,
  type Comment,
  type CodeReviewDetail,
  type CommitList,
  type CommentTarget,
  type Commit,
  type Resolutions,
  type Review,
  type ReviewResponse,
  type SessionListItem,
  type SessionSummary,
  type TestRunDetail,
  type TestRunIndex,
  type TestRunSummary,
  type TreeFile,
  type WorkingTree,
} from '@review-dash/shared'
import {
  BASE_SHA,
  SESSION_ID as SHARED_SESSION_ID,
  fp,
  makeEvidence,
  makeExtra,
  makeManifest,
  makeSpec,
  makeTestRunManifest,
  makeTree,
  makeTreeFile,
} from '@review-dash/shared/testing/fixtures'

export { fp, makeTreeFile }

export const SESSION_ID = SHARED_SESSION_ID

/** A six-file working tree: added, modified, deleted, renamed, binary and a collapsed lockfile. */
export const filesFixture: TreeFile[] = [
  makeTreeFile({ path: 'src/main/client/trial/TrialBar.tsx', status: 'added', additions: 120, deletions: 0, sizeBefore: null, sizeAfter: 4200 }),
  makeTreeFile({ path: 'src/main/client/hooks/useTrial.ts', status: 'modified', additions: 33, deletions: 4, sizeBefore: 1500, sizeAfter: 1800 }),
  makeTreeFile({ path: 'src/main/client/trial/legacyTrialBanner.tsx', status: 'deleted', additions: 0, deletions: 41, sizeBefore: 1300, sizeAfter: null }),
  makeTreeFile({
    path: 'src/main/client/trial/TrialBar.module.scss',
    oldPath: 'src/main/client/trial/trial-bar.scss',
    status: 'renamed',
    additions: 3,
    deletions: 1,
    sizeBefore: 880,
    sizeAfter: 900,
  }),
  makeTreeFile({ path: 'src/main/client/assets/trial.png', status: 'added', additions: 0, deletions: 0, binary: true, sizeBefore: null, sizeAfter: 20480 }),
  makeTreeFile({
    path: 'package-lock.json',
    status: 'modified',
    additions: 2400,
    deletions: 1800,
    collapsed: true,
    collapseReason: 'generated-or-vendored',
    sizeBefore: 880_000,
    sizeAfter: 900_000,
  }),
]

export const treeFixture: WorkingTree = makeTree({ files: filesFixture, branch: 'bojana-QI-15472-trial-bar', computedAt: '2026-09-26T16:53:00.000Z' })

export const manifestFixture = makeManifest({
  title: 'Trial countdown bar',
  createdAt: '2026-09-26T16:53:00.000Z',
  updatedAt: '2026-09-26T16:53:00.000Z',
  agent: { type: 'claude-code', sessionId: 'sess-1', cliVersion: '2.1.0', entrypoint: 'desktop' },
  repo: {
    path: '/Users/bojana/Projects/qbdvision',
    remote: 'git@github.com:qbdvision/qbdvision.git',
    branch: 'bojana-QI-15472-trial-bar',
    baseRef: 'origin/master',
  },
  tickets: [{ key: 'QI-15472', url: 'https://example.atlassian.net/browse/QI-15472' }],
})

export const sessionDetailFixture: CodeReviewDetail = {
  manifest: manifestFixture,
  tree: treeFixture,
  evidence: [
    makeEvidence({ path: 'trial-bar.png', type: 'image', caption: 'Trial bar on the dashboard', order: 0 }),
    makeEvidence({ path: 'dismiss.webm', type: 'video', caption: 'Dismissing the bar', description: 'Click the close button and reload.', order: 1 }),
  ],
  extras: [makeExtra({ path: 'architecture.md', type: 'markdown', title: 'Architecture' })],
  spec: [makeSpec({ path: 'jira.md', type: 'jira', title: 'QI-15472', url: 'https://example.atlassian.net/browse/QI-15472', capturedAt: '2026-09-26T16:50:00.000Z' })],
  prDescription: '# Trial countdown bar\n\nAdds a trial bar.',
  status: 'unreviewed',
  progress: { reviewed: 0, total: filesFixture.length },
  activeRunId: null,
}

/** The same detail with `path` recomputed on disk (a new fingerprint) and the tree fingerprint moved along. */
export function withChangedFile(detail: CodeReviewDetail, path: string, label = 'v2'): CodeReviewDetail {
  const files = detail.tree.files.map((file) => (file.path === path ? { ...file, fingerprint: fp(`${path}:${label}`) } : file))
  const fingerprint = fp(files.map((file) => file.fingerprint).join('|'))
  return { ...detail, tree: { ...detail.tree, files, fingerprint, computedAt: '2026-09-27T10:00:00.000Z' } }
}

export function sessionSummary(overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id' | 'title'>): SessionSummary {
  return {
    updatedAt: '2026-09-26T16:53:00.000Z',
    tickets: [],
    repo: { path: '/Users/bojana/Projects/qbdvision', branch: null, sessionBranch: null, baseRef: 'origin/main' },
    stats: { files: 1, additions: 0, deletions: 0 },
    status: 'unreviewed',
    progress: { reviewed: 0, total: 1 },
    openComments: 0,
    activeRunId: null,
    ...overrides,
  }
}

export const sessionListFixture: SessionListItem[] = [
  sessionSummary({
    id: SESSION_ID,
    title: 'Trial countdown bar',
    tickets: [{ key: 'QI-15472', url: 'https://example.atlassian.net/browse/QI-15472' }],
    repo: { path: '/Users/bojana/Projects/qbdvision', branch: 'bojana-QI-15472-trial-bar', sessionBranch: 'bojana-QI-15472-trial-bar', baseRef: 'origin/main' },
    stats: { files: 8, additions: 272, deletions: 51 },
    status: 'unreviewed',
    progress: { reviewed: 0, total: 8 },
  }),
  sessionSummary({
    id: '20260925-1410-bulk-export-b2c3',
    title: 'Bulk export of batch records',
    tickets: [{ key: 'QI-15410', url: null }],
    repo: { path: '/Users/bojana/Projects/qbdvision2', branch: 'bojana-QI-15410-bulk-export', sessionBranch: 'bojana-QI-15410-bulk-export', baseRef: 'origin/main' },
    stats: { files: 27, additions: 1204, deletions: 388 },
    status: 'updated',
    progress: { reviewed: 27, total: 27 },
    openComments: 2,
    updatedAt: '2026-09-25T10:10:00.000Z',
  }),
  sessionSummary({
    id: '20260924-0900-perm-cache-c3d4',
    title: 'Fix stale permissions cache',
    tickets: [{ key: 'QI-15398', url: null }],
    repo: { path: '/Users/bojana/Projects/qbdvision3', branch: 'bojana-QI-15398-perm-cache', sessionBranch: 'bojana-QI-15398-perm-cache', baseRef: 'origin/main' },
    stats: { files: 4, additions: 64, deletions: 19 },
    status: 'in-progress',
    progress: { reviewed: 2, total: 4 },
    updatedAt: '2026-09-24T09:00:00.000Z',
  }),
  sessionSummary({
    id: '20260919-1600-grid-migration-d4e5',
    title: 'Migrate Kendo grid to DataTable',
    tickets: [{ key: 'QI-15302', url: null }],
    repo: { path: '/Users/bojana/Projects/qbdvision4', branch: 'bojana-QI-15302-grid-migration', sessionBranch: 'bojana-QI-15302-grid-migration', baseRef: 'origin/main' },
    stats: { files: 41, additions: 2918, deletions: 2450 },
    status: 'agent-working',
    progress: { reviewed: 41, total: 41 },
    activeRunId: 'run-20260926180000-ab12',
    lastSend: { at: '2026-09-19T15:00:00.000Z', decision: 'request-changes' },
    updatedAt: '2026-09-19T16:00:00.000Z',
  }),
  sessionSummary({
    id: '20260923-1100-badge-stories-e5f6',
    title: 'Storybook stories for Badge',
    tickets: [{ key: 'QI-15377', url: null }],
    repo: { path: '/Users/bojana/Projects/qbdvision', branch: 'bojana-QI-15377-badge-stories', sessionBranch: 'bojana-QI-15377-badge-stories', baseRef: 'origin/main' },
    stats: { files: 6, additions: 310, deletions: 0 },
    status: 'approved',
    progress: { reviewed: 6, total: 6 },
    updatedAt: '2026-09-23T11:00:00.000Z',
  }),
  { id: '20260920-0800-broken-manifest-0000', error: 'repository not found: /Users/bojana/Projects/gone is not a git checkout' },
]

const emptyEvidence = { videos: [], screenshots: [], data: [] }

/** The test run of `fixtures/test-runs/demo/.../run-1`: three scenarios (pass, fail with bug x, gap), the gaps and logs pages, one bug and one log. */
export const testRunIndexFixture: TestRunIndex = {
  schemaVersion: 1,
  runId: 'run-1',
  title: 'Demo feature test run',
  feature: 'f',
  area: 'a',
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T11:00:00.000Z',
  publishedBy: { plan: { at: '2026-10-21T09:00:00.000Z' }, run: { at: '2026-10-21T11:00:00.000Z' } },
  roots: { run: '.', plan: '../..', bugs: '../../bugs' },
  pages: ['gaps', 'logs'],
  overview: [{ type: 'markdown', title: 'Summary', markdown: 'One scenario passed, one failed (bug x) and one could not be tested.' }],
  scenarios: [
    {
      id: 's1-pass',
      title: 'Happy path',
      status: 'pass',
      order: 0,
      layers: [{ name: 'e2e', status: 'pass' }],
      steps: [{ label: '1', action: 'Open the feature', expected: 'Page loads', observed: 'Page loads', result: 'pass' }],
      evidence: {
        videos: [{ path: 'run:scenarios/s1-pass/videos/test-1-pass-1.mp4', caption: 'Full run', atSec: 0 }],
        screenshots: [{ path: 'run:scenarios/s1-pass/screenshots/s1-01-a.png', caption: 'Rows listed' }],
        data: [{ path: 'run:scenarios/s1-pass/data/out.json', caption: 'Output' }],
      },
      logs: [{ path: 'run:logs/run.log', from: 1, to: 4, label: 'startup' }],
      links: { gaps: [], bugs: [] },
    },
    {
      id: 's2-fail',
      title: 'Empty result',
      status: 'fail',
      order: 1,
      layers: [{ name: 'e2e', status: 'fail', note: 'error banner' }],
      stepsMarkdown: '1. Filter to a value with no matches.\n2. Expect an empty state.',
      evidence: { ...emptyEvidence, screenshots: [{ path: 'run:scenarios/s2-fail/screenshots/s2-01-a.png', caption: 'Error banner' }] },
      logs: [{ path: 'run:logs/run.log', from: 5, to: 9, label: 'error' }],
      links: { gaps: [], bugs: ['x'] },
      notes: 'See bug x.',
    },
    {
      id: 's3-gap',
      title: 'Export',
      status: 'gap',
      order: 2,
      steps: [{ label: '1', action: 'Export the data', expected: 'A file downloads' }],
      evidence: { ...emptyEvidence, screenshots: [{ path: 'run:scenarios/s3-gap/screenshots/s3-01-a.png', caption: 'Export button' }] },
      logs: [],
      links: { gaps: ['g1'], bugs: [] },
    },
  ],
  gaps: [{ id: 'g1', title: 'Export cannot be exercised here', status: 'open', scenarios: ['s3-gap'], markdown: 'No download target in this environment.' }],
  bugs: [{ slug: 'x', title: 'Empty result shows an error', path: 'bugs:x/x.md', jira: 'DEMO-1', screenshots: ['bugs:x/screenshots/1.png'], scenarios: ['s2-fail'] }],
  logs: [{ path: 'run:logs/run.log', label: 'Run log' }],
}

export const testRunManifestFixture = makeTestRunManifest({
  title: 'Demo feature test run',
  run: { path: '/Users/bojana/Projects/qbdvision/plans/f/a/test-runs/run-1', repo: '/Users/bojana/Projects/qbdvision', feature: 'f', area: 'a' },
  tickets: [{ key: 'QI-15472', url: 'https://example.atlassian.net/browse/QI-15472' }],
})

export const testRunDetailFixture: TestRunDetail = {
  kind: 'test-run',
  manifest: testRunManifestFixture,
  index: testRunIndexFixture,
  warnings: [],
  scenarios: testRunIndexFixture.scenarios.map((scenario) => ({ ...scenario, fingerprint: fp(`scenario:${scenario.id}:v1`) })),
  missing: [],
  computedAt: '2026-10-21T11:00:00.000Z',
}

/** The same test run with a scenario's evidence changed on disk (a new fingerprint). */
export function withChangedScenario(detail: TestRunDetail, id: string, label = 'v2'): TestRunDetail {
  return { ...detail, scenarios: detail.scenarios.map((scenario) => (scenario.id === id ? { ...scenario, fingerprint: fp(`scenario:${id}:${label}`) } : scenario)) }
}

export function testRunSummary(overrides: Partial<TestRunSummary> & Pick<TestRunSummary, 'id' | 'title'>): TestRunSummary {
  return {
    kind: 'test-run',
    createdAt: '2026-10-21T10:00:00.000Z',
    updatedAt: '2026-10-21T11:00:00.000Z',
    run: { path: '/Users/bojana/Projects/qbdvision/plans/f/a/test-runs/run-1', feature: 'f', area: 'a' },
    tickets: [],
    status: 'unreviewed',
    counts: { scenarios: 3, pass: 1, fail: 1, gap: 1, na: 0, blocked: 0, uncertain: 0, planned: 0 },
    reviewed: 0,
    total: 3,
    openComments: 0,
    activeRunId: null,
    ...overrides,
  }
}

export const PATCH_FIXTURE = `diff --git a/src/main/client/hooks/useTrial.ts b/src/main/client/hooks/useTrial.ts
index 1111111..2222222 100644
--- a/src/main/client/hooks/useTrial.ts
+++ b/src/main/client/hooks/useTrial.ts
@@ -1,3 +1,4 @@
 import { useQuery } from "react-query";
-import { fetchTrial } from "../api/trial";
+import { fetchTrial, dismissTrial } from "../api/trial";
+import { useCallback } from "react";
`

export const LOADED_REVIEW_UPDATED_AT = '2026-09-26T17:00:00.000Z'

export function reviewFixture(patch: Partial<Review> = {}): Review {
  return { ...emptyReview(SESSION_ID, LOADED_REVIEW_UPDATED_AT), ...patch }
}

export function commentFixture(id: string, target: CommentTarget, body: string, patch: Partial<Comment> = {}): Comment {
  return {
    id,
    target,
    body,
    timestampSec: null,
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: null,
    sentAt: null,
    resolvedAt: null,
    reopenedAt: null,
    ...patch,
  }
}

/** A `resolutions.json` with the given per-comment entries. */
export function resolutionsFixture(comments: Resolutions['comments'], updatedAt = '2026-09-22T12:00:00.000Z'): Resolutions {
  return { schemaVersion: 2, sessionId: SESSION_ID, updatedAt, comments }
}

export function reviewResponseFixture(review: Review = reviewFixture(), resolutions: Resolutions | null = null): ReviewResponse {
  return { review, resolutions, comments: mergeComments(review, resolutions) }
}

/** A 40-hex sha from a short label (`sha('c1')`), so tests can name commits. */
export function sha(label: string): string {
  return fp(label).repeat(3).slice(0, 40)
}

export function makeCommit(overrides: Partial<Commit> & Pick<Commit, 'sha'>): Commit {
  return {
    shortSha: overrides.sha.slice(0, 10),
    subject: 'Add the trial bar',
    author: 'bojana',
    authoredAt: '2026-09-26T10:00:00.000Z',
    parents: [BASE_SHA],
    merge: false,
    pushed: true,
    stats: { files: 2, additions: 20, deletions: 3 },
    ...overrides,
  }
}

export const COMMIT_SHAS = { first: sha('c1'), merge: sha('c2'), last: sha('c3') }

/** Three commits (the middle one a merge, the last not yet pushed) plus uncommitted changes. */
export function makeCommitList(overrides: Partial<CommitList> = {}): CommitList {
  const commits = overrides.commits ?? [
    makeCommit({ sha: COMMIT_SHAS.first, subject: 'add shell breadcrumb/title helpers, wire up BasePage', authoredAt: '2026-09-25T09:00:00.000Z' }),
    makeCommit({
      sha: COMMIT_SHAS.merge,
      subject: "Merge branch 'master' into trial-bar",
      parents: [COMMIT_SHAS.first, sha('master')],
      merge: true,
      authoredAt: '2026-09-25T15:00:00.000Z',
      stats: { files: 5, additions: 100, deletions: 40 },
    }),
    makeCommit({ sha: COMMIT_SHAS.last, subject: 'Fix the day count', parents: [COMMIT_SHAS.merge], pushed: false, authoredAt: '2026-09-26T10:00:00.000Z' }),
  ]
  return {
    baseRef: 'origin/master',
    baseSha: BASE_SHA,
    headSha: commits.at(-1)?.sha ?? BASE_SHA,
    branch: 'bojana-QI-15472-trial-bar',
    remote: { ref: 'origin/bojana-QI-15472-trial-bar', ahead: 1, behind: 0 },
    commits,
    uncommitted: { files: 2, additions: 7, deletions: 1 },
    fingerprint: fp('commits:v1'),
    ...overrides,
  }
}

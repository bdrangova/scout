// Test-run sessions: each copies a run tree from fixtures/test-runs/<name>/plans into a plain folder under the generated
// repos and points a kind "test-run" manifest at it. The server only needs `run.path` to be inside `run.repo` (both
// realpath'd), not a git repository.
import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { emptyReview, ReviewSchema, SCHEMA_VERSION, type Review, type TestRunManifest } from '@scout/shared'
import { writeJsonAtomic } from '../../cli/src/store.ts'
import { deriveRunDetail } from '../../server/src/store/test-run.ts'
import { fixturesDir, writeSessionFolder } from './common.ts'
import { STATE_MANAGEMENT_RUN_SESSION_ID, TEST_RUN_SESSION_ID, WITHDRAWN_RUN_SESSION_ID } from './ids.ts'

const TEST_RUN_TITLE = 'Change summary diffing: demo run'

interface TestRunSpec {
  id: string
  title: string
  /** Folder under fixtures/test-runs and the plain folder name under repos. */
  source: string
  repoName: string
  /** The run folder relative to the copied `plans` folder. */
  runRel: string
  feature: string
  area: string | null
  ticket: string
  createdAt: string
  covers: string
  /** Builds review.json from the fingerprints of the copied run; absent: no review file beyond the empty one. */
  review?: (fingerprints: ReadonlyMap<string, string>, sessionId: string) => Review
}

const SPECS: readonly TestRunSpec[] = [
  {
    id: TEST_RUN_SESSION_ID,
    title: TEST_RUN_TITLE,
    source: 'demo',
    repoName: 'qa-plans',
    runRel: 'f/a/test-runs/run-1',
    feature: 'f',
    area: 'a',
    ticket: 'QA-31',
    createdAt: '2026-10-21T18:00:00.000Z',
    covers: 'kind test-run: demo run folder (3 scenarios), unreviewed',
  },
  {
    id: STATE_MANAGEMENT_RUN_SESSION_ID,
    title: 'QI-15267 Approve for Archive end to end',
    source: 'state-management',
    repoName: 'qa-state-management',
    runRel: 'state-management/test-runs/qi-15267-approve-archive',
    feature: 'state-management',
    area: 'approve-for-archive',
    ticket: 'QI-15267',
    createdAt: '2026-10-12T17:45:00.000Z',
    covers: 'kind test-run: 6 scenarios (pass/gap/fail/blocked), 3 bugs, 3 gaps, data setup, 4 logs, real JPEGs and clips; s1 approved, an open "incorrect" comment on s8',
    review: (fingerprints, sessionId) => {
      const at = '2026-10-12T18:10:00.000Z'
      const fingerprint = fingerprints.get('s1-uo-approve')
      if (fingerprint === undefined) throw new Error('make-fixture: s1-uo-approve missing from the state-management run')
      return ReviewSchema.parse({
        ...emptyReview(sessionId, at),
        files: { 's1-uo-approve': { verdict: 'approved', fingerprint, viewed: true } },
        comments: [
          {
            id: 'c1',
            target: { kind: 'scenario', ref: 's8-reject-then-approve' },
            kind: 'incorrect',
            body: 'The record page should drop Approve / Reject after the first rejection. Please also state which of the two approval responses the history keeps.',
            timestampSec: null,
            createdAt: at,
            updatedAt: null,
            sentAt: null,
            resolvedAt: null,
            reopenedAt: null,
          },
        ],
        nextCommentId: 2,
        ui: { mode: 'swipe', currentFile: 's8-reject-then-approve', section: 'review' },
      })
    },
  },
  {
    id: WITHDRAWN_RUN_SESSION_ID,
    title: 'QI-16304 Propose Withdrawn and Rejected records',
    source: 'withdrawn-repropose',
    repoName: 'qa-withdrawn-repropose',
    runRel: 'withdrawn-repropose/test-runs/withdrawn-repropose',
    feature: 'withdrawn-repropose',
    area: null,
    ticket: 'QI-16304',
    createdAt: '2026-10-22T15:45:00.000Z',
    covers: 'kind test-run: no plan file or data setup, 9 scenarios (baseline checks and gap demos D1-D5), notes root, one unsupported panel, unreviewed',
  },
]

async function writeSpec(reposDir: string, spec: TestRunSpec): Promise<{ id: string; title: string; covers: string; repo: string; runPath: string }> {
  const repo = path.join(reposDir, spec.repoName)
  await mkdir(repo, { recursive: true })
  await cp(path.join(fixturesDir, 'test-runs', spec.source, 'plans'), path.join(repo, 'plans'), { recursive: true })
  const runPath = path.join(repo, 'plans', spec.runRel)
  const manifest: TestRunManifest = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'test-run',
    id: spec.id,
    title: spec.title,
    createdAt: spec.createdAt,
    updatedAt: spec.createdAt,
    agent: { type: 'claude-code', sessionId: null, cliVersion: null, entrypoint: null },
    tickets: [{ key: spec.ticket, url: null }],
    run: { path: runPath, repo, feature: spec.feature, area: spec.area },
  }
  const dir = await writeSessionFolder(manifest, {})
  if (spec.review !== undefined) {
    const detail = await deriveRunDetail(manifest)
    const fingerprints = new Map(detail.scenarios.map((scenario) => [scenario.id, scenario.fingerprint]))
    await writeJsonAtomic(path.join(dir, 'review', 'review.json'), spec.review(fingerprints, spec.id))
  }
  return { id: spec.id, title: spec.title, covers: spec.covers, repo, runPath }
}

/** Writes the test-run sessions (all, or only the given ids) under `reposDir` and the store. */
export async function writeTestRunSessions(reposDir: string, only?: readonly string[]): Promise<{ id: string; title: string; covers: string; repo: string; runPath: string }[]> {
  const written = []
  for (const spec of SPECS) {
    if (only === undefined || only.includes(spec.id)) written.push(await writeSpec(reposDir, spec))
  }
  return written
}

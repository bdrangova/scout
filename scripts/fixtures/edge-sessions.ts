// Edge cases: empty artifact folders, an archived session, a manifest whose branch the repo left,
// a clean working tree, and overflow (160-char title, six tickets, a very long branch name).
import path from 'node:path'
import { ArchivedMarkerSchema, ReviewSchema, buildSentSnapshot, emptyReview, stampSent, type Review } from '@review-dash/shared'
import { computeWorkingTree } from '@review-dash/shared/git/working-tree'
import { writeJsonAtomic } from '../../cli/src/store.ts'
import { BASE_REF, git, judged, makeComment, makeManifest, writeSessionFolder } from './common.ts'
import { ARCHIVED_SESSION_ID, BRANCH_CHANGED_SESSION_ID, EMPTY_SPEC_EXTRAS_SESSION_ID, LONG_TITLE_SESSION_ID, NO_CHANGES_SESSION_ID } from './ids.ts'
import type { Media } from './media.ts'
import { TRIAL_BRANCH, TRIAL_TICKET_URL, trialArtifacts, trialManifest } from './trial-sessions.ts'

/** Manifest only (plus an empty `review/`): no spec, extras, evidence or PR description. */
export async function writeEmptySession(repo: string, origin: string): Promise<void> {
  const manifest = makeManifest({
    id: EMPTY_SPEC_EXTRAS_SESSION_ID,
    title: 'QI-15490: Hotfix without any notes',
    repo,
    origin,
    branch: TRIAL_BRANCH,
    createdAt: '2026-10-01T09:30:00.000Z',
    tickets: [{ key: 'QI-15490', url: 'https://example.atlassian.net/browse/QI-15490' }],
  })
  await writeSessionFolder(manifest, {})
}

const ARCHIVED_CREATED_AT = '2026-09-20T08:00:00.000Z'
const ARCHIVED_SENT_AT = '2026-09-20T09:30:00.000Z'
const ARCHIVED_AT = '2026-09-21T16:00:00.000Z'

/**
 * `archive/<id>`: a session that was approved and sent, then archived (`archived.json`). It points
 * at the shared trial-app repo; archived sessions are never computed, so the repo state is irrelevant.
 */
export async function writeArchivedSession(repo: string, origin: string, media: Media): Promise<void> {
  const manifest = makeManifest({
    id: ARCHIVED_SESSION_ID,
    title: 'QI-15301: Workspace export',
    repo,
    origin,
    branch: TRIAL_BRANCH,
    createdAt: ARCHIVED_CREATED_AT,
    agentSessionId: 'claude-session-a7c1',
    tickets: [{ key: 'QI-15301', url: 'https://example.atlassian.net/browse/QI-15301' }],
  })
  const dir = await writeSessionFolder(manifest, { ...trialArtifacts(media), prDescription: '# QI-15301: Workspace export\n\nArchived after the merge.\n' }, true)
  const { tree } = await computeWorkingTree({ repo, baseRef: BASE_REF, now: () => new Date(ARCHIVED_CREATED_AT) })
  const drafted: Review = {
    ...emptyReview(manifest.id, ARCHIVED_CREATED_AT),
    files: Object.fromEntries(tree.files.map((file) => [file.path, judged(tree, file.path, 'approved')])),
    comments: [makeComment('c1', { kind: 'overall', ref: null }, 'Approved; merged as #412.', ARCHIVED_CREATED_AT)],
    nextCommentId: 2,
    overall: { decision: 'approve' },
    ui: { mode: 'grid', currentFile: null, section: 'submit' },
  }
  const sent = buildSentSnapshot({ review: drafted, tree, decision: 'approve', resolutions: null, now: ARCHIVED_SENT_AT })
  await writeJsonAtomic(path.join(dir, 'review', 'review.json'), ReviewSchema.parse(stampSent(drafted, sent, ARCHIVED_SENT_AT)))
  await writeJsonAtomic(path.join(dir, 'archived.json'), ArchivedMarkerSchema.parse({ archivedAt: ARCHIVED_AT }))
}

/** The manifest records `feature/trial-bar-v1`; the shared trial-app repo has `feature/trial-bar` checked out. */
export async function writeBranchChangedSession(repo: string, origin: string, media: Media): Promise<void> {
  const manifest = { ...trialManifest(BRANCH_CHANGED_SESSION_ID, repo, origin, '2026-10-01T11:30:00.000Z', null), title: 'QI-15472: Trial bar (started on the v1 branch)' }
  manifest.repo = { ...manifest.repo, branch: 'feature/trial-bar-v1' }
  await writeSessionFolder(manifest, trialArtifacts(media))
}

export const NO_CHANGES_BRANCH = 'feature/rotate-signing-key'

/** Points at `clean-app`, whose working tree equals the base: the tree has zero files. */
export async function writeNoChangesSession(repo: string, origin: string): Promise<void> {
  const manifest = makeManifest({
    id: NO_CHANGES_SESSION_ID,
    title: 'OPS-7: Rotate the signing key (nothing changed yet)',
    repo,
    origin,
    branch: NO_CHANGES_BRANCH,
    createdAt: '2026-10-01T11:45:00.000Z',
    tickets: [{ key: 'OPS-7', url: null }],
  })
  await writeSessionFolder(manifest, {
    spec: { files: [{ file: 'jira.md', text: '# OPS-7: Rotate the signing key\n\n- **Status:** To Do\n\nThe agent has not started; the session was opened to collect the plan first.\n' }], index: null },
    prDescription: '# OPS-7\n\nNo changes yet.\n',
  })
}

const LONG_BRANCH = 'feature/QI-15472-trial-bar-with-amber-warning-variant-session-scoped-dismissal-and-a-direct-upgrade-path-for-free-plan-workspaces-second-attempt'

/** Exactly 160 characters. */
const LONG_TITLE =
  'QI-15472: Trial bar with amber warning variant, session-scoped dismissal, direct upgrade path and plan badges for free-plan workspaces (second attempt, rebased)'

/** `trial-app-long`: the trial change set on a 150-character branch name, a 160-character title and six tickets. */
export async function writeLongTitleSession(repo: string, origin: string, media: Media): Promise<void> {
  if (LONG_TITLE.length !== 160) throw new Error(`make-fixture: LONG_TITLE is ${LONG_TITLE.length} characters, not 160`)
  await git(repo, ['branch', '-m', LONG_BRANCH])
  const manifest = makeManifest({
    id: LONG_TITLE_SESSION_ID,
    title: LONG_TITLE,
    repo,
    origin,
    branch: LONG_BRANCH,
    createdAt: '2026-10-01T12:00:00.000Z',
    agentSessionId: 'claude-session-10f6',
    tickets: [
      { key: 'QI-15472', url: TRIAL_TICKET_URL },
      { key: 'QI-15488', url: 'https://example.atlassian.net/browse/QI-15488' },
      { key: 'PLATFORM-22017', url: 'https://example.atlassian.net/browse/PLATFORM-22017' },
      { key: 'DES-77', url: 'https://example.atlassian.net/browse/DES-77' },
      { key: 'SEC-1040', url: null },
      { key: 'OPS-311', url: 'https://example.atlassian.net/browse/OPS-311' },
    ],
  })
  await writeSessionFolder(manifest, trialArtifacts(media))
}

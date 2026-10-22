// Builds the fixture store: real git repos under fixtures/store/repos (each with a local bare origin so
// `origin/master` exists, a feature branch and the change set left uncommitted in the working tree)
// and the Contract v2 sessions listed in fixtures/README.md. Run with `npm run fixture` from the root;
// the modules under scripts/fixtures/ hold the repo content and each session. `FIXTURE_OUT` redirects
// the output (the e2e run builds a throwaway copy).
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import type { WorkingTree } from '@review-dash/shared'
import { computeWorkingTree } from '@review-dash/shared/git/working-tree'
import { BASE_REF, copyRepo, printSummary, reposDir, storeDir, type SessionReport } from './fixtures/common.ts'
import {
  writeArchivedSession,
  writeBranchChangedSession,
  writeEmptySession,
  writeLongTitleSession,
  writeNoChangesSession,
  NO_CHANGES_BRANCH,
} from './fixtures/edge-sessions.ts'
import {
  ACTIVE_RUN_SESSION_ID,
  ALL_VERDICTS_SESSION_ID,
  ARCHIVED_SESSION_ID,
  BRANCH_CHANGED_SESSION_ID,
  EMPTY_SPEC_EXTRAS_SESSION_ID,
  APPROVED_SESSION_ID,
  CHANGES_SENT_SESSION_ID,
  FAILED_RUN_SESSION_ID,
  IN_PROGRESS_SESSION_ID,
  FIXTURE_SESSION_ID,
  LONG_TITLE_SESSION_ID,
  NO_CHANGES_SESSION_ID,
  PR_FRESH_SESSION_ID,
  PR_MERGED_SESSION_ID,
  PR_MIXED_SESSION_ID,
  PR_NO_COMMENTS_SESSION_ID,
  REVIEWED_SESSION_ID,
  RICH_SPEC_SESSION_ID,
  TYPES_VARIETY_SESSION_ID,
} from './fixtures/ids.ts'
import { ensureMedia } from './fixtures/media.ts'
import { writePrFreshSession, writePrMergedSession, writePrMixedSession, writePrNoCommentsSession } from './fixtures/pr-sessions.ts'
import { writeActiveRunSession, writeAllVerdictsSession, writeApprovedSession, writeChangesSentSession, writeFailedRunSession, writeInProgressSession } from './fixtures/review-sessions.ts'
import { writeTestRunSessions } from './fixtures/test-run-session.ts'
import { buildCleanRepo, buildTrialRepo } from './fixtures/trial-app.ts'
import { TRIAL_TITLE, writeReviewedSession, writeUnreviewedSession } from './fixtures/trial-sessions.ts'
import { buildVarietyRepo } from './fixtures/variety-app.ts'
import { writeRichSpecSession, writeTypesVarietySession } from './fixtures/variety-sessions.ts'

async function treeOf(repo: string): Promise<WorkingTree> {
  return (await computeWorkingTree({ repo, baseRef: BASE_REF })).tree
}

async function main(): Promise<void> {
  await rm(storeDir, { recursive: true, force: true })
  await mkdir(reposDir, { recursive: true })
  const media = await ensureMedia()
  const reports: SessionReport[] = []

  // trial-app: the 12-file trial-bar change set. Sessions that only read it share this copy.
  const trial = path.join(reposDir, 'trial-app')
  const trialOrigin = path.join(reposDir, 'trial-app-origin.git')
  await buildTrialRepo(trial, trialOrigin, media.png)
  await writeUnreviewedSession(trial, trialOrigin, media)
  const trialTree = await treeOf(trial)
  reports.push({ id: FIXTURE_SESSION_ID, title: TRIAL_TITLE, covers: 'unreviewed; staged, unstaged, untracked, renamed, deleted, binary, collapsed files', repo: trial, tree: trialTree })

  // Copies for sessions whose fixture edits the working tree or pins verdicts to it.
  const trial2 = await copyRepo(trial, 'trial-app-2')
  await writeReviewedSession(trial2, trialOrigin, media)
  const tree2 = await treeOf(trial2)
  const moved = tree2.files.filter((f) => trialTree.files.find((g) => g.path === f.path)?.fingerprint !== f.fingerprint).map((f) => f.path)
  reports.push({ id: REVIEWED_SESSION_ID, title: TRIAL_TITLE, covers: `reviewed, sent, partly resolved; edited since the send: ${moved.join(', ')}`, repo: trial2, tree: tree2 })

  const variety = path.join(reposDir, 'variety-app')
  const varietyOrigin = path.join(reposDir, 'variety-app-origin.git')
  await buildVarietyRepo(variety, varietyOrigin, { before: media.png, after: media.warningPng })
  await writeTypesVarietySession(variety, varietyOrigin)
  const varietyTree = await treeOf(variety)
  reports.push({ id: TYPES_VARIETY_SESSION_ID, title: 'VAR-201: Comments on posts', covers: '26 files: 2+ of every type, every status, a >2000-line diff, a collapsed lockfile, a binary', repo: variety, tree: varietyTree })

  await writeEmptySession(trial, trialOrigin)
  reports.push({ id: EMPTY_SPEC_EXTRAS_SESSION_ID, title: 'QI-15490: Hotfix without any notes', covers: 'no spec, extras, evidence or PR description', repo: trial, tree: trialTree })

  await writeRichSpecSession(variety, varietyOrigin, media)
  reports.push({ id: RICH_SPEC_SESSION_ID, title: 'VAR-201: Comments on posts', covers: 'jira + markdown (mermaid block) + artifact spec, md/html/mmd/mermaid extras, 6 images + video, long captions, unindexed items', repo: variety, tree: varietyTree })

  const trial3 = await copyRepo(trial, 'trial-app-all-verdicts')
  const tree3 = await writeAllVerdictsSession(trial3, trialOrigin, media)
  reports.push({ id: ALL_VERDICTS_SESSION_ID, title: TRIAL_TITLE, covers: 'every file approved/rejected/commented, 3 line comments, overall comment drafted, not sent', repo: trial3, tree: tree3 })

  const trialRuns = await copyRepo(trial, 'trial-app-runs')
  const treeRuns = await writeFailedRunSession(trialRuns, trialOrigin, media)
  reports.push({ id: FAILED_RUN_SESSION_ID, title: TRIAL_TITLE, covers: 'sent back; one earlier succeeded run, latest run failed with stderr in its log', repo: trialRuns, tree: treeRuns })
  await writeActiveRunSession(trialRuns, trialOrigin, media)
  reports.push({ id: ACTIVE_RUN_SESSION_ID, title: TRIAL_TITLE, covers: 'sent back; run record still running (agent-working status)', repo: trialRuns, tree: treeRuns })

  const trialSent = await copyRepo(trial, 'trial-app-sent')
  const treeSent = await writeChangesSentSession(trialSent, trialOrigin, media)
  reports.push({ id: CHANGES_SENT_SESSION_ID, title: TRIAL_TITLE, covers: 'every file approved, sent as request-changes: "Changes sent" despite the green bar', repo: trialSent, tree: treeSent })
  const trialApproved = await copyRepo(trial, 'trial-app-approved')
  const treeApproved = await writeApprovedSession(trialApproved, trialOrigin, media)
  reports.push({ id: APPROVED_SESSION_ID, title: TRIAL_TITLE, covers: 'every file approved, Approve sent: "Approved"', repo: trialApproved, tree: treeApproved })

  const trialProgress = await copyRepo(trial, 'trial-app-progress')
  const treeProgress = await writeInProgressSession(trialProgress, trialOrigin, media)
  reports.push({ id: IN_PROGRESS_SESSION_ID, title: TRIAL_TITLE, covers: 'four files approved and one comment, nothing sent: "In progress"', repo: trialProgress, tree: treeProgress })

  await writeArchivedSession(trial, trialOrigin, media)
  reports.push({ id: ARCHIVED_SESSION_ID, title: 'QI-15301: Workspace export', covers: 'archive/<id> with archived.json; approved and sent before archiving', repo: trial, tree: null, archived: true })

  await writeBranchChangedSession(trial, trialOrigin, media)
  reports.push({ id: BRANCH_CHANGED_SESSION_ID, title: 'QI-15472: Trial bar (started on the v1 branch)', covers: 'manifest branch feature/trial-bar-v1 vs checked-out feature/trial-bar', repo: trial, tree: trialTree })

  const clean = path.join(reposDir, 'clean-app')
  const cleanOrigin = path.join(reposDir, 'clean-app-origin.git')
  await buildCleanRepo(clean, cleanOrigin, NO_CHANGES_BRANCH)
  await writeNoChangesSession(clean, cleanOrigin)
  reports.push({ id: NO_CHANGES_SESSION_ID, title: 'OPS-7: Rotate the signing key (nothing changed yet)', covers: 'zero changes against the base', repo: clean, tree: await treeOf(clean) })

  const trialLong = await copyRepo(trial, 'trial-app-long')
  await writeLongTitleSession(trialLong, trialOrigin, media)
  reports.push({ id: LONG_TITLE_SESSION_ID, title: '(160 characters)', covers: '160-char title, 6 ticket chips, 150-char branch name', repo: trialLong, tree: await treeOf(trialLong) })

  const prMixedTree = await writePrMixedSession(variety, varietyOrigin)
  reports.push({ id: PR_MIXED_SESSION_ID, title: 'VAR-201: Comments on posts', covers: 'PR #482 with 12 GitHub comments: addressed (3 in the last send), declined with a reason, outdated, resolved on GitHub, open; thread with a reply; Copilot and human authors; review summaries; a general comment', repo: variety, tree: prMixedTree })
  const prFreshTree = await writePrFreshSession(trial, trialOrigin)
  reports.push({ id: PR_FRESH_SESSION_ID, title: TRIAL_TITLE, covers: 'draft PR #131 just synced: open Copilot suggestion, human nit with a reply, review summary; nothing sent', repo: trial, tree: prFreshTree })
  const prNoCommentsTree = await writePrNoCommentsSession(trial, trialOrigin)
  reports.push({ id: PR_NO_COMMENTS_SESSION_ID, title: TRIAL_TITLE, covers: 'PR #133 known, zero comments (the PR tab link only)', repo: trial, tree: prNoCommentsTree })
  const prMergedTree = await writePrMergedSession(trial, trialOrigin)
  reports.push({ id: PR_MERGED_SESSION_ID, title: TRIAL_TITLE, covers: 'merged PR #127; three comments addressed in the approved send', repo: trial, tree: prMergedTree })

  for (const run of await writeTestRunSessions(reposDir)) {
    reports.push({ id: run.id, title: run.title, covers: run.covers, repo: run.repo, tree: null })
  }

  printSummary(reports)
}

await main()

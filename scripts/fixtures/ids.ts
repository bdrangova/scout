// Fixed session ids of the fixture store. Each matches `SESSION_ID_RE` (the 4-hex suffix is required).
// `e2e/smoke.spec.ts` hardcodes FIXTURE_SESSION_ID and expects its 12-file trial-app tree; do not change it.

/** Session 1: the trial-bar change set, unreviewed. */
export const FIXTURE_SESSION_ID = '20260926-1200-qi-15472-trial-bar-f1a0'
/** Session 2: reviewed, sent back with comments, partly resolved, two files edited since. */
export const REVIEWED_SESSION_ID = '20260926-1300-qi-15472-trial-bar-f2a0'

/** ~25 changed files covering every file type, every status, a huge diff and a collapsed lockfile. */
export const TYPES_VARIETY_SESSION_ID = '20261001-0900-var-201-comments-on-posts-a1b2'
/** A diff but no spec, extras, evidence or PR description: empty states everywhere. */
export const EMPTY_SPEC_EXTRAS_SESSION_ID = '20261001-0930-qi-15490-hotfix-no-notes-e5e0'
/** Jira card, markdown spec with a mermaid block, HTML artifact, four kinds of extras, lots of evidence. */
export const RICH_SPEC_SESSION_ID = '20261001-1000-var-201-comments-rich-spec-c3d4'
/** Every file judged or commented, line comments, overall comment drafted, nothing sent yet. */
export const ALL_VERDICTS_SESSION_ID = '20261001-1030-qi-15472-trial-bar-all-verdicts-a11e'
/** Lives under `archive/<id>` with `archived.json`. */
export const ARCHIVED_SESSION_ID = '20260920-0800-qi-15301-workspace-export-a7c1'
/** The manifest says one branch, the repo has another checked out. */
export const BRANCH_CHANGED_SESSION_ID = '20261001-1130-qi-15472-trial-bar-branch-changed-b7c0'
/** The working tree equals the base: zero files in the diff. */
export const NO_CHANGES_SESSION_ID = '20261001-1145-ops-7-rotate-signing-key-0c0c'
/** 160-character title, six tickets, a very long branch name. */
export const LONG_TITLE_SESSION_ID = '20261001-1200-qi-15472-trial-bar-long-title-10f6'
/** Every file approved, then sent as "request changes" (an overall comment): the list says "Changes sent", not "Approved". */
export const CHANGES_SENT_SESSION_ID = '20261001-1215-qi-15472-trial-bar-changes-sent-5e17'
/** Every file approved and an Approve decision sent: the only way to "Approved". */
export const APPROVED_SESSION_ID = '20261001-1230-qi-15472-trial-bar-approved-a99d'
/** A few files approved and one comment, nothing sent: "In progress". */
export const IN_PROGRESS_SESSION_ID = '20261001-1245-qi-15472-trial-bar-in-progress-77c3'

/** PR #482 on variety-app with 12 external comments in every state: the main GitHub-comments fixture. */
export const PR_MIXED_SESSION_ID = '20261005-0900-var-201-pr-comments-b4e1'
/** A draft PR just synced: open Copilot and human comments, nothing sent. */
export const PR_FRESH_SESSION_ID = '20261005-0930-qi-15472-trial-bar-pr-fresh-c5d2'
/** A PR is known but has no comments (pr-link / a first pr-sync). */
export const PR_NO_COMMENTS_SESSION_ID = '20261005-1000-qi-15472-trial-bar-pr-no-comments-d6f3'
/** A merged PR whose comments were all addressed in the approved send. */
export const PR_MERGED_SESSION_ID = '20261005-1030-qi-15472-trial-bar-pr-merged-e7a4'

/** A test run (kind "test-run"): the demo run folder copied from fixtures/test-runs, 3 scenarios. */
export const TEST_RUN_SESSION_ID = '20261021-1800-diffing-run-7e2a'
/** A test run from the user's state-management feature test: 6 scenarios, one verdict and an open comment written. */
export const STATE_MANAGEMENT_RUN_SESSION_ID = '20261012-1745-qi-15267-approve-archive-5a1c'
/** A test run without a plan file or data setup: baseline checks and gap demos, one unsupported panel. */
export const WITHDRAWN_RUN_SESSION_ID = '20261022-1545-qi-16304-withdrawn-repropose-9c3d'

/** A code review whose repo is the `qi-15531-trial-bar-polish` worktree (linked, so that worktree cannot be deleted). */
export const WORKTREE_CODE_REVIEW_SESSION_ID = '20261026-0900-qi-15531-trial-bar-polish-7a31'
/** A test run whose checkout is the same worktree. */
export const WORKTREE_TEST_RUN_SESSION_ID = '20261026-0930-qi-15531-polish-run-7b32'
/** PR review (`kind: 'pr-review'`) linked to the same worktree as the two above. */
export const WORKTREE_PR_REVIEW_SESSION_ID = '20261026-1000-qi-15531-polish-pr-review-7c33'

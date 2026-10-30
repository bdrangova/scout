# Fixture store

`npm run fixture` rebuilds `fixtures/store` (git-ignored) from `scripts/make-fixture.ts` and the modules under
`scripts/fixtures/`: real git repos under `store/repos/` (each with a local bare origin so `origin/master`
resolves, a feature branch and the change set left uncommitted) and the Contract v2 sessions below under
`store/sessions/` and `store/archive/`. `npm run dev:fixtures` serves it on API 4555 / web 4556 (next to the real Scout on 4545/4546); the e2e run builds its own copy
(`FIXTURE_OUT`). The script prints a summary of every session and its computed tree at the end.

Inputs: `src/` (spec, extras and PR description of the trial-bar sessions), `media/` (screenshots and a recording
rendered once with Playwright and cached; delete a file to re-render it)).

## Repos

| Repo | Content |
| --- | --- |
| `trial-app` | 12 changed files: staged renames/deletes/adds, two unstaged edits, one untracked test, a binary, a collapsed lockfile and a collapsed 2,000-line generated file. Shared by every session that only reads it. |
| `trial-app-2`, `trial-app-all-verdicts`, `trial-app-long` | Copies of `trial-app` for sessions whose fixture edits the tree, pins verdicts to it or renames the branch. |
| `variety-app` | 26 changed files: at least two each of `.ts .tsx .js .jsx .yaml/.yml .json .css .md`, one `.png`; added, modified, deleted, renamed-with-edits and untracked; `src/data/countries.ts` (2,100 added lines → collapsed, `too-many-changed-lines`, the 413 large-file gate) and `package-lock.json` (collapsed, generated). |
| `clean-app` | The trial-app base commit with a feature branch and no changes at all. Also the main checkout of the fixture worktrees. |
| `worktrees/*` | Linked worktrees of `clean-app` in `store/worktrees/` (and `store/config.json` with `worktreeFolders` pointing there; a plain `notes/` folder is ignored): `qi-15500-export-filters` (clean, 2 commits ahead), `qi-15512-bulk-archive` (1 commit ahead, one modified and one untracked file: delete refused as dirty), `qi-15531-trial-bar-polish` (clean, 2 ahead, linked to the three sessions below: delete refused). For the Worktrees page (`GET /worktrees`). |

## Sessions

Ids are constants in `scripts/fixtures/ids.ts`. The first two are what `e2e/smoke.spec.ts` drives; do not change them.

| Id | Session | What it exercises |
| --- | --- | --- |
| `20260926-1200-qi-15472-trial-bar-f1a0` | trial bar, unreviewed | The default review flow; every file state in one small tree; "Awaiting review" in the list. |
| `20260926-1300-qi-15472-trial-bar-f2a0` | trial bar, reviewed | Approved/rejected verdicts, file + evidence (0:02.5) + overall comments, a send (`review/sent/*.json\|.md\|.patch`), agent resolutions (one resolved, one reply), two files edited after the send → "updated" chips and status `updated`. |
| `20261001-0900-var-201-comments-on-posts-a1b2` | types-variety | The file grid, the file-type filter and the sidebar tree with 26 files of every type and status; a binary modified in place; the collapsed lockfile and the >2,000-line file (413 unless `?force=1`); a Jira spec only. |
| `20261001-0930-qi-15490-hotfix-no-notes-e5e0` | empty-spec-extras | A diff but no `spec/`, `extras/`, `evidence/` or `pr-description.md`: the empty state of every tab. |
| `20261001-1000-var-201-comments-rich-spec-c3d4` | rich-spec | Spec: Jira card, markdown plan with a mermaid block, HTML artifact, plus an unindexed markdown file. Extras: `.md` (with mermaid), `.html`, `.mmd`, `.mermaid`, plus an unindexed note (title from its heading). Evidence: five images (one in a nested folder, one unindexed), a video, a 180-character caption and a 400-character description. Two ticket chips. |
| `20261001-1030-qi-15472-trial-bar-all-verdicts-a11e` | all-verdicts | Every file approved, rejected (with a file comment) or commented (verdict `none` + file comment); three line comments (`new` range, `new` single line, `old` side on a deleted file); evidence and spec comments; an overall comment drafted with the decision still `undecided` and nothing sent: the Review-Complete screen. |
| `20260920-0800-qi-15301-workspace-export-a7c1` | archived | Lives under `store/archive/<id>/` with `archived.json`; approved and sent before archiving. Listed by `GET /sessions/archived`, never computed. |
| `20261001-1130-qi-15472-trial-bar-branch-changed-b7c0` | branch-changed | The manifest says `feature/trial-bar-v1`, the shared `trial-app` repo has `feature/trial-bar` checked out: the "Branch changed" pill (`repo.branch` ≠ `repo.sessionBranch`). |
| `20261001-1145-ops-7-rotate-signing-key-0c0c` | no-changes | `clean-app`: zero files in the tree, `dirty: false`, progress 0/0; a spec without `index.json` and a ticket without a URL. |
| `20261001-1200-qi-15472-trial-bar-long-title-10f6` | long-title | A 160-character title, six ticket chips (one without a URL, one with a 14-character key), a 150-character branch name: overflow and truncation. |
| `20261001-1215-qi-15472-trial-bar-changes-sent-5e17` | changes-sent | All 12 files approved, sent as request-changes with an overall comment: the list says "Changes sent" although the bar is fully green. |
| `20261001-1230-qi-15472-trial-bar-approved-a99d` | approved | All 12 files approved and an Approve decision sent: the only route to "Approved". |
| `20261001-1245-qi-15472-trial-bar-in-progress-77c3` | in-progress | Four files approved and one comment, nothing sent: "In progress". |
| `20261005-0900-var-201-pr-comments-b4e1` | pr-mixed | GitHub PR comments: PR #482 on `variety-app` with 13 threads plus a reply, two of them from untrusted authors (a CONTRIBUTOR nit, and a FIRST_TIME_CONTRIBUTOR comment that is a prompt-injection attempt: a fake closing marker, `curl | sh`, `$(...)`; the sent `.md` leaves both out). Addressed (3 in the last send, one in an earlier send), declined with a reason, outdated, resolved on GitHub, 4 open; Copilot line comments (one with a `suggestion`), human nits, a thread with a reply, a Copilot overview and a human "changes requested" summary, a general comment. Every line comment sits on a line of the real diff (`src/api/comments.ts`, `CommentList.tsx`, `Avatar.tsx`, `config/cache.yaml`, `src/utils/time.ts`); the outdated one has no current line. Sent as request-changes, so `lastSend` and the sent `.md` (with its `## GitHub PR comments` section) exist. |
| `20261005-0930-qi-15472-trial-bar-pr-fresh-c5d2` | pr-fresh | A draft PR #131, synced once: Copilot suggestion on `TrialBar.tsx`, a human nit with a reply on `config.ts`, a Copilot overview; all open, nothing reviewed or sent. |
| `20261005-1000-qi-15472-trial-bar-pr-no-comments-d6f3` | pr-no-comments | PR #133 is known (`review/pr-comments.json` with zero comments) and nothing else: the PR tab link with no comments to show. |
| `20261005-1030-qi-15472-trial-bar-pr-merged-e7a4` | pr-merged | Merged PR #127; three comments all addressed in the approved send (with commit shas), every file approved. |
| `20261021-1800-diffing-run-7e2a` | test-run | `kind: "test-run"`: the synthetic demo run from `fixtures/test-runs/demo/plans` (3 scenarios) copied into `repos/qa-plans` (a plain folder, not a git repo; only `run.path` inside `run.repo` is required). Unreviewed, one ticket (QA-31). For the /t/<run> test review module. |
| `20261012-1745-qi-15267-approve-archive-5a1c` | test-run | The user's state-management feature test, shrunk: 6 scenarios (pass, gap, fail, blocked), 3 bugs, 3 gaps, data setup with a snapshot path, 4 logs, real JPEGs and short MP4 clips (about 4.4 MB), in `repos/qa-state-management`. Scenario `s1-uo-approve` is approved and an open `incorrect` comment sits on `s8-reject-then-approve`. Created 2026-10-12. |
| `20261022-1545-qi-16304-withdrawn-repropose-9c3d` | test-run | The withdrawn-repropose notes: no test plan file, no data setup, 9 scenarios (baseline checks and gap demos D1-D5), the three notes copied under a `notes` root and shown as markdown panels, one deliberately unsupported panel type (`timeline`), in `repos/qa-withdrawn-repropose`. Unreviewed. Created 2026-10-22. |
| `20261026-0900-qi-15531-trial-bar-polish-7a31` | worktree code review | A code review whose repo is the `qi-15531-trial-bar-polish` worktree: shows as a linked session on that worktree. |
| `20261026-0930-qi-15531-polish-run-7b32` | worktree test run | A test run whose checkout is the same worktree (the demo plan is committed there). |
| `20261026-1000-qi-15531-polish-pr-review-7c33` | worktree PR review | A PR review (`kind: "pr-review"`, one finding) on the same worktree. |

`pr-mixed` also shows the reply loop (`review/pr-resolutions.json` `proposedReply`, `review/pr-replies.json`): proposed replies on `rc9001`, `rc9003`, `rc9005` (declined) and `ic9201`; drafts: `rc9001` an edited `reply`, not yet posted; `rc9002` an `instruction` on an open comment; `rc9003` a `reply` already posted (`postedAt`, `githubUrl`); `rc9005` and `ic9201` have a proposal but no draft yet. The sent snapshot of this session predates them, so it has no `prReplies`; a new Submit from the UI lists the unposted drafts.

The four `pr-*` sessions (`scripts/fixtures/pr-sessions.ts`) write `review/pr-comments.json` and `review/pr-resolutions.json` directly, as `ai-review pr-sync` / `pr-resolve` would; `pr-mixed` shares `variety-app`, the others `trial-app`.

Three sessions (`empty-spec-extras`, `branch-changed`, `archived`) and the first session share the `trial-app` repo;
`types-variety` and `rich-spec` share `variety-app`.

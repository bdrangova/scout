# PR review module — flow and implementation plan

Status: design record, paired with `pr-review.html`. The first implementation now lives in the PR review session kind; see `docs/pr-review.md` for its CLI contract, persistence and copy-only export behavior.

## Product model

PR review extends the existing Files workflow. All files changed in the selected PR diff remain visible, including files with zero generated findings. “All files” means the complete changed-file set, not every untouched file in the repository. Existing full-diff and per-commit scopes still apply.

There are two independent decisions:

| Review item | Actions | Meaning |
| --- | --- | --- |
| File | Approve / reject / comment | Human verdict on the code in that file, following Files today |
| Proposed inline comment | Approve / edit / reject / comment on suggestion | Whether the proposed PR wording belongs in the final summary |
| Human file or line comment | Add / edit / delete | Human-authored feedback included after it is added |

File approval does not approve proposals. File rejection does not reject them. A file without findings is not automatically approved. Proposed-comment acceptance is not a code-change verdict. A note on a proposal is feedback to the agent; it does not silently alter the PR wording. The edited proposal body is the PR wording.

## End-to-end flow

1. **Request review in an agent session.** The user names the PR and may request a skill chain there: e.g. general review, then concurrency review, then security review. With no choice, use the default review skill. That default is a session/skill configuration concern. No dashboard picker and no dashboard-side skill execution.
2. **Pin the review input.** Resolve repository, PR identity, base/head SHAs and diff. Record the complete changed-file tree and fingerprints. Show useful failures for inaccessible PRs, missing checkout or unsupported revision. A local checkout may be used for reproduction without changing the source PR.
3. **Run the reviewer adapters.** Each requested skill yields normalized findings independently of its internal prompt or implementation. Chain in the session, record order/version, then combine output. A later reviewer can consume earlier findings if the session asks it to. Keep all sources on a merged finding. Do not merge different failures just because they share a line.
4. **Verify findings.** For critical/high/medium findings, attempt reproduction on the pinned code; capture setup, steps, expected/actual results and screenshots tied to steps. Run verification after merging duplicates. Low findings can also carry evidence. Verification can be reproduced, not reproduced, blocked, or non-visual; missing screenshots never imply verification. Non-visual issues use meaningful test output/log evidence and an explicit explanation of why a screenshot does not demonstrate the bug.
5. **Publish the report to Scout.** Validate schema, paths, anchors, revision and media refs, then atomically publish a completed report. Scout opens its Files view in the session shell. The rail shows progress and every changed file; provenance is informational. A valid empty report still opens all files. Generation/verification progress belongs to the agent run state, not a skill-selection screen.
6. **Review in Files.** Browse the existing full tree, filter by path, switch Swipe/Grid, choose a commit scope, and open any diff. Show proposed comments at their real anchors, with a clear severity, source and decision. Clicking a line or selecting a range opens the existing human comment composer. Keep file-level comment and Approve/Reject controls in the file footer. Reproduction and screenshots appear in a section below the diff, grouped by issue with links back to its inline proposal.
7. **Prepare the summary.** Reuse the Submit layout with a PR-review-specific copy/export mode. Show independent file and proposal totals, added human comments, rejected/pending proposals excluded, unresolved evidence limitations and unadded drafts. A partial review may be copied with pending file counts visible. File rejection requires a reason, as in Files today. Reviewer notes are available to the agent, separate from PR-ready text.
8. **Copy.** Generate an exact Markdown snapshot of file verdicts, approved proposal wording and added human comments. Include paths, old/new side, line/range, severity, reproduction, limitations and usable screenshot references. The summary is a manual PR handoff. No PR creation, publishing comments, posting replies or GitHub review submission in this v1 action.
9. **Continue after updates.** New commits invalidate file verdicts using current fingerprints. Changed/deleted anchors appear in a visible changed/orphaned section. Accepted proposals whose code, wording, evidence or verification changed need reapproval. Keep previously exported snapshots immutable. An export must not silently include stale accepted proposals as current.

## Screen layout

- Session bar: existing section navigation, Swipe/Grid toggle, Submit.
- Session rail: existing identity/review counts and filterable directory tree. Each row shows its file verdict, proposed-comment count and own-comment count. Empty-finding files remain ordinary rows. An optional future “with findings” filter must not become the default.
- Main column: existing commit timeline, card deck/grid, diff and line annotations. Grid includes all changed files, opens the same card on click, and reports both file and proposal progress.
- Diff: proposals appear below the anchored range. Their actions explicitly say “Approve comment” and “Reject comment.” Editing is direct; a comment-on-suggestion action creates a reviewer note. Human comments retain the existing line/range interaction and edit/delete lifecycle.
- Below diff: per-issue reproduction, expected/actual, screenshot step captions, and blocked/non-visual explanation. Expand screenshots using the existing media/dialog pattern. No fabricated “passed” state when reproduction did not run.
- File footer: existing file comments + Reject / Comment / Approve actions, with file verdict visible. Existing file actions, toggles, rejection reason, auto-advance and Undo remain the production baseline. Proposal actions must not advance the file or intercept file gestures.
- Submit: separate groups for file decisions, human-authored comments and accepted proposals. Copy Markdown is the main completion action.

The wireframe uses black lines, white backgrounds, simple boxes and crossed screenshot placeholders. It simulates editing, independent decisions, full changed-file navigation, line/range commenting, rejection reasons and copy export. It does not simulate a backend, actual skill execution, persistence, scope switching, deck animations or stale-state transitions. Timeline hashes are layout context, not working scope selectors.

## Proposed report contract

Use additive shared schemas. Keep machine-generated report data separate from human review state and from imported GitHub threads.

| Object | Required information |
| --- | --- |
| Report | schema version, report ID, repository/PR identity, base/head SHA, created time, ordered reviewer identities/versions, completion state |
| Changed file | repository-relative path, rename information, full-diff fingerprint; tree comes from git, never from finding paths alone |
| Finding | stable ID, severity, title, proposed body, path, `LineAnchor` (old/new, line, optional endLine), sources, content digest, related locations if applicable |
| Reproduction | status, environment and code revision, prerequisites, ordered step IDs, expected/actual, reason when blocked/non-visual/not reproduced |
| Evidence | media ID, report-relative ref, kind, caption, linked finding/step, captured time/revision; test/log refs for non-visual verification |
| Proposal review | finding ID, none/approved/rejected, edited body, reviewer notes, reviewed content/evidence digest, timestamps |
| Export snapshot | exact Markdown, report/head identifiers, included proposal/human-comment IDs, file verdict snapshot, generated time |

Use existing `LineAnchorSchema` rather than a new incompatible line format. Keep `FileReviewSchema` and the existing human `CommentSchema` for their current purposes; add proposal decisions separately. An approved proposal is not an imported GitHub comment or a human comment until an explicit export renders it.

Validate paths inside the report media root, reject traversal and invalid anchors, check screenshot existence, and treat report Markdown as untrusted like imported PR text. Missing media produces a visible evidence warning. Raw machine reports should never mutate a reviewer’s wording or verdicts.

Screenshot references need a portable export policy: use an existing accessible URL when available; otherwise include the attachment filename with an explicit “attach screenshot” note. A local filesystem URL is not a usable PR screenshot. Do not auto-upload or pretend a local reference is publicly accessible. The wireframe exports no screenshot references because its images are placeholders.

## State and update rules

| Event | File verdict | Proposal decision | Human comments |
| --- | --- | --- | --- |
| Approve/reject file | Only that file changes; existing reason/undo rules | Unchanged | Existing draft-with-verdict rules |
| Approve/reject proposal | Unchanged | Only that finding changes | Unchanged |
| Edit approved wording | Unchanged | Approval cleared; needs approval again | Unchanged |
| Add note on proposal | Unchanged | Unchanged | Stored as reviewer-to-agent note |
| Add human line/file comment | Unchanged | Unchanged | Included after Add or existing verdict-with-draft action |
| Same report refreshed | Preserve matching fingerprints | Preserve matching finding IDs + digests | Preserve |
| Code/evidence/report changed | Changed files stale per existing rules | Affected findings stale, excluded until reviewed | Re-anchor only with evidence; otherwise show changed/orphaned |
| Export | Unchanged | Unchanged | Snapshot added comments, never unadded drafts |

Keep drafts while navigating; show unadded drafts on Submit. Persist production proposal state and edited wording with the existing save/flush discipline. Flush all editors before generating a snapshot. Empty proposal text cannot be approved. Disappeared findings remain available in review history but cannot be silently exported on a new head.

Keyboard behaviour follows the app: A/X/C act on the file outside editors; proposal controls are explicit. Typing and line composers suppress file hotkeys. Avoid a whole-file swipe deciding every proposal. Normal next/previous navigation is separate from the existing deliberate file-verdict gesture.

## Implementation phases and integration points

1. **Contract + fixtures.** Add report/proposal schemas under `shared/src/schemas`, version them, and include all-files/zero-findings/multiple-findings/blocked/non-visual/changed-anchor fixtures. Reuse `schemas/review.ts` line anchors and file fingerprints.
2. **Session-side adapters + import.** Define an adapter output that any review skill can produce. Add a proposed `ai-review pr-report validate|import` command (new, not currently present), following the validation/reporting pattern of `cli/src/commands/run-index.ts`. Keep default skill orchestration in the agent/session layer. Validate fully before publishing; retain the previous report on import failure.
3. **Server + persistence.** Add report read/import status, proposal decision saves and report-update events. Store immutable source reports, human review state and export snapshots separately. Keep existing GitHub inbound comments/replies APIs distinct. Review-only copy mode must not call `send.ts` branches that post PR replies.
4. **Files UI.** Extend `FilesPage`, `FilesRailSection` / `FileTree`, `FileGrid`, `FileReviewCard` and `FileDiffView` with report annotations. Reuse `LineAnnotation` / line composer behaviour, `CardActions`, `CommitTimeline`, and `SessionRail`. Put proposal decisions in a dedicated context/reducer; do not make file verdicts depend on proposal totals. Extract reusable patterns where needed rather than copying the Files implementation into a divergent screen.
5. **Evidence + summary.** Add per-finding evidence below the diff and anchor links. Reuse existing evidence/media primitives. Extend Submit with a copy-only mode, deterministic Markdown generation, unsaved-draft notices and export snapshots. Do not reuse existing GitHub posting side effects for this mode.
6. **Focused verification.** Test independence of decisions, real old/new line ranges, multiple proposals per line, zero-finding files, revision invalidation, save/reload, exact edited-text export and blocked/non-visual evidence. Browser-check both views, screenshot enlargement, added comments, draft-with-verdict rules, Undo, keyboard focus and mobile rail behaviour.

## Acceptance criteria

- The dashboard has no skill picker; provenance reflects the session’s actual chain or default.
- All changed files are present in tree and grid, regardless of findings. Existing scope selection and file diff behaviour survive.
- File approval/rejection remains independent of every proposal decision, with existing reject reasons, toggles, advance and Undo.
- Human file/line/range comments work on files with and without generated findings. Proposed comments can be edited, independently approved/rejected and annotated for the agent.
- Critical/high/medium findings show reproduction with real step-linked screenshots, or an explicit blocked/non-visual/not-reproduced status and supporting limitations. No placeholders pass as captured evidence.
- Editing an accepted proposal requires reapproval. New commits/evidence cannot silently preserve stale approvals.
- Copy output includes exact accepted wording, human-added comments and file verdicts, with anchors/evidence; excludes pending/rejected proposals, internal notes and unadded drafts.
- Export is a snapshot and causes no GitHub writes. Existing Files, test-run reviews and PR-reply submission keep their current behaviour.

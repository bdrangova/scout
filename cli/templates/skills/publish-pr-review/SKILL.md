---
name: publish-pr-review
description: Publish a pull request review to Scout with findings and reproduction evidence generated in the current Claude or Codex session. Use when the user runs /publish-pr-review, requests a PR review dashboard, or names a review skill chain to publish.
---
# Publish a PR review to Scout

Generate a report in the agent session. Scout is the human review surface, with no skill picker or agent execution from this tab. Never post comments or submit a review to the PR in this workflow; the user copies an approved summary.

Use the PR specified by the user. Resolve the PR base/head and repository with the available git/GitHub tools. Review a clean checkout of that head against the PR's actual target base. Do not reset the user's work to make it clean. If PR access or reproduction setup is unavailable, explain what is missing rather than inventing it.

## Pick the checkout first

Before any review work, ask the user (AskUserQuestion) where to review:
- **New worktree** (recommended when the current folder is not on the PR's head branch or has uncommitted changes): a worktree of the PR's head branch, so Scout lists it on its Worktrees page and links this review to it.
- **This folder**: only offered when it is already on the PR's head branch with no uncommitted changes.

For a new worktree, use the repository's own worktree skill when it has one (for example `qbd-worktree`: its "existing branch" flow, then its app and data steps when findings need reproducing) and follow that skill's rules. Without one, ask the user for the parent folder (suggest one of Scout's worktree folders) and run `git worktree add <folder>/<branch-name> <head-branch>`. Never make an ad-hoc clone or temporary copy, and never use `EnterWorktree` or the desktop app's own worktree feature. Then work on the worktree by its absolute path: it is `<PR-checkout>` below.

With `--auto` or `AI_REVIEW_HEADLESS=1`, don't ask: review this folder when it qualifies, otherwise create the worktree.

Create or reuse a session:

```sh
ai-review init --kind pr-review --repo <PR-checkout> --base <PR-base-ref> --title <PR-title>
ai-review pr-report template <session-id> --pr <PR-URL> --number <PR-number> --repository <owner/repo>
ai-review pr-report schema
```

Save the template JSON outside the clean checkout, next to the evidence files. Preserve its entire `files` array, SHAs and fingerprints; it includes files without findings. Fill the report rather than constructing a subset of changed files.

On a follow-up pass, read `ai-review pr-report show <session-id>` for the previous report, human-edited wording, file feedback and private reviewer notes. Keep stable finding IDs and address those notes in the refreshed report; do not overwrite human state.

If the user names review skills, use those in the order requested, keeping each skill's name/version in `reviewers` and finding provenance in `sources`. The same schema is the adapter boundary for every reviewer; no specific implementation or vendor is required. Merge findings only when they describe the same failure, preserving all sources and a stable finding ID on refresh. Later reviewers may consume earlier results when requested. Otherwise use the default review below with `default-code-review` version `1`.

## Default code review

Read the PR intent and changed code with surrounding callers and tests. Find actionable regressions introduced by the change: incorrect behavior, lost data, authorization mistakes, concurrency failures, boundary conditions and broken integration contracts. Ground each claim in a concrete path and trigger. Avoid style-only findings and speculative risks. Assign critical/high/medium/low according to demonstrated impact. A valid report can have zero findings.

For each finding, write a concise proposed PR comment explaining the trigger, consequence and correction. Use the schema's existing old/new line anchor and keep the range tight within the diff. The human can edit this wording and accept or reject it independently of the file.

## Verify and publish

Reproduce every critical, high and medium finding with `/reproduce` (Skill tool): pass the finding's trigger, expected and actual behaviour and the code it points at, `--session <session-id>`, `--evidence <folder next to the report>`, and `--record`/`--auto` when you have them. Findings that need the same data get the same `--setup-key`, so the data is set up once and every later finding restores its database checkpoint instead. Put the `reproduction` object it returns into the finding as is; never upgrade its status or drop its limitation. Critical/high/medium `reproduced` findings require screenshot or video evidence (videos: WebM/MP4), and every evidence item's revision must equal the report head. Do not run destructive reproduction against live data without user authorization.

```sh
ai-review pr-report validate <session-id> <report.json>
ai-review pr-report import <session-id> <report.json>
ai-review open <session-id>
```

Validation checks revisions, the complete file list, real diff anchors and evidence files; import copies evidence into immutable report storage and publishes the report atomically. If code changed during verification, regenerate the template for the new head and reverify affected findings. A failed import preserves the previous published report. Never edit `review/review.json` to approve proposals or overwrite human wording; human decisions belong to Scout.

Return the session URL, finding counts and any verification limitations. Skills remain composable in this session on the next request.

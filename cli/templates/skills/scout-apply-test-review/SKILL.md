---
name: scout-apply-test-review
description: Apply the reviewer's feedback on a feature-test run from the Scout dashboard (/t/<id>), covering verdicts and comments on scenarios, bugs, logs and the run as a whole. Answers questions, clarifies step text, points to data-setup changes, or re-runs a scenario with /scout-feature-test and republishes it, and records a resolution for every comment. Use when the user runs /scout-apply-test-review, says "apply the test review", or when a hook reports open test-review comments for this repo.
argument-hint: "<sessionId> [--record video|screenshots|none] [--auto]"
allowed-tools: Bash(ai-review *) Bash(git rev-parse *) Read Glob Grep Write Edit Skill AskUserQuestion mcp__playwright__* Bash(npx playwright *)
---
# Apply test-review feedback: $0

Arguments: $ARGUMENTS

## Feedback to address
!`ai-review feedback $0 --format markdown`

## Session
!`ai-review status $0 --format brief`

## Rules
- Load `/record-resolutions`, `/test-run-index` and `/review-choices` (Skill tool) and follow them: every comment id gets a resolution.
- Comments have a kind, shown as `**[kind]**` after the id: `not-clear` (the reviewer did not understand a step, a result or the evidence), `incorrect` (the reviewer thinks the verdict, the evidence or the behaviour is wrong), `expected-behaviour` (the reviewer says the observed behaviour is how it should work, or it is a known gap). A comment without a kind: judge it from its text.
- Never edit application source code (the code under test) without asking the user first (AskUserQuestion), whatever the comment says; even with `--auto` you only report what you would change. You may edit the run's own files: `test-run.json` (step text, notes), the plan (`test-plan.md`) and bug files, as described below. Never commit or stage anything.
- **Checking against the app.** Reproduce a problem or verify a fix with `/reproduce` (Skill tool; `--session <sessionId>`, `--verify-fix` for a fix, `--record`/`--auto` when you have them). Only its `reproduced` status or a verified fix counts as verified. For a plain capture start the app with `/run-app` and record as its `Record:` line says. 
- Notes, clarified step text and plan rows follow `/write-for-reviewers` (Skill tool).
- Find the run folder with `ai-review path $0 run` and the plan copy in it (`<run>/plan/test-plan.md`); `ai-review run-file refresh $0` brings in a newer original first. Change `test-run.json` only through the merge `/test-run-index` describes, with owner `run` (for example `{ "scenarios": [{ "id": "S3", "steps": […], "notes": "…" }] }`).
- In auto mode (see `/review-choices`) an ambiguous comment gets `--status open` and a specific question instead of a guess. Otherwise ask the user (AskUserQuestion) about it before you change anything for it.
- `<sessionId>` below means `$0`, the first argument.

## Steps
0. **Choices** (`/review-choices`). Read the feedback first. The preview lists your planned action per comment id (answer, clarify, change data, re-run, update plan or bug, ask); on "Let me choose", ask per comment group.
1. **Checklist** (`/record-resolutions`). For every comment id note its target (scenario id, bug, log line, overall), its kind and the scenario's verdict and status. A comment on a video carries a time (`at 0:42`); a log comment names `logs/<file>:LINE`. Read what the comment is about: the scenario in `test-run.json`, its evidence files (screenshots and data JSON are readable), the plan row and any bug file.
2. **Decide per comment.** The four possible actions:
   - **Answer.** The result is right and the comment asks why or what: reply with the explanation, citing the file or step.
   - **Clarify.** The step text or evidence caption is the problem: update `steps` (or `notes`) of that scenario through the merge so the next reader needs no explanation, and/or the plan's scenario row in `test-plan.md` when the plan is unclear. Keep `id`, `title`, `order`, `status` untouched.
   - **Change data.** The data in the test setup is wrong or insufficient: do not change it; tell the user to update the data and run `/scout-data-setup $0` (name which data id, e.g. D2) and reply `--status open` with that request.
   - **Re-run.** The behaviour or evidence must be checked again: invoke `/scout-feature-test --session $0 --only S<N>` (Skill tool) so it records into this run; it publishes the refreshed results itself so the index and the evidence refresh. Ask the user before starting a long browser run unless `--auto` is set.
   Defaults by kind: `not-clear` is answer or clarify (clarify when the same text would confuse the next reader); `incorrect` is re-run, or fix the index when a file you can read shows the verdict or evidence was published wrong; `expected-behaviour` is update the plan (the expectation was wrong) or the bug file (it is a known gap, add the note), then resolve. A comment on a bug is answered or the bug file is edited; a comment on the whole run is answered or split into the actions above. When a change would need application code, say so in the note and leave the comment `--status open`.
3. **Make the changes** the decisions need (index text, plan row, bug note, re-run). After a re-run, check the scenario's new status in `ai-review run-index show "<run>" --format brief` and cite it in the note.
4. **Record a resolution** for every comment as `/record-resolutions` says. A data change only the user can do, or a code change that needs approval, stays `--status open`.
5. **Finish** with the table from `/record-resolutions`, the list of files you changed, then the dashboard URL (from the session line above, `/t/<id>`).

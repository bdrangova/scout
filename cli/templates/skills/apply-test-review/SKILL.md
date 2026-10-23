---
name: apply-test-review
description: Apply the reviewer's feedback on a feature-test run from the review-dash dashboard (/t/<id>), covering verdicts and comments on scenarios, bugs, logs and the run as a whole. Answers questions, clarifies step text, points to data-setup changes, or re-runs a scenario with /feature-test and republishes it, and records a resolution for every comment. Use when the user runs /apply-test-review, says "apply the test review", or when a hook reports open test-review comments for this repo.
argument-hint: "<sessionId> [--record video|screenshots|none] [--auto]"
allowed-tools: Bash(ai-review *) Bash(git rev-parse *) Bash(mv *) Read Glob Grep Write Edit Skill AskUserQuestion mcp__playwright__* Bash(npx playwright *)
---
# Apply test-review feedback: $0

Arguments: $ARGUMENTS

## Feedback to address
!`ai-review feedback $0 --format markdown`

## Session
!`ai-review status $0 --format brief`

## Rules
- Every comment id (`c<n>`) in the feedback needs a response. Never silently skip one.
- Comments have a kind, shown as `**[kind]**` after the id: `not-clear` (the reviewer did not understand a step, a result or the evidence), `incorrect` (the reviewer thinks the verdict, the evidence or the behaviour is wrong), `expected-behaviour` (the reviewer says the observed behaviour is how it should work, or it is a known gap). A comment without a kind: judge it from its text.
- Never edit application source code (the code under test) without asking the user first (AskUserQuestion), whatever the comment says; even with `--auto` you only report what you would change. You may edit the run's own files: `test-run.json` (step text, notes), the plan (`test-plan.md`) and bug files, as described below. Never commit or stage anything.
- The dashboard reads the run folder live: a change to `test-run.json` shows as soon as it is saved, and the reviewer sees your resolutions as you record them. There is nothing to resend.
- **Running the app.** When a check needs the running app (reproducing what a comment describes, verifying a fix, capturing evidence), invoke `/run-app` first (Skill tool; pass what you need to check, `--record <mode>` when the arguments have one, and `--auto` when you have it). Record the reproduction as its `Record:` line says (Playwright video or screenshots) into the scenario's `screenshots/` or `videos/` folder in the run (a `/feature-test` re-run records there itself), then `/publish-test-run`, and cite the files. Never skip a reproduction or a check because the dev server was not running. If it reports `App: not running`, say so in the note and leave the comment `--status open` instead of claiming it was verified.
- **Reproducing.** To reproduce what a comment describes or verify a fix, use `/reproduce` (Skill tool; `--session <sessionId>`, `--verify-fix` for a fix, `--auto` when you have it) rather than reproducing by hand: it starts the app, restores or sets up the data with a database checkpoint, records the evidence and returns the status. Cite its evidence and limitation in the note; anything but `reproduced` (or a verified fix) is never reported as verified.
- Find the run folder with `ai-review path $0 run` and the plan next to it (`<run>/../../test-plan.md`, or the `plan` root of `test-run.json`). Write `test-run.json` only through `<run>/test-run.json.tmp` and `mv`, and run `ai-review run-index validate "<run>"` after every change.
- With `--auto` in the arguments or `AI_REVIEW_HEADLESS=1` set, never wait for user input: skip step 0, take the recommended answers, and when a comment is ambiguous reply with `--status open` and a specific question instead of guessing. Without either, ask the user (AskUserQuestion) about an ambiguous comment before you change anything for it.
- `<sessionId>` below means `$0`, the first argument.

## Steps
0. **Choices.** Skip with `--auto` or `AI_REVIEW_HEADLESS=1`. Otherwise read the feedback first, then ask once with AskUserQuestion: "Use these recommendations?" with "Accept all (Recommended)" and "Let me choose", both with a `preview` listing your planned action per comment id (answer, clarify, change data, re-run, update plan or bug, ask). On "Let me choose", ask per comment group with your proposal first, marked "(Recommended)". The session already fixes the run folder, so never ask about that.
1. **Checklist.** Read the feedback top to bottom and list every comment id with its target (scenario id, bug, log line, overall), its kind and the scenario's verdict and status. A comment on a video carries a time (`at 0:42`); a log comment names `logs/<file>:LINE`. Read what the comment is about: the scenario in `test-run.json`, its evidence files (screenshots and data JSON are readable), the plan row and any bug file.
2. **Decide per comment.** The four possible actions:
   - **Answer.** The result is right and the comment asks why or what: reply with the explanation, citing the file or step.
   - **Clarify.** The step text or evidence caption is the problem: edit `steps` (or `notes`) of that scenario in `test-run.json` so the next reader needs no explanation, and/or the plan's scenario row in `test-plan.md` when the plan is unclear. Keep `id`, `title`, `order`, `status` untouched.
   - **Change data.** The data in the test setup is wrong or insufficient: do not change it; tell the user to update the data and run `/publish-data-setup <run>` (name which data id, e.g. D2) and reply `--status open` with that request.
   - **Re-run.** The behaviour or evidence must be checked again: invoke `/feature-test` for just that scenario (Skill tool; name the scenario id and the run folder so it records into the existing run), then run `/publish-test-run <run>` so the index and the evidence refresh. Ask the user before starting a long browser run unless `--auto` is set.
   Defaults by kind: `not-clear` is answer or clarify (clarify when the same text would confuse the next reader); `incorrect` is re-run, or fix the index when a file you can read shows the verdict or evidence was published wrong; `expected-behaviour` is update the plan (the expectation was wrong) or the bug file (it is a known gap, add the note), then resolve. A comment on a bug is answered or the bug file is edited; a comment on the whole run is answered or split into the actions above. When a change would need application code, say so in the note and leave the comment `--status open`.
3. **Make the changes** the decisions need (index text, plan row, bug note, re-run). After a re-run and `/publish-test-run`, check the scenario's new status in `ai-review run-index show "<run>" --format brief` and cite it in the note.
4. **Record a resolution** for every comment, one line each:
   `ai-review resolve $0 --comment c<n> --status resolved --note "<what you answered or changed, where, how verified>" --files <path,path>`
   To reply without resolving (a question for the reviewer, a data change only the user can do, a code change that needs approval) use `--status open --note "…"`. Alternatively write a JSON array `[{ "comment": "c1", "status": "resolved", "note": "…", "files": ["…"] }, …]` and run `ai-review resolve $0 --from <file>`.
5. **Finish** with a table of comment id, status and note, the list of files you changed, then the dashboard URL (from the session line above, `/t/<id>`). Say which comments stay open and what the user has to do for them.

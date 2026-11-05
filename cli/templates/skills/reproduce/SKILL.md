---
name: reproduce
description: Reproduce one reported problem (a PR finding, a review comment, a bug) against this checkout's running app and return the reproduction record with real evidence. Starts the app with /run-app, restores a database checkpoint of the data setup with /snapshot-db (or sets the data up once and checkpoints it), runs the steps, records video/screenshots/logs, and decides reproduced / not-reproduced / blocked / non-visual. Called by the review skills (scout-pr-review, scout-development-review, scout-apply-review, scout-apply-test-review, scout-pr-comments) whenever something needs reproducing or a fix needs verifying; also use it when the user runs /reproduce.
argument-hint: "<what to reproduce> [--session <id>] [--setup-key <key>] [--evidence <dir>] [--record video|screenshots|none] [--verify-fix] [--auto]"
allowed-tools: Bash(git rev-parse *) Bash(ai-review path *) Bash(ai-review env*) Bash(curl *) Read Glob Grep AskUserQuestion
---
# Reproduce

Arguments: $ARGUMENTS

## Rules
- Attempt it. "The app was not running" or "the data was not there" is never a reason to skip: `/run-app` and the setup below exist so you never have to.
- Never fabricate evidence or label a sketch, a mock or a guess as reproduction. Every screenshot, video and log is captured from this run.
- Local app and local data only. Never run a reproduction that writes against shared, staging or production data without the user's yes in this run (`--auto`/`AI_REVIEW_HEADLESS=1`: never).
- Pin everything to the checkout's head (`git rev-parse HEAD`): the record and every evidence item carry it.
- Name the checkout. Several worktrees of one repository can run at once: the record says which one ran it (`checkout` and `runtime.label` from `ai-review env`), so evidence from two worktrees is never mixed up.
- Load `/verdict-highlights` (Skill tool) before capturing and follow it; for video also `/browser-recording`.
- Keep the setup and the reproduction apart: the setup is what any run needs first (users, companies, records in the right state); the reproduction steps are what shows the problem. Only the setup is checkpointed.

## Steps
1. **Plan.** From what you were given (and the code it points at), write down: the trigger, the expected and the actual behaviour you are looking for, the data the trigger needs (the setup), and ordered steps with short ids (`s1`, `s2`, …). Pick a setup key that names the data, not the finding (`approver-and-pending-library-model`), so findings that need the same data share it. Write the setup to `setup.md` in the evidence folder.
2. **App.** `/run-app` with what you are checking (and `--record`/`--auto` when you have them). `App: not running` → status `blocked` with that reason; stop.
3. **Data.** `/snapshot-db lookup <key> --session <id> --setup <setup.md>`.
   - Found: `/snapshot-db restore <key> …`, read the IDs from its `setup.md`, skip to step 4.
   - None, stale, or the restore failed: run the setup through the app's UI, API or the project's seed scripts, check it took (read the records back), then `/snapshot-db save <key> …`. A setup you cannot complete → `blocked`, naming what is missing.
4. **Reproduce.** Run the steps exactly as written, recording as `/run-app`'s `Record:` line says (video for a flow, screenshots for a state, before and after a state change). Capture the request/response or log line that shows the failure for anything not visible on screen. Take each piece of evidence at the step it belongs to.
5. **Decide.**
   - `reproduced`: the steps show the actual behaviour, not the expected.
   - `not-reproduced`: you ran the trigger and it behaved correctly; say what you ran.
   - `blocked`: you could not get to the trigger (app, data, access, a missing flag); say what is missing.
   - `non-visual`: the failure is real but only shows in data, logs or tests; attach that output and say why a screenshot would not establish it.
   Every status except `reproduced` needs a limitation. Also put in `limitation` anything a reviewer must know: a patched flag, a local-only workaround, a base you did not rerun, `Checkpoint: none`.
6. **`--verify-fix`.** Restore the same checkpoint, run the same steps on the fixed code, and record the "after". The fix holds only if the actual now matches the expected.
7. **Clean up.** Leave the app running. Restore the checkpoint when another reproduction with the same key follows, so one run's writes never leak into the next.

## Writing the record
A reviewer reads the record on a card, often without opening the code. Load `/write-for-reviewers` (Skill tool) before you write it and follow it for every text field: `expected` and `actual` mirror each other, each step is one action in the app's own words, a `limitation` starts with what it means for the reviewer, a `caption` says what the evidence shows in a few words.

## Evidence
- Folder: `--evidence <dir>`, else `$(ai-review path <id> evidence)` with `--session`, else `<scratch>/evidence/` with `scratch` from `ai-review env` (outside the checkout, so a removed worktree keeps its evidence).
- Files: PNG/JPEG/GIF/WebP screenshots (`screenshot`, up to 20 MB), WebM/MP4 video (`video`, up to 200 MB), text logs (`log`/`test`); descriptive names (`s4-category-still-proposed.png`). Screenshots with `mcp__playwright__browser_take_screenshot` and an absolute `filename`; video as `/run-app` describes.
- Always include the checkpoint's `manifest.json` as a `log` on the first step that uses the data (caption: "DB checkpoint after setup: <db>, <time>, saved|restored"). Never the dump.

## Report
Return the record in this shape (the `reproduction` object of a PR review finding), then two summary lines last in your answer:

```json
{
  "status": "reproduced | not-reproduced | blocked | non-visual",
  "revision": "<head sha>",
  "environment": "<app URL, how it ran, data, browser; the checkout path and runtime label from ai-review env>",
  "prerequisites": ["<setup facts, checkpoint folder and its Restore: command>"],
  "steps": [{ "id": "s1", "instruction": "<one action or check>" }],
  "expected": "<what should happen>",
  "actual": "<what happened>",
  "limitation": "<what a reviewer must know> | null",
  "evidence": [{ "path": "<relative to the evidence folder>", "kind": "screenshot | video | log | test", "caption": "<what it shows>", "stepId": "s1", "capturedAt": "<ISO time>", "revision": "<head sha>" }]
}
```

`Reproduction: <status> (<one line why>)`
`Checkpoint: <folder> (saved|restored) | none: <reason>`

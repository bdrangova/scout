---
name: publish-test-plan
description: Publish the test plan of a feature-test run to the Scout dashboard (/t/<id>) by writing the plan's part of the run's test-run.json index (title, feature, area, scenario skeleton with steps, plan summary and test-split panels). Use when the user runs /publish-test-plan, or says "publish the test plan" for a folder under a plans/**/test-runs/ run.
argument-hint: "<run-folder> [--auto]"
allowed-tools: Bash(ai-review *) Bash(git rev-parse *) Bash(ls *) Bash(wc *) Bash(shasum *) Bash(mv *) Read Glob Grep Write AskUserQuestion
---
# Publish the test plan: $0

Arguments: $ARGUMENTS

Run folder state: !`ls -1 "$0"`

## How the dashboard works
A feature-test run is a folder (`<feature>/<area>/test-runs/<run>/`). The dashboard shows it from one index file, `<run>/test-run.json`, that three skills fill in together: `/publish-test-plan` (this one), `/publish-data-setup` and `/publish-test-run`. Each skill owns some keys and leaves all other keys exactly as they are. The dashboard reads the run folder live; there is nothing to upload and nothing to commit.

Paths inside the index are refs, `alias:relative/path`, where the alias is a key of `roots`. Standard roots: `{ "run": ".", "plan": "../..", "bugs": "../../bugs" }` (relative to the run folder: `plan` is the folder holding `test-plan.md`, `bugs` the sibling `bugs/` folder). Adjust `plan` when the plan lives elsewhere. `..` is allowed only as a leading chain in a root, never inside a ref.

## Rules
- Resolve `$0` to an absolute run folder first (relative to the current directory). The only file you write is `<run>/test-run.json`, through `<run>/test-run.json.tmp` and `mv`. Never write any other file in the run folder, never commit or stage anything, never touch application code.
- Merge, never overwrite: read the existing `<run>/test-run.json` (if any), change only the keys this skill owns (below), keep every other key and every unknown field as it is.
- With `--auto` in the arguments or `AI_REVIEW_HEADLESS=1` set, never wait for user input: skip step 0 and take your recommendations.
- Do not invent content. Step text comes from the plan; a scenario the plan does not list is not added.

## Keys this skill owns
- `title`, `feature`, `area` (set `title` only when the index has none or the plan heading changed; keep a title the user edited otherwise), `updatedAt`, `roots.plan`, `roots.run` (always `"."`).
- `scenarios[]`: `id`, `title`, `order` and the planned `steps` of every scenario in the plan. `status: "planned"` only for a scenario that is new to the index; never change the status, `layers`, `evidence`, `logs`, `links` or `notes` of an existing scenario. When an existing scenario already has steps with `observed`/`result` (written by `/publish-test-run`), update only `action`/`expected` of the steps with the same position and keep `observed`/`result`.
- `overview` panels titled `Plan summary` and `Test split` (replace those two by title, keep every other panel; keep the order `Plan summary`, `Test split`, then the panels of the other skills).
- `publishedBy.plan` = `{ "at": "<ISO now>", "hashes": { "<plan file ref>": "<first 16 hex of shasum -a 256>" } }`.

## Index skeleton (when no `test-run.json` exists)
```json
{ "schemaVersion": 1, "runId": "<run folder name>", "title": "<plan title>", "feature": "<feature>", "area": "<area>",
  "createdAt": "<ISO now>", "updatedAt": "<ISO now>", "publishedBy": {},
  "roots": { "run": ".", "plan": "../.." }, "pages": [], "overview": [], "scenarios": [] }
```
`feature` and `area` are the two folder names above `test-runs/` (`change-summary/diffing/test-runs/2026-10-21-diffing` gives `change-summary` and `diffing`), or `null` when the path has no such shape.

## Steps
0. **Choices.** Skip with `--auto` or `AI_REVIEW_HEADLESS=1`. Otherwise find the plan first (step 2) and ask once with AskUserQuestion: "Use these recommendations?" with options "Accept all (Recommended)" and "Let me choose", both with a `preview` listing the plan file, the `plan` root, the scenario ids you found, and the panels you would write. On "Let me choose", ask only about what is unclear: the plan file when there are several candidates, the `plan` root, scenario ids to leave out.
1. **Session.** Run
   `ai-review init --kind test-run --run "<run>" --repo "$(git rev-parse --show-toplevel)" --agent-session "${CLAUDE_SESSION_ID}" --format json`
   and note `id` and `url` (the dashboard is `/t/<id>`). It reuses the session of this run folder. If it fails because the run folder is outside the repository, stop and tell the user.
2. **Find the plan.** Look for `test-plan.md` in the run folder, then `../`, then `../..` (`ls`, Glob). Read it fully. If none exists, stop and say so. Choose `roots.plan` so that `plan:test-plan.md` resolves to it (usually `../..`).
3. **Scenarios.** Build one entry per scenario of the plan's scenario table or `S<N>` headings. `id` is the plan's own id (`S1`, `S2`, ...; it must match `^[A-Za-z][\w-]*$` and be unique), `title` its name, `order` the position in the plan (0-based). `steps` come from the scenario's rows: `{ "label": "<step number or name>", "action": "<what to do>", "expected": "<what should happen>" }`. When the plan only has one line per scenario, write a single step from it. Keep text plain, short and in the plan's words.
4. **Panels.**
   - `Plan summary`: `{ "type": "markdown", "title": "Plan summary", "span": 2, "markdown": "<the plan's Summary section as written, trimmed to what fits on one screen; end with: Source: plan:test-plan.md>" }`. Also add `{ "type": "links", "title": "Plan", "items": [{ "label": "Test plan", "ref": "plan:test-plan.md" }] }` after it when the dashboard should link the file.
   - `Test split`: when the plan has a table of layers or the test split, `{ "type": "table", "title": "Test split", "span": 2, "columns": [...], "rows": [[...]] }` copied from it (numbers and text only). Skip the panel when there is no such table, and remove an old `Test split` panel then.
5. **Write.** Merge into the existing index (or the skeleton) as described, then write the whole object, 2-space indented, to `<run>/test-run.json.tmp` and `mv <run>/test-run.json.tmp <run>/test-run.json`.
6. **Validate.** Run `ai-review run-index validate "<run>"`. On errors, fix the file (same temp file and `mv`) and run it again. Missing-file warnings for evidence that the run has not produced yet are fine; mention them.
7. **Report.** Print the dashboard URL `/t/<id>` (from step 1) and a short table: scenario id, title, number of steps, status (new, kept). Say which keys changed and that nothing else was touched.

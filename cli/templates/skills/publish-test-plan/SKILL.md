---
name: publish-test-plan
description: Publish the test plan of a feature-test run to the Scout dashboard (/t/<id>) by writing the plan's part of the run's test-run.json index (title, feature, area, scenario skeleton with steps, plan summary and test-split panels). Use when the user runs /publish-test-plan, or says "publish the test plan" for a folder under a plans/**/test-runs/ run.
argument-hint: "<run-folder> [--auto]"
allowed-tools: Bash(ai-review *) Bash(git rev-parse *) Bash(ls *) Read Glob Grep Write AskUserQuestion
---
# Publish the test plan: $0

Arguments: $ARGUMENTS

Run folder state: !`ls -1 "$0"`

## How the dashboard works
A feature-test run is a folder (`<feature>/<area>/test-runs/<run>/`). The dashboard shows it from one index file, `<run>/test-run.json`, that three skills fill in together: `/publish-test-plan` (this one), `/publish-data-setup` and `/publish-test-run`. Each skill owns some keys and leaves all other keys exactly as they are. The dashboard reads the run folder live; there is nothing to upload and nothing to commit.

Paths inside the index are refs, `alias:relative/path`, where the alias is a key of `roots`. Standard roots: `{ "run": ".", "plan": "../..", "bugs": "../../bugs" }` (relative to the run folder: `plan` is the folder holding `test-plan.md`, `bugs` the sibling `bugs/` folder). Adjust `plan` when the plan lives elsewhere. `..` is allowed only as a leading chain in a root, never inside a ref.

## Rules
- Resolve `$0` to an absolute run folder first (relative to the current directory).
- Write the index only with `ai-review run-index merge "<run>" --owner plan --from <patch.json>` (the patch in your scratch folder, never in the run folder). It creates the index when there is none, keeps every key this skill does not own, refuses keys it does not own, sets `updatedAt` and `publishedBy.plan`, validates, and writes nothing when there are errors. Never edit `test-run.json` by hand, never write any other file in the run folder, never commit or stage anything, never touch application code.
- With `--auto` in the arguments or `AI_REVIEW_HEADLESS=1` set, never wait for user input: skip step 0 and take your recommendations.
- Do not invent content. Step text comes from the plan; a scenario the plan does not list is not added.

## The patch
`{ "title", "feature", "area", "roots": { "plan": "../.." }, "scenarios": [{ "id", "title", "order", "steps" }], "overview": [<Plan summary>, <Plan>, <Test split>], "removePanels": [], "hashes": { "plan:test-plan.md": "<from ai-review run-index scan --owner plan>" } }`
- `title` only when the index has none or the plan heading changed (keep a title the user edited). `feature`/`area`: the two folder names above `test-runs/` (`change-summary/diffing/test-runs/2026-10-21-diffing` gives `change-summary` and `diffing`), or `null`.
- The merge keeps everything `/publish-test-run` wrote: a new scenario starts `planned`, an existing one keeps its status and evidence, and a step that already has a result only takes your new `action`/`expected`.

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
5. **Write.** `ai-review run-index scan "<run>" --owner plan --json` for the plan's hash, put it in the patch, then `ai-review run-index merge "<run>" --owner plan --from <patch.json>`. On errors, fix the patch and run it again. Missing-file warnings for evidence the run has not produced yet are fine; mention them. No `Test split` table in the plan: list `Test split` in `removePanels`.
6. **Report.** Print the dashboard URL `/t/<id>` (from step 1) and a short table: scenario id, title, number of steps, status (new, kept). Say which keys changed and that nothing else was touched.

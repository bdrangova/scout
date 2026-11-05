---
name: scout-test-plan
description: Publish the test plan of a feature-test run to the Scout dashboard (/t/<id>) by writing the plan's part of the run's test-run.json index (title, feature, area, scenario skeleton with steps, plan summary and test-split panels). Use when the user runs /scout-test-plan, or says "publish the test plan".
argument-hint: "<session id> [--auto]"
allowed-tools: Bash(scout *) Bash(git rev-parse *) Bash(ls *) Read Glob Grep Write AskUserQuestion Skill
---
# Publish the test plan: $0

Arguments: $ARGUMENTS

Run folder: !`scout path $0 run`

`$0` is the test-run session id (see `/test-run-index`); `<run>` below is the run folder above.

## Rules
- Load `/test-run-index` and `/review-choices` (Skill tool) first: they say how the run index, its paths and the merge work, and how step 0 and auto mode go. This skill writes as owner `plan`.
- Never write any other file in the run folder.
- Step text comes from the plan; a scenario the plan does not list is not added.

## The patch
`{ "title", "feature", "area", "scenarios": [{ "id", "title", "order", "steps" }], "overview": [<Plan summary>, <Plan>, <Test split>], "removePanels": [], "hashes": { "plan:test-plan.md": "<from scout run-index scan --owner plan>" } }`
- `title` only when the index has none or the plan heading changed (keep a title the user edited). `feature`/`area`: the two folder names above `test-runs/` (`change-summary/diffing/test-runs/2026-10-21-diffing` gives `change-summary` and `diffing`), or `null`.
- The merge keeps everything `/scout-test-run` wrote: a new scenario starts `planned`, an existing one keeps its status and evidence, and a step that already has a result only takes your new `action`/`expected`.

## Steps
0. **Choices** (`/review-choices`). Find the plan first (step 2). The preview lists the plan file, the scenario ids you found, and the panels you would write. On "Let me choose", ask only about what is unclear: the plan file when there are several candidates, scenario ids to leave out.
1. **Session.** `$0` is the session `/scout-feature-test` opened; its dashboard page is `/t/$0`. `scout status $0 --format brief` prints its URL.
2. **The plan.** `<run>/plan/test-plan.md`. Missing: copy it in with `scout run-file add $0 plan <file>` when the user or the conversation names the plan; otherwise stop and say so. When the original changed since the copy, `scout run-file refresh $0` first. Read it fully.
3. **Scenarios.** Build one entry per scenario of the plan's scenario table or `S<N>` headings. `id` is the plan's own id (`S1`, `S2`, ...; it must match `^[A-Za-z][\w-]*$` and be unique), `title` its name, `order` the position in the plan (0-based). `steps` come from the scenario's rows: `{ "label": "<step number or name>", "action": "<what to do>", "expected": "<what should happen>" }`. When the plan only has one line per scenario, write a single step from it. Keep text plain, short and in the plan's words.
4. **Panels.**
   - `Plan summary`: `{ "type": "markdown", "title": "Plan summary", "span": 2, "markdown": "<the plan's Summary section as written, trimmed to what fits on one screen; end with: Source: plan:test-plan.md>" }`. Also add `{ "type": "links", "title": "Plan", "items": [{ "label": "Test plan", "ref": "plan:test-plan.md" }] }` after it when the dashboard should link the file.
   - `Test split`: when the plan has a table of layers or the test split, `{ "type": "table", "title": "Test split", "span": 2, "columns": [...], "rows": [[...]] }` copied from it (numbers and text only). Skip the panel when there is no such table, and remove an old `Test split` panel then.
5. **Write.** `scout run-index scan "<run>" --owner plan --json` for the plan's hash, put it in the patch, then `scout run-index merge "<run>" --owner plan --from <patch.json>`. On errors, fix the patch and run it again. Missing-file warnings for evidence the run has not produced yet are fine; mention them. No `Test split` table in the plan: list `Test split` in `removePanels`.
6. **Report.** Print the dashboard URL `/t/<id>` (from step 1) and a short table: scenario id, title, number of steps, status (new, kept). Say which keys changed and that nothing else was touched.

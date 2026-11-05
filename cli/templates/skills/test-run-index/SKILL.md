---
name: test-run-index
description: How a feature-test run becomes the Scout dashboard page /t/<id> - the run folder inside the Scout session, the test-run.json index, its path refs and roots, which skill owns which keys, copying the plan and bugs in, and how to write a patch. Loaded by scout-feature-test, scout-test-plan, scout-data-setup, scout-test-run and scout-apply-test-review before they read or write a run.
user-invocable: false
---
# The test-run index

## Where a run lives
A run belongs to a Scout test-run session and lives in its folder, never in the repository: `ai-review path <id> run` prints it (it moves with the session when the session is archived). `/scout-feature-test` opens the session:
`ai-review init --kind test-run --repo "$(git rev-parse --show-toplevel)" --title "<title>" --agent-session "${CLAUDE_SESSION_ID}" --format json` (`--session <id>` reuses an existing run). Note `id`, `url` and `run`; the dashboard page is `/t/<id>`. The session is linked to the checkout given as `--repo`.

The skills below take the session id. Given a run folder instead, the id is the name of the folder above `run/`.

## The run folder
`steps.md`, `logs/`, `scenarios/s<N>-<slug>/{videos,screenshots,data}`, `data-setup/{videos,screenshots}`, optional `db-snapshots/`, plus copies of the plan (`plan/test-plan.md`) and of bugs (`bugs/<slug>/`). Copy files in only with:
- `ai-review run-file add <id> plan <file>`: the test plan, always stored as `plan/test-plan.md`.
- `ai-review run-file add <id> bug <folder>`: a bug folder from the repository, stored as `bugs/<folder name>/`.
- `ai-review run-file refresh <id>`: copy every recorded source again when it changed.
Bugs found by the run itself are written straight into `bugs/<slug>/`.

## The index
The dashboard shows the run from `<run>/test-run.json`. Three skills fill it in, each owning some keys and leaving every other key exactly as it is:
- `/scout-test-plan` (owner `plan`): title, feature, area, the scenario skeleton with steps, the plan panels.
- `/scout-data-setup` (owner `data-setup`): `dataSetup` and the Data setup page.
- `/scout-test-run` (owner `run`): per-scenario status, layers, step results, evidence, logs, gaps, bugs, the results panels.

The dashboard reads the run folder live. A reviewer's verdict on a scenario is pinned to its evidence list and step text, so changed evidence shows as "updated since your verdict".

## Paths
Paths inside the index are refs, `alias:relative/path`, where the alias is a key of `roots`. Roots are `{ "run": ".", "plan": "plan", "bugs": "bugs" }`: every root and every ref stays inside the run folder (no `/` at the start, no `..`). Examples: `run:scenarios/s1-truncation/videos/test-1-truncation-1.mp4`, `plan:test-plan.md`, `bugs:contact-risk-raw-json/contact-risk-raw-json.md`.

## Rules
- Write the index only with `ai-review run-index merge "<run>" --owner <owner> --from <patch.json>`, the patch in your scratch folder, never in the run folder. It keeps every key the owner does not own, refuses keys it does not own, sets `updatedAt` and `publishedBy.<owner>`, validates, and writes nothing when there are errors. Fix the patch and rerun on errors; read the warnings and fix missing files that are your mistake (wrong path, wrong alias).
- Never edit `test-run.json` by hand. Never commit or stage anything, never touch application code.
- Do not invent content. Report only what the plan and the run's files say.
- Put the `hashes` from `ai-review run-index scan "<run>" --owner <owner> --json` in every patch, so the next publish knows what changed.
- `ai-review run-index show "<run>" --format brief` prints the index as it is now.

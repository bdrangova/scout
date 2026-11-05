---
name: test-run-index
description: How a feature-test run folder becomes the Scout dashboard page /t/<id> - the test-run.json index, its path refs and roots, which skill owns which keys, how to open the session and how to write a patch. Loaded by scout-test-plan, scout-data-setup, scout-test-run and scout-apply-test-review before they read or write a run.
user-invocable: false
---
# The test-run index

## How the dashboard works
A feature-test run is a folder (`<feature>/<area>/test-runs/<run>/` with `steps.md`, `logs/`, `scenarios/s<N>-<slug>/{videos,screenshots,data}`, `data-setup/`, optional `db-snapshots/`), next to `../../test-plan.md` and `../../bugs/<slug>/`. The dashboard shows it from one index file, `<run>/test-run.json`. Three skills fill it in together, each owning some keys and leaving every other key exactly as it is:
- `/scout-test-plan` (owner `plan`): title, feature, area, the scenario skeleton with steps, the plan panels.
- `/scout-data-setup` (owner `data-setup`): `dataSetup` and the Data setup page.
- `/scout-test-run` (owner `run`): per-scenario status, layers, step results, evidence, logs, gaps, bugs, the results panels.

The dashboard reads the run folder live; there is nothing to upload and nothing to commit. A reviewer's verdict on a scenario is pinned to its evidence list and step text, so changed evidence shows as "updated since your verdict".

## Paths
Paths inside the index are refs, `alias:relative/path`, where the alias is a key of `roots`: no leading `/`, no `..` segment. Standard roots: `{ "run": ".", "plan": "../..", "bugs": "../../bugs" }`, relative to the run folder (`plan` is the folder holding `test-plan.md`, `bugs` the sibling `bugs/` folder). `..` is allowed only as a leading chain in a root. Adjust a root when the plan or the bugs live elsewhere (ask unless `--auto`). Examples: `run:scenarios/s1-truncation/videos/e2e-test-1-truncation-1.mp4`, `bugs:change-summary-contact-risk-raw-json/change-summary-contact-risk-raw-json.md`.

## Rules
- Resolve the run argument to an absolute run folder first (relative to the current directory).
- Write the index only with `ai-review run-index merge "<run>" --owner <owner> --from <patch.json>`, the patch in your scratch folder, never in the run folder. It creates the index when there is none, keeps every key the owner does not own, refuses keys it does not own, sets `updatedAt` and `publishedBy.<owner>`, validates, and writes nothing when there are errors. Fix the patch and rerun on errors; read the warnings and fix missing files that are your mistake (wrong path, wrong alias).
- Never edit `test-run.json` by hand. Never commit or stage anything, never touch application code.
- Do not invent content. Report only what the plan and the run's files say.
- Put the `hashes` from `ai-review run-index scan "<run>" --owner <owner> --json` in every patch, so the next run knows what changed.

## Open the session
`ai-review init --kind test-run --run "<run>" --repo "$(git rev-parse --show-toplevel)" --agent-session "${CLAUDE_SESSION_ID}" --format json`
Note `id` and `url`; the dashboard page is `/t/<id>`. It reuses the session of this run folder. If it fails because the run folder is outside the repository, stop and tell the user.

`ai-review path <session id> run` prints the run folder of an existing session; `ai-review run-index show "<run>" --format brief` prints the index as it is now.

---
name: scout-test-run
description: Publish the results of a feature-test run to the Scout dashboard (/t/<id>) by writing the run's part of test-run.json (per-scenario status, layers, steps, video and screenshot evidence, log excerpts, gaps, bugs, run-level overview panels). Rerunning refreshes only the scenarios whose sources changed and reports which verdicts are now stale. Use when the user runs /scout-test-run, or after /feature-test finished, to review the run in the dashboard.
argument-hint: "<session id> [--auto]"
allowed-tools: Bash(ai-review *) Bash(git rev-parse *) Bash(ls *) Read Glob Grep Write AskUserQuestion Skill
---
# Publish the test run: $0

Arguments: $ARGUMENTS

Run folder: !`ai-review path $0 run`

`$0` is the test-run session id (see `/test-run-index`); `<run>` below is the run folder above.

## Rules
- Load `/test-run-index` and `/review-choices` (Skill tool) first: they say how the run index, its paths and the merge work, and how step 0 and auto mode go. This skill writes as owner `run`.
- Never edit `steps.md`, logs or bug files by hand.
- If a scenario's result is not in any file, its status stays what it was (or `planned` when new); never guess a verdict.

## The patch
`{ "scenarios": [{ "id", "status", "layers", "steps", "evidence", "logs", "links", "notes" }], "gaps": [], "bugs": [], "logs": [], "pages": ["gaps", "logs"], "overview": [<Results>, <Layer results>, <Run notes and deviations>, <Scenarios>], "removePanels": [], "hashes": { … } }`
- Only the scenarios you change. A scenario new to the index also takes `title` and `order` (from the scenario table of `steps.md`); suggest `/scout-test-plan` for the step text when there was no plan-published index.
- `pages`: `gaps` when there are gaps or bugs, `logs` when there are logs (the scan's `logs`). The merge never drops the others.
- Steps merge by position over the plan's: send `observed`/`result` (and the run's own `action`/`expected` when its steps differ).

## Reading the run (tolerate irregular runs)
`ai-review run-index scan "<run>" --owner run --json` does the mechanical part. It maps `scenarios/*` folders to `S<N>` ids (case-insensitive; `_`-prefixed and `-superseded` folders are old evidence, folders that match no id are `ignored`). It lists each scenario's `evidence` (videos, screenshots without `raw/`, data, with `layer` from the `l1-`/`l3-`/`e2e-` prefix and a caption from the file name) and its `logExcerpts`, plus the run's `logs`, the `hashes` of every source and the `diff` since the last publish. Use those as they are. Improve a caption only from the run's own text, and add `atSec` only when a file states the video time of a step (`Video @0:42`, `[00:42]`); never estimate. The rest needs reading:
- **Scenario ids.** The run's scenario table in `steps.md` (a "Scenario index" table with rows `S1`, `S2`, ... and a column per layer such as L1-2, L3, L4 E2E) is the primary source. `steps.md` may have no `## S<N>:` headings, and the per-step detail may live in `logs/*.md` (for example `logs/layer4-e2e-results.md`) or only in the plan. Use whichever file has the text for a scenario, and take the plan's steps when none has.
- **Superseded.** A scenario with `onlySuperseded: true` gets `status: "na"` and a `notes` line "superseded", with the reason if a file gives one.
- **Status.** Map the run's words to `pass`, `fail`, `uncertain`, `gap`, `na`, `blocked`, `planned`: PASS/green is `pass`; FAIL/red is `fail`; "GAP-CONFIRMED", "confirmed gap", "known gap" is `gap`; N/A or "not built" is `na`; blocked/aborted is `blocked`; blue/unclear/needs product input is `uncertain`. When layers disagree, the scenario status is the worst real result among the layers that ran (`fail` > `gap` > `uncertain` > `blocked` > `pass`; `na` layers do not count).
- **Layers.** When the run reports per-layer results, write `layers: [{ "name": "L1-2", "status": "pass", "note": "<observed, short>" }, ...]` with the same short names as the scan's `layer`. Omit `layers` when the run has a single layer. A layer that did not run for a scenario ("—") is left out.
- **Steps.** `steps: [{ "label", "action", "expected", "observed", "result" }]` from the scenario's rows (Action / Expected / Observed / Result). If the run only has one summary line ("Observed" column), put it in `observed` of a single step, or in `notes`.
- **Gaps.** Run-level `gaps: [{ "id": "G1", "title", "status", "scenarios": ["S16"], "markdown"? }]` from the plan's known-gaps table (id, title) plus the status column of the `## Gaps` table in `steps.md` (for example "Confirmed in server diff; not reachable on PRC"). `scenarios` = ids whose folder or evidence the gap row names, plus scenarios whose results mention the gap id. Set each linked scenario's `links.gaps`. `markdown` holds the evidence cell or a short note.
- **Bugs.** For each folder in `<run>/bugs/<slug>/` (bugs the run found, and repository bugs copied in with `ai-review run-file add $0 bug <folder>`) that this run refers to (the slug, its ticket key or its scenario ids appear in `steps.md`, `logs/*.md` or the plan; when unsure which bugs belong, ask unless `--auto`, and with `--auto` include only the referenced ones), add `{ "slug", "title", "path": "bugs:<slug>/<main>.md", "jira"?, "screenshots": ["bugs:<slug>/screenshots/..."], "scenarios": ["S10"] }`. `title` is the first `#` heading of the main markdown file (the `.md` named like the folder; else the first `.md` that does not start with `opened-` or `jira-ticket`). `jira` is the ticket key from a file named `opened-QI-<n>-jira-ticket.md` (`QI-<n>`), or from the text of `jira-ticket.md` when it holds a key; a `jira-ticket.md` without a key (a draft) gives `"draft"`. `scenarios` = ids named in the bug file or in the run's text. Set each linked scenario's `links.bugs` to the slug.
- **Overview panels.**
  - `Results`: `{ "type": "stats", "title": "Results", "span": 2, "items": [{ "label": "Pass", "value": 18, "tone": "good" }, { "label": "Fail", ..., "tone": "bad" }, { "label": "Gap", "tone": "warn" }, { "label": "N/A", "tone": "neutral" }, ...] }` with counts over all scenarios (include Uncertain/Blocked/Planned only when non-zero), plus `{ "label": "Bugs", "value": N }` and `{ "label": "Gaps", "value": N }` when any.
  - `Layer results`: only when the run has layers: `{ "type": "table", "title": "Layer results", "span": 2, "columns": ["Layer", "Run", "Result", "Detail"], "rows": [...] }` from the run summary's layer table.
  - `Run notes and deviations`: `{ "type": "key-value", "title": "Run notes and deviations", "span": 2, "items": [{ "key": "<short title> (S9, S10)", "value": "<one or two sentences>" }] }` from the "Run notes" and deviations of `steps.md` and the layer notes, each with the scenario ids it concerns in the key. Use a `markdown` panel instead when the notes do not split into items.
  - `Scenarios`: `{ "type": "scenario-list", "title": "Scenarios", "span": 2 }`.

## Steps
0. **Choices** (`/review-choices`). Read the run first (steps 2-3). The preview lists scenarios found, folders mapped and ignored, bugs included, gaps, and whether this is a first publish or a refresh (and which scenarios changed). On "Let me choose" ask only what is unclear: which bugs belong to this run, which repository bug folders to copy in, how to treat a superseded folder.
1. **Session.** `$0` is the session `/scout-feature-test` opened; its dashboard page is `/t/$0`. `ai-review status $0 --format brief` prints its URL.
2. **Scan.** `ai-review run-index scan "<run>" --owner run --json`. Its `diff` is the changed set: `first: true` means everything; otherwise the `changed`, `added` and `dropped` sources.
3. **Read and derive** as described in "Reading the run". Refresh rule: when a shared text file (`steps.md`, `logs/*.md`, the plan) changed, re-derive `status`, `layers`, `steps`, `notes` and gaps for all scenarios, but put a scenario in the patch only when its derived values differ from the index. Take new evidence and log excerpts only for scenarios whose own folder files (or `logs/*.log`) changed. If nothing changed, write nothing and say so in step 5.
4. **Write.** Build the patch (above) with the scan's `hashes`, then `ai-review run-index merge "<run>" --owner run --from <patch.json>`. Fix errors and rerun; read the warnings and fix missing files that are your mistake (wrong path, wrong alias).
5. **Report.** Print the dashboard URL `/t/<id>`, then a table: scenario id, status, layers, evidence counts (videos/screenshots), whether it was changed, added or kept. List the scenarios whose status, steps or evidence changed on a refresh as "verdicts now stale": the reviewer's verdict on them shows as updated since the verdict. Add: folders ignored, bugs included, files that were referenced but missing, and anything you could not map.

---
name: publish-data-setup
description: Publish the data setup of a feature-test run to the Scout dashboard (/t/<id>) by writing the dataSetup key of the run's test-run.json index (data steps, setup videos and screenshots, DB snapshot path) and adding the Data setup page. Use when the user runs /publish-data-setup, or says "publish the data setup" for a plans/**/test-runs/ run folder.
argument-hint: "<run-folder> [--auto]"
allowed-tools: Bash(ai-review *) Bash(git rev-parse *) Bash(ls *) Read Glob Grep Write AskUserQuestion
---
# Publish the data setup: $0

Arguments: $ARGUMENTS

Run folder state: !`ls -1 "$0"`

## How the dashboard works
A feature-test run is a folder. The dashboard shows it from one index file, `<run>/test-run.json`, that three skills fill in together: `/publish-test-plan`, `/publish-data-setup` (this one) and `/publish-test-run`. Each skill owns some keys and leaves all other keys exactly as they are. The dashboard reads the run folder live; there is nothing to upload and nothing to commit.

Paths inside the index are refs, `alias:relative/path`, where the alias is a key of `roots`. Standard roots: `{ "run": ".", "plan": "../..", "bugs": "../../bugs" }` (relative to the run folder). Videos and screenshots of the data setup are refs under `run:data-setup/...`.

## Rules
- Resolve `$0` to an absolute run folder first.
- Write the index only with `ai-review run-index merge "<run>" --owner data-setup --from <patch.json>` (the patch in your scratch folder, never in the run folder). It creates the index when there is none, keeps every key this skill does not own, refuses keys it does not own, sets `updatedAt` and `publishedBy.dataSetup`, validates, and writes nothing when there are errors. Never edit `test-run.json` by hand, never write any other file in the run folder, never commit or stage anything, never touch application code.
- With `--auto` in the arguments or `AI_REVIEW_HEADLESS=1` set, never wait for user input: skip step 0 and take your recommendations.
- Do not invent content. A step you cannot source from the plan or the run's notes is left out.

## The patch
`{ "dataSetup": { "steps": Step[], "videos": Evidence[], "screenshots": Evidence[], "snapshotPath"?: string, "notes"?: string }, "pages": ["data-setup"], "hashes": { … } }` (`Step` = `{ label?, action?, expected?, observed?, result? }`, `Evidence` = `{ path: "run:...", caption? }`). `"dataSetup": null` with `"removePages": ["data-setup"]` removes the page. With no index yet, the merge creates one; suggest `/publish-test-plan` next.

## Steps
0. **Choices.** Skip with `--auto` or `AI_REVIEW_HEADLESS=1`. Otherwise gather the sources first (step 2), then ask once with AskUserQuestion: "Use these recommendations?" with "Accept all (Recommended)" and "Let me choose", both with a `preview` listing the data steps, the number of videos and screenshots, and the snapshot path. On "Let me choose", ask which data steps to include, whether to list the files under `data-setup/_aborted-*` (recommend no), and which snapshot.
1. **Session.** Run
   `ai-review init --kind test-run --run "<run>" --repo "$(git rev-parse --show-toplevel)" --agent-session "${CLAUDE_SESSION_ID}" --format json`
   and note `id` and `url` (the dashboard is `/t/<id>`).
2. **Sources.** `ai-review run-index scan "<run>" --owner data-setup --json`: its `dataSetup` has the videos and screenshots under `data-setup/` (aborted `_` attempts left out, `.mp4` preferred) with captions from the file names, the newest `db-snapshots/` entry as `snapshotPath`, and the `hashes`. Then read the plan's test-data table (rows like `D1`, `D2`) and the data-setup notes in `<run>/steps.md` and `<run>/logs/*.md` (sections named "Data setup", `D1`, `D2`, ...).
3. **Steps.** One step per data item: `label` = the data id (`D1`), `action` = what was set up (record, user, flags; from the plan), `expected` = what the plan says it should look like, `observed`/`result` = what the notes report (deviations included, e.g. "Component Qualified set to Pending instead of Yes"). Notes that belong to the whole setup go to `notes` (markdown, short).
4. **Media.** Take `videos`, `screenshots` and `snapshotPath` from the scan. Improve a caption only when the notes name the thing better than the file name (`PRC-3` rather than `Prc3`). List `_aborted-*` files only when the user chose to.
5. **Write.** Put the scan's `hashes` in the patch and run `ai-review run-index merge "<run>" --owner data-setup --from <patch.json>`; fix errors and rerun. Report missing-file warnings.
6. **Report.** Print the dashboard URL `/t/<id>` and a short table: data id, what was set up, result. Say that only the data setup and its page changed.

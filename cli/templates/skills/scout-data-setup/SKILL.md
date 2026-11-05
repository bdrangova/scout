---
name: scout-data-setup
description: Publish the data setup of a feature-test run to the Scout dashboard (/t/<id>) by writing the dataSetup key of the run's test-run.json index (data steps, setup videos and screenshots, DB snapshot path) and adding the Data setup page. Use when the user runs /scout-data-setup, or says "publish the data setup".
argument-hint: "<session id> [--auto]"
allowed-tools: Bash(ai-review *) Bash(git rev-parse *) Bash(ls *) Read Glob Grep Write AskUserQuestion Skill
---
# Publish the data setup: $0

Arguments: $ARGUMENTS

Run folder: !`ai-review path $0 run`

`$0` is the test-run session id (see `/test-run-index`); `<run>` below is the run folder above.

## Rules
- Load `/test-run-index` and `/review-choices` (Skill tool) first: they say how the run index, its paths and the merge work, and how step 0 and auto mode go. This skill writes as owner `data-setup`.
- Never write any other file in the run folder.
- A step you cannot source from the plan or the run's notes is left out.

## The patch
`{ "dataSetup": { "steps": Step[], "videos": Evidence[], "screenshots": Evidence[], "snapshotPath"?: string, "notes"?: string }, "pages": ["data-setup"], "hashes": { … } }` (`Step` = `{ label?, action?, expected?, observed?, result? }`, `Evidence` = `{ path: "run:...", caption? }`). `"dataSetup": null` with `"removePages": ["data-setup"]` removes the page. With no index yet, the merge creates one; suggest `/scout-test-plan` next.

## Steps
0. **Choices** (`/review-choices`). Gather the sources first (step 2). The preview lists the data steps, the number of videos and screenshots, and the snapshot path. On "Let me choose", ask which data steps to include, whether to list the files under `data-setup/_aborted-*` (recommend no), and which snapshot.
1. **Session.** `$0` is the session `/scout-feature-test` opened; its dashboard page is `/t/$0`. `ai-review status $0 --format brief` prints its URL.
2. **Sources.** `ai-review run-index scan "<run>" --owner data-setup --json`: its `dataSetup` has the videos and screenshots under `data-setup/` (aborted `_` attempts left out, `.mp4` preferred) with captions from the file names, the newest `db-snapshots/` entry as `snapshotPath`, and the `hashes`. Then read the plan's test-data table (rows like `D1`, `D2`) and the data-setup notes in `<run>/steps.md` and `<run>/logs/*.md` (sections named "Data setup", `D1`, `D2`, ...).
3. **Steps.** One step per data item: `label` = the data id (`D1`), `action` = what was set up (record, user, flags; from the plan), `expected` = what the plan says it should look like, `observed`/`result` = what the notes report (deviations included, e.g. "Component Qualified set to Pending instead of Yes"). Notes that belong to the whole setup go to `notes` (markdown, short).
4. **Media.** Take `videos`, `screenshots` and `snapshotPath` from the scan. Improve a caption only when the notes name the thing better than the file name (`PRC-3` rather than `Prc3`). List `_aborted-*` files only when the user chose to.
5. **Write.** Put the scan's `hashes` in the patch and run `ai-review run-index merge "<run>" --owner data-setup --from <patch.json>`; fix errors and rerun. Report missing-file warnings.
6. **Report.** Print the dashboard URL `/t/<id>` and a short table: data id, what was set up, result. Say that only the data setup and its page changed.

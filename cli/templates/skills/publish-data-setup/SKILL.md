---
name: publish-data-setup
description: Publish the data setup of a feature-test run to the review-dash dashboard (/t/<id>) by writing the dataSetup key of the run's test-run.json index (data steps, setup videos and screenshots, DB snapshot path) and adding the Data setup page. Use when the user runs /publish-data-setup, or says "publish the data setup" for a plans/**/test-runs/ run folder.
argument-hint: "<run-folder> [--auto]"
allowed-tools: Bash(ai-review *) Bash(git rev-parse *) Bash(ls *) Bash(wc *) Bash(shasum *) Bash(mv *) Read Glob Grep Write AskUserQuestion
---
# Publish the data setup: $0

Arguments: $ARGUMENTS

Run folder state: !`ls -1 "$0"`

## How the dashboard works
A feature-test run is a folder. The dashboard shows it from one index file, `<run>/test-run.json`, that three skills fill in together: `/publish-test-plan`, `/publish-data-setup` (this one) and `/publish-test-run`. Each skill owns some keys and leaves all other keys exactly as they are. The dashboard reads the run folder live; there is nothing to upload and nothing to commit.

Paths inside the index are refs, `alias:relative/path`, where the alias is a key of `roots`. Standard roots: `{ "run": ".", "plan": "../..", "bugs": "../../bugs" }` (relative to the run folder). Videos and screenshots of the data setup are refs under `run:data-setup/...`.

## Rules
- Resolve `$0` to an absolute run folder first. The only file you write is `<run>/test-run.json`, through `<run>/test-run.json.tmp` and `mv`. Never write any other file in the run folder, never commit or stage anything, never touch application code.
- Merge, never overwrite: read the existing `<run>/test-run.json` (if any), change only the keys this skill owns, keep every other key and unknown field as it is.
- With `--auto` in the arguments or `AI_REVIEW_HEADLESS=1` set, never wait for user input: skip step 0 and take your recommendations.
- Do not invent content. A step you cannot source from the plan or the run's notes is left out.

## Keys this skill owns
- `dataSetup`: `{ "steps": Step[], "videos": Evidence[], "screenshots": Evidence[], "snapshotPath"?: string, "notes"?: string }` (`Step` = `{ label?, action?, expected?, observed?, result? }`, `Evidence` = `{ path: "run:...", caption? }`).
- `pages`: add `"data-setup"` (keep the other entries, no duplicates). Remove it only when you remove `dataSetup`.
- `updatedAt`, `publishedBy.dataSetup` = `{ "at": "<ISO now>", "hashes": { "<source ref or path>": "<first 16 hex of shasum -a 256>" } }` for the files you read (the plan, `steps.md`, the layer notes).

## Index skeleton (when no `test-run.json` exists)
Create it as `/publish-test-plan` does (`schemaVersion: 1`, `runId` = run folder name, `title` = run folder name, `feature`/`area` = the two folder names above `test-runs/` or `null`, `createdAt`, `updatedAt`, `publishedBy: {}`, `roots: { "run": ".", "plan": "../.." }`, `pages: []`, `overview: []`, `scenarios: []`) and suggest running `/publish-test-plan` next.

## Steps
0. **Choices.** Skip with `--auto` or `AI_REVIEW_HEADLESS=1`. Otherwise gather the sources first (step 2), then ask once with AskUserQuestion: "Use these recommendations?" with "Accept all (Recommended)" and "Let me choose", both with a `preview` listing the data steps, the number of videos and screenshots, and the snapshot path. On "Let me choose", ask which data steps to include, whether to list the files under `data-setup/_aborted-*` (recommend no), and which snapshot.
1. **Session.** Run
   `ai-review init --kind test-run --run "<run>" --repo "$(git rev-parse --show-toplevel)" --agent-session "${CLAUDE_SESSION_ID}" --format json`
   and note `id` and `url` (the dashboard is `/t/<id>`).
2. **Sources.** Read the plan's test-data table (rows like `D1`, `D2`; look for `test-plan.md` in the run folder, `../`, `../..`), the data-setup notes in `<run>/steps.md` and in `<run>/logs/*.md` (sections named "Data setup", `D1`, `D2`, ...), and list `<run>/data-setup/` (`ls`, Glob): `videos/`, `screenshots/`, and any other files.
3. **Steps.** One step per data item: `label` = the data id (`D1`), `action` = what was set up (record, user, flags; from the plan), `expected` = what the plan says it should look like, `observed`/`result` = what the notes report (deviations included, e.g. "Component Qualified set to Pending instead of Yes"). Notes that belong to the whole setup go to `notes` (markdown, short).
4. **Media.** `videos` = every video under `data-setup/videos/` (and `.mp4` directly under `data-setup/`), `screenshots` = every image under `data-setup/screenshots/`, as `run:data-setup/...` refs with a short `caption` taken from the file name (`e2e-d1-03-prc3-saved-draft-v1.2.png` gives "D1: PRC-3 saved draft v1.2"). Skip folders and files whose name starts with `_` (aborted attempts) unless the user chose to list them. Prefer `.mp4` over `.webm` when both exist.
5. **Snapshot.** When `<run>/db-snapshots/` has files, `snapshotPath` is the absolute path of the newest file or folder in it (`ls -t`); it is a path on the reviewer's machine, not a ref. Leave the key out when there is none.
6. **Write.** Merge into the existing index (or the skeleton), then write the whole object, 2-space indented, to `<run>/test-run.json.tmp` and `mv` it to `<run>/test-run.json`.
7. **Validate.** Run `ai-review run-index validate "<run>"`; fix errors and rerun. Report missing-file warnings.
8. **Report.** Print the dashboard URL `/t/<id>` and a short table: data id, what was set up, result. Say that only `dataSetup`, `pages`, `updatedAt` and `publishedBy.dataSetup` changed.

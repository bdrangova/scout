---
name: scout-development-review
description: Open (or refresh) a Scout session for the current implementation and fill it with evidence (screenshots, recordings), the Jira snapshot, plan docs, extra artifacts and a PR description so the developer can review the live working tree in the dashboard. Use when the user says "publish for review", "send this to review", runs /scout-development-review, or when a ticket implementation is complete.
argument-hint: "[--ticket KEY[=url]] [--base REF] [--title TEXT] [--new] [--full] [--record video|screenshots|none] [--auto]"
allowed-tools: Bash(ai-review *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git rev-parse *) Bash(npx playwright *) Read Write Edit Glob AskUserQuestion mcp__playwright__* Skill
---
# Publish the current work for review

Repo state: !`git status --short --branch | head -40`
Review session for this branch (if any): !`ai-review status --repo "${CLAUDE_PROJECT_DIR}" --format brief`

Arguments: $ARGUMENTS

## How the dashboard works
The dashboard reads the repository working tree live: every file changed against the base branch
(default `origin/master`, then `master`, `origin/main`, `main`) is shown as it is on disk, including
uncommitted and untracked files. There is no publish or snapshot step. Evidence, spec, extras and the
PR description are plain files you write into the session folder; the dashboard picks them up as
soon as they land and updates while you keep working.

## Rules
- Never commit, stage, stash or modify repository files in this skill. Write only into the session folder returned by step 1.
- Use absolute paths for every file you write. Never write into the repo's `.claude/` or `plans/`.
- If a step's tool is unavailable (no Atlassian connector, no browser tool), skip it and list it under "Not captured" in the PR description.
- **Checking against the app.** Reproduce a problem or verify a fix with `/reproduce` (Skill tool; `--session <sessionId>`, `--verify-fix` for a fix, `--record`/`--auto` when you have them). Only its `reproduced` status or a verified fix counts as verified. Plain captures go through `/capture-evidence` (step 4).
- Step 0 and auto mode follow `/review-choices` (Skill tool).
- Add, replace and remove session files with `ai-review artifact add|remove`, never by hand: it copies the file and keeps the folder's `index.json` in step.
- Load `/write-for-reviewers` (Skill tool) before writing captions and descriptions, and follow it. The helper skills below load it themselves.

## Refresh mode
A first publish writes everything. When step 1 reuses a session (`"reused": true`) and neither `--full` nor the step 0 answer asks for a full rewrite, run `ai-review publish-log diff <id> --json` and refresh only what it reports; this includes the fixes `/scout-apply-review` made. Everything else stays as it is.
- `first: true` (no log yet): publish everything.
- `changed`, `added`, `dropped`: the repository files that moved since the last publish. Empty and nothing in the arguments asks for more: change nothing, and say so in step 8.
- `evidenceToRecapture`, `evidenceToDelete`, `extrasToRegenerate`: from the coverage the last publish logged.
- `refreshedEvidence`: evidence `/scout-apply-review` already re-captured since then. Keep it; update only its caption and description if they no longer match.
Each step below says what it does in refresh mode. Step 9 always rewrites the log.

## Steps
0. **Choices** (`/review-choices`). Before running anything else, work out your proposal for each choice. Base: the session's base, or the default base. Ticket: from the arguments, the branch name or the conversation. Mode: refresh when a session for this branch exists, else new. Spec documents: the plan or spec files you worked from. Evidence: the user-visible changes you would capture. Extras: what you would add. Journal: the files you would summarise and the decisions you would log. The preview lists base, session mode, Jira, spec files, evidence, extras, journal and PR description. On "Let me choose", ask in two calls:
   - Call 1:
     - **Base branch:** your proposal, plus one likely alternative.
     - **Session:** refresh only what changed, full rewrite (`--full`), or a new session (`--new`). Ask this only when a session exists.
     - **Jira:** fetch a snapshot of <KEY>, link only (`# KEY` and the URL), or no Jira. Name the key in the question so the user can correct it.
     - **Spec documents** (multiSelect): one option per candidate file, so the user picks which to include. The first option is "Recommended set: <file names> (Recommended)", which takes every recommended file in one pick; the single files follow. Find candidates first: the plan and spec files you worked from in this conversation (including Claude plan files outside the repo), `.md` files under `plans/`, `docs/` or `specs/` that mention the ticket key or the changed areas, and design artifact HTML you used. Label each option with the file name and describe it with its first heading, its path and why you recommend it or not. Order the recommended files first and mark them "(Recommended)". With more than 3 single files, show the 3 best; the user can name others under Other. Picking none means no spec documents.
   - Call 2:
     - **Evidence:** capture or refresh what you proposed (named briefly), screenshots only, or none.
     - **Extras** (multiSelect): one option per explainer or diagram you would add (for example "Component graph (components.mmd)"), plus any existing `.md` or `.html` in the repo or conversation that would help the reviewer, described the same way as the spec candidates, again led by a "Recommended set" option. Picking none means no extras.
     - **Journal:** fill the gaps (summaries for files without one, decisions not yet logged), summaries only, or leave it alone.
     - **PR description:** write or update it, or leave it alone.
   - Leave out a question the arguments already answer (`--base`, `--ticket`, `--full`, `--new`). A part the user turned off is not listed under "Not captured".
1. **Session.** Run
   `ai-review init --repo "$PWD" --title "<KEY>: <short title>" --ticket <KEY>=<ticket url> --agent-session "${CLAUDE_SESSION_ID}" [--base <REF>] [--new]`
   where KEY comes from the arguments, the branch name or the conversation. It reuses the latest session for this branch, even after an approved review, unless `--new` is given: approved files stay approved and only the files changed since come back for review, the overall decision resets, comments and resolutions stay. An archived session is never reused. Pass `--base <REF>` only when the branch is not based on master. Note the printed `id`, `dir` and `url`.
2. **Jira snapshot.** `/jira-snapshot <KEY>[=<url>] --session <id>` (Skill tool). It saves `jira-<KEY>.md` into the spec folder.
   Refresh mode: skip this step unless the snapshot is missing, the ticket key changed, or the arguments ask for a fresh one.
3. **Spec documents.** For each plan or spec Markdown file you worked from (for example under `plans/`, or the paths the user gave): `ai-review artifact add <id> spec <absolute path> --type markdown --title "<its first heading>"` (it records where the original lives). A design artifact HTML: `ai-review artifact add <id> spec <file> --as design.html --type artifact --title "<design title>" --url <artifact url>`.
   Refresh mode: add a document again only when the original changed since the copy, or when it is new.
4. **Evidence.** For each user-visible change, `/capture-evidence <what to capture> --session <id>` (Skill tool, with `--record` when you have it). Keep the coverage it returns (which repository files each capture covers) for the log in step 9.
   Refresh mode: re-capture `evidenceToRecapture` with `--as <same name>` (skip `refreshedEvidence`), capture new evidence for user-visible changes nothing covers yet, and remove `evidenceToDelete` (`ai-review artifact remove <id> evidence <file>`). Leave every other file untouched.
5. **Extras.** Markdown explainers (`*.md`), artifact HTML (`*.html`) and Mermaid diagrams (`*.mmd`) that help the reviewer (for example a component or data-flow graph): `ai-review artifact add <id> extras <file> --title "<title>"`. Note the files each extra describes, as for evidence.
   Refresh mode: regenerate only `extrasToRegenerate`, and add new ones only for areas none of them cover.
6. **Journal.** `/journal --session <id>` (Skill tool) with no other text: it backfills summaries for changed files and the decisions from this conversation that are not logged yet. Add `--summaries-only` when the user chose summaries only.
   Refresh mode: add `--files <the changed set>`.
7. **PR description.** `/pr-description --session <id>` (Skill tool). `/scout-apply-review` opens the PR from the same file.
   Refresh mode: add `--refresh`, so only the sections the changed set affects are edited and the user's edits stay.
8. Report the dashboard URL printed by step 1, the number of evidence files and anything you could not capture. In refresh mode, list what you refreshed, added and deleted, and say that the rest was kept. Remind the user that the dashboard updates live as files change; there is nothing to publish.
9. **Publish log.** Write the coverage you noted to a JSON file, `{ "evidence": { "trial-bar-admin.png": ["<repo path>"] }, "extras": { "components.mmd": ["<repo path>"] } }` (only the entries you added or changed in refresh mode), and run `ai-review publish-log write <id> --coverage <file>`. It stores the current file hashes and head next to that coverage.

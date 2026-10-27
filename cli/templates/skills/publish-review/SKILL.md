---
name: publish-review
description: Open (or refresh) a review-dash session for the current implementation and fill it with evidence (screenshots, recordings), the Jira snapshot, plan docs, extra artifacts and a PR description so the developer can review the live working tree in the dashboard. Use when the user says "publish for review", "send this to review", runs /publish-review, or when a ticket implementation is complete.
argument-hint: "[--ticket KEY[=url]] [--base REF] [--title TEXT] [--new] [--full] [--record video|screenshots|none] [--auto]"
allowed-tools: Bash(ai-review *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git rev-parse *) Bash(git merge-base *) Bash(git hash-object *) Bash(cp *) Bash(mkdir *) Bash(ls *) Bash(rm *) Bash(npx playwright *) Read Write Edit Glob AskUserQuestion mcp__atlassian__getJiraIssue mcp__atlassian__getAccessibleAtlassianResources mcp__atlassian__atlassianUserInfo mcp__playwright__* Skill
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
- **Running the app.** When a check needs the running app (reproducing what a comment describes, verifying a fix, capturing evidence), invoke `/run-app` first (Skill tool; pass what you need to check, `--record <mode>` when the arguments have one, and `--auto` when you have it). Record the reproduction as its `Record:` line says (Playwright video or screenshots) into `<evidence>/` as in the Evidence step, and cite the files. Never skip a reproduction or a check because the dev server was not running. If it reports `App: not running`, list the capture under "Not captured" with the reason.
- **Reproducing.** To reproduce what a comment describes or verify a fix, use `/reproduce` (Skill tool; `--session <sessionId>`, `--verify-fix` for a fix, `--auto` when you have it) rather than reproducing by hand: it starts the app, restores or sets up the data with a database checkpoint, records the evidence and returns the status. Cite its evidence and limitation in the note; anything but `reproduced` (or a verified fix) is never reported as verified.
- If `AI_REVIEW_HEADLESS=1` is set, never wait for user input: act as if `--auto` were given.
- `rm` only files inside the session folder, never anything in the repository.

## Refresh mode
A first publish writes everything. When step 1 reuses a session (`"reused": true`) that has a
`<dir>/publish-log.json`, and neither `--full` nor the step 0 answer asks for a full rewrite, refresh only what the code changes since the
last publish touched; this includes the fixes `/apply-review` made. Everything else stays as it is.
- **Changed set.** Read `publish-log.json`. List the session's files now: `git diff --name-only $(git merge-base <baseRef> HEAD)` plus the untracked files from `git status --porcelain`. Hash each one with `git hash-object <path>`. The changed set holds the paths whose hash differs from the log, paths new since the log, and paths the log has that dropped out of the diff.
- **Already refreshed.** Evidence that `/apply-review` re-captured after an evidence comment is newer than `publishedAt` (`ls -lT <evidence>`). Keep it as it is and update only its caption and description if they no longer match.
- If the changed set is empty and nothing in the arguments asks for more, change nothing. Say so in step 8.
- Each step below says what it does in refresh mode. Step 9 always rewrites the log.

## Steps
0. **Choices.** Skip this step when the arguments contain `--auto` or `AI_REVIEW_HEADLESS=1` is set; then decide everything yourself as the steps below describe.
   Otherwise, before running anything else, work out your proposal for each choice. Base: the session's base, or the default base. Ticket: from the arguments, the branch name or the conversation. Mode: refresh when a session for this branch exists, else new. Spec documents: the plan or spec files you worked from. Evidence: the user-visible changes you would capture. Extras: what you would add. Journal: the files you would summarise and the decisions you would log. Then ask with AskUserQuestion.
   - **Accept or choose.** Ask one question first: "Use these recommendations?" Its options are "Accept all (Recommended)" and "Let me choose". Give both the same `preview`, listing every proposal on its own line: base, session mode, Jira, spec files, evidence, extras, journal and PR description. On "Accept all", use the proposals and go to step 1. On "Let me choose", ask the questions below.
   - At most 4 questions fit in one call, so use two calls. In every question the first option is your proposal, marked "(Recommended)", so accepting it takes one pick. The user can always type their own answer under Other.
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
   - Leave out a question the arguments already answer (`--base`, `--ticket`, `--full`, `--new`).
   - Follow the answers in every step below. A part the user turned off is skipped without a placeholder and is not listed under "Not captured". Step 8 says what was skipped by choice.
1. **Session.** Run
   `ai-review init --repo "$PWD" --title "<KEY>: <short title>" --ticket <KEY>=<ticket url> --agent-session "${CLAUDE_SESSION_ID}" [--base <REF>] [--new]`
   where KEY comes from the arguments, the branch name or the conversation. It reuses the latest session for this branch, even after an approved review, unless `--new` is given: approved files stay approved and only the files changed since come back for review, the overall decision resets, comments and resolutions stay. An archived session is never reused. Pass `--base <REF>` only when the branch is not based on master. Note the printed `id`, `dir` and `url`.
   Then get the folders: `ai-review path <id> spec`, `ai-review path <id> evidence`, `ai-review path <id> extras`.
2. **Jira snapshot.** When `mcp__atlassian__getJiraIssue` is available, call `mcp__atlassian__getAccessibleAtlassianResources` first and use the `cloudId` it returns (the site that is accessible to the user is the right one whatever its name; never guess a site from the company or repo name, and never skip the snapshot because the site name looks unfamiliar). Then call `getJiraIssue` for KEY with that `cloudId` and write `<spec>/jira.md`: `# KEY: summary`, a metadata line (type, status, assignee, URL), the description as Markdown, then acceptance criteria and comments when present. Otherwise write only `# KEY` and the ticket URL.
   Refresh mode: skip this step unless `jira.md` is missing, the ticket key changed, or the arguments ask for a fresh snapshot.
3. **Spec documents.** Copy the plan/spec Markdown files you worked from (for example under `plans/` or the paths the user gave) into `<spec>/`, keeping the file names. Save any design artifact HTML as `<spec>/design.html`. Then write `<spec>/index.json`:
   ```json
   { "items": [
     { "file": "jira.md", "type": "jira", "title": "<KEY>: <summary>", "url": "<ticket url>", "capturedAt": "<ISO now>" },
     { "file": "plan.md", "type": "markdown", "title": "Implementation plan", "sourcePath": "<absolute original path>" },
     { "file": "design.html", "type": "artifact", "title": "<design title>", "url": "<artifact url>" } ] }
   ```
   Refresh mode: copy a document again only when its `sourcePath` content differs from the copy, or when it is new. Leave `index.json` alone unless the item list changed.
4. **Evidence.** For each user-visible change capture evidence into `<evidence>/` using absolute paths: screenshots with `mcp__playwright__browser_take_screenshot` (absolute `filename`), or write and run a Playwright Test spec with `use: { screenshot: 'on', video: 'on' }` and `outputDir: '<evidence>'` (`npx playwright test <spec>`). Name files descriptively (`trial-bar-admin.png`). Write `<evidence>/index.json` with a one-sentence `caption` and a two-to-three-sentence `description` per file (what is shown, which state, what to look at); `order` controls the sequence:
   ```json
   { "items": [ { "file": "trial-bar-admin.png", "caption": "…", "description": "…", "order": 0 } ] }
   ```
   Note which repository files each capture covers (the components, pages, styles and data behind what it shows) for the log in step 9.
   Refresh mode: re-capture only the evidence whose covered files are in the changed set, keeping the file name, and skip what is already refreshed. Capture new evidence for user-visible changes no existing file covers. Delete evidence (file and index entry) whose covered files all dropped out of the diff. Leave every other file and index entry untouched.
5. **Extras.** Save Markdown explainers (`*.md`), artifact HTML (`*.html`) and Mermaid diagrams (`*.mmd`) that help the reviewer (for example a component or data-flow graph) into `<extras>/`, and write `<extras>/index.json` with a `title` per file: `{ "items": [ { "file": "components.mmd", "title": "Component graph" } ] }`. Note the files each extra describes, as for evidence.
   Refresh mode: regenerate only the extras whose covered files are in the changed set, and add new ones only for areas none of them cover.
6. **Journal.** Scout's journal is the notes the reviewer reads next to the diff (see `/journal` for how to write them; you may already have added entries while working). Run `ai-review journal list <id> --json`, then:
   - Add a `summary` for every changed file without a live one: title = the file's job in this change, body = 2 to 4 sentences on why it changed and what to look at. Skip lockfiles, generated and collapsed files.
   - Add entries (`decision`, `implementation`, `tradeoff`, `caveat`) for choices made in this conversation that are not logged yet, anchored to the line where each is visible, with rejected alternatives. Do not repeat an existing entry.
   - Write many entries at once with `ai-review journal add <id> --from <file.json>`. A new `summary` replaces the file's old one; replace any other entry with `--supersedes jN`.
   Refresh mode: only files in the changed set. Re-summarise a file whose live summary no longer matches its code (the new `summary` supersedes it), and add entries only for decisions since the last publish.
7. **PR description.** Look for the repo's PR template with Glob/Read: `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/pull_request_template.md`, `pull_request_template.md`, or a `.github/PULL_REQUEST_TEMPLATE/` folder (several templates: pick the default or most general one and say which in step 8). When one exists, write `<dir>/pr-description.md` following it as closely as possible: same headings, order, wording and checkbox style, each section filled from the change; a section you cannot fill keeps the template's own placeholder wording or a short "N/A"; add the review-dash sections the template has no place for (Not captured, test notes) only as extra sections at the end. Without a template write: Summary, What changed (by area), How to test, Risks/follow-ups, Not captured. `/apply-review` opens the PR from this same file.
   Refresh mode: edit `pr-description.md` in place with Edit and touch only the sections the changed set affects (what changed, how to test, risks, not captured). Keep the other sections word for word, including any edits the user made.
8. Report the dashboard URL printed by step 1, the number of evidence files and anything you could not capture. In refresh mode, list what you refreshed, added and deleted, and say that the rest was kept. Remind the user that the dashboard updates live as files change; there is nothing to publish.
9. **Publish log.** Write `<dir>/publish-log.json` with the hashes from this run (in refresh mode, the ones from the changed-set step) and the coverage you noted:
   ```json
   { "publishedAt": "<ISO now>", "head": "<git rev-parse HEAD>",
     "files": { "<repo path>": "<git hash-object>" },
     "evidence": { "trial-bar-admin.png": ["<repo path>"] },
     "extras": { "components.mmd": ["<repo path>"] } }
   ```

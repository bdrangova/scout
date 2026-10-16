---
name: publish-review
description: Open (or refresh) a review-dash session for the current implementation and fill it with evidence (screenshots, recordings), the Jira snapshot, plan docs, extra artifacts and a PR description so the developer can review the live working tree in the dashboard. Use when the user says "publish for review", "send this to review", runs /publish-review, or when a ticket implementation is complete.
argument-hint: "[--ticket KEY[=url]] [--base REF] [--title TEXT] [--new]"
allowed-tools: Bash(ai-review *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git rev-parse *) Bash(cp *) Bash(mkdir *) Bash(ls *) Bash(npx playwright *) Read Write Glob mcp__atlassian__getJiraIssue mcp__atlassian__getAccessibleAtlassianResources mcp__atlassian__atlassianUserInfo mcp__playwright__*
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
- If `AI_REVIEW_HEADLESS=1` is set, never wait for user input.

## Steps
1. **Session.** Run
   `ai-review init --repo "$PWD" --title "<KEY>: <short title>" --ticket <KEY>=<ticket url> --agent-session "${CLAUDE_SESSION_ID}" [--base <REF>] [--new]`
   where KEY comes from the arguments, the branch name or the conversation. It reuses the latest session for this branch, even after an approved review, unless `--new` is given: approved files stay approved and only the files changed since come back for review, the overall decision resets, comments and resolutions stay. An archived session is never reused. Pass `--base <REF>` only when the branch is not based on master. Note the printed `id`, `dir` and `url`.
   Then get the folders: `ai-review path <id> spec`, `ai-review path <id> evidence`, `ai-review path <id> extras`.
2. **Jira snapshot.** When `mcp__atlassian__getJiraIssue` is available, call `mcp__atlassian__getAccessibleAtlassianResources` first and use the `cloudId` it returns (the site that is accessible to the user is the right one whatever its name; never guess a site from the company or repo name, and never skip the snapshot because the site name looks unfamiliar). Then call `getJiraIssue` for KEY with that `cloudId` and write `<spec>/jira.md`: `# KEY: summary`, a metadata line (type, status, assignee, URL), the description as Markdown, then acceptance criteria and comments when present. Otherwise write only `# KEY` and the ticket URL.
3. **Spec documents.** Copy the plan/spec Markdown files you worked from (for example under `plans/` or the paths the user gave) into `<spec>/`, keeping the file names. Save any design artifact HTML as `<spec>/design.html`. Then write `<spec>/index.json`:
   ```json
   { "items": [
     { "file": "jira.md", "type": "jira", "title": "<KEY>: <summary>", "url": "<ticket url>", "capturedAt": "<ISO now>" },
     { "file": "plan.md", "type": "markdown", "title": "Implementation plan", "sourcePath": "<absolute original path>" },
     { "file": "design.html", "type": "artifact", "title": "<design title>", "url": "<artifact url>" } ] }
   ```
4. **Evidence.** For each user-visible change capture evidence into `<evidence>/` using absolute paths: screenshots with `mcp__playwright__browser_take_screenshot` (absolute `filename`), or write and run a Playwright Test spec with `use: { screenshot: 'on', video: 'on' }` and `outputDir: '<evidence>'` (`npx playwright test <spec>`). Name files descriptively (`trial-bar-admin.png`). Write `<evidence>/index.json` with a one-sentence `caption` and a two-to-three-sentence `description` per file (what is shown, which state, what to look at); `order` controls the sequence:
   ```json
   { "items": [ { "file": "trial-bar-admin.png", "caption": "…", "description": "…", "order": 0 } ] }
   ```
5. **Extras.** Save Markdown explainers (`*.md`), artifact HTML (`*.html`) and Mermaid diagrams (`*.mmd`) that help the reviewer (for example a component or data-flow graph) into `<extras>/`, and write `<extras>/index.json` with a `title` per file: `{ "items": [ { "file": "components.mmd", "title": "Component graph" } ] }`.
6. **PR description.** Look for the repo's PR template with Glob/Read: `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/pull_request_template.md`, `pull_request_template.md`, or a `.github/PULL_REQUEST_TEMPLATE/` folder (several templates: pick the default or most general one and say which in step 7). When one exists, write `<dir>/pr-description.md` following it as closely as possible: same headings, order, wording and checkbox style, each section filled from the change; a section you cannot fill keeps the template's own placeholder wording or a short "N/A"; add the review-dash sections the template has no place for (Not captured, test notes) only as extra sections at the end. Without a template write: Summary, What changed (by area), How to test, Risks/follow-ups, Not captured. `/apply-review` opens the PR from this same file.
7. Report the dashboard URL printed by step 1, the number of evidence files and anything you could not capture. Remind the user that the dashboard updates live as files change; there is nothing to publish.

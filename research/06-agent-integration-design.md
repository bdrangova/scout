# Agent-integration design (Plan agent output, 2026-09-25)

Creating review sessions from Claude Code and closing the feedback loop. Designed under the decisions in `04-design-decisions.md`, with two flagged deviations: `revisions/<n>/` from revision 1 (section 5) instead of a flat layout, and no MCP shim in v1 (section 3c).

## What was verified on this machine (affects the design)

- `claude agents --json` (2.1.241) returns `[{pid, cwd, kind: "interactive"|"background", startedAt, sessionId, name, status: "idle"|"busy"|"waiting", waitingFor?}]`; Desktop sessions appear in it. Live-detection for the headless resume is feasible.
- `--permission-mode` choices on 2.1.241 are `acceptEdits, auto, bypassPermissions, manual, dontAsk, plan`. `--fork-session`, `--include-partial-messages`, `--include-hook-events`, `--max-turns`, `--max-budget-usd`, `--allowedTools` all exist.
- `claude` lives at `~/.local/bin/claude`; `node` only via nvm (`~/.nvm/versions/node/v22.18.0/bin/node`), so hooks and Desktop-launched processes cannot assume `node`/`npx` on PATH. `jq`, `rsync`, `shasum`, `open` are in `/usr/bin`.
- A Claude session exports `CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_HOST_SESSION_ID`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_MESSAGING_SOCKET/TOKEN`, etc. A dashboard server started from inside a session inherits these; they must be stripped before spawning `claude -p`.
- qbdvision: `.claude` is fully gitignored (`.gitignore:213-214`); hooks are wired in `.claude/settings.local.json` (bash + `jq`, `"$CLAUDE_PROJECT_DIR/.claude/hooks/x.sh"`, `timeout`, `once: true`, `if: "Bash(git *)"`). The sync hook is `PostToolUse` on `Write|Edit|NotebookEdit` only and `rsync -a`s the whole `.claude/` (including `settings.local.json`) to qbdvision2/3/4. The Jira git detector only reacts to `git checkout|switch|branch|commit` containing a ticket key. The Atlassian MCP server is registered per project path in `~/.claude.json` for `/Users/bojanadrangova/Projects/qbdvision` only (`mcp__atlassian__getJiraIssue`), no `.mcp.json`, no Playwright MCP.
- Real trial data exists now: branch `bojana-QI-15472-trial-bar`, base `origin/master`, 18 files, +625/-118, clean tree, 9,357 tracked files.

## 1. Session manifest contract (`manifest.json`)

The manifest is an index; every piece of content is a file referenced by a path relative to the session folder. The packager is its only writer and writes it atomically (`manifest.json.tmp` → rename) and last, so a folder without a manifest means "publish in progress".

```jsonc
{
  "schemaVersion": 1,
  "id": "20260925-1853-qi-15472-3f9a",            // <yyyymmdd>-<hhmm>-<slug>-<4 hex>; slug = jira key or title
  "title": "QI-15472: Trial bar",
  "createdAt": "2026-09-25T18:53:10.000Z",
  "updatedAt": "2026-09-26T09:12:44.000Z",
  "agent": { "type": "claude-code", "sessionId": "1d549a05-…", "cliVersion": "2.1.241",
             "entrypoint": "cli" | "desktop" | "headless" | "unknown" },
  "repo":  { "path": "/Users/bojanadrangova/Projects/qbdvision",
             "remote": "git@github.com:QbDVision-Inc/qbdvision.git",
             "branch": "bojana-QI-15472-trial-bar", "baseRef": "origin/master", "baseSha": "a2743100…" },
  "tickets": [{ "key": "QI-15472", "url": "https://<site>.atlassian.net/browse/QI-15472", "summary": "Trial bar" }],
  "spec": [
    { "id": "s1", "type": "jira",     "path": "spec/jira.md",    "title": "QI-15472", "url": "https://…/browse/QI-15472", "capturedAt": "…" },
    { "id": "s2", "type": "markdown", "path": "spec/plan.md",    "title": "Plan", "sourcePath": "/Users/…/plans/…/plan.md" },
    { "id": "s3", "type": "artifact", "path": "spec/design.html","title": "Design notes", "url": "https://claude.ai/code/artifact/…" }
  ],
  "currentRevision": 2,
  "revisions": [
    {
      "n": 1, "createdAt": "…", "headSha": "…", "dirty": false,
      "snapshotRef": "refs/ai-review/20260925-1853-qi-15472-3f9a/rev-1",   // null with --no-snapshot-ref
      "diffPath": "revisions/1/diff.patch", "deltaPath": null,            // delta = vs previous revision (n>1)
      "prDescriptionPath": "revisions/1/pr-description.md",
      "note": "Initial implementation", "inResponseTo": [],               // feedback rounds addressed
      "stats": { "files": 18, "additions": 625, "deletions": 118, "added": 3, "modified": 13,
                 "deleted": 1, "renamed": 1, "binary": 0, "collapsed": 1, "omitted": 0 },
      "files": [
        { "path": "src/main/client/…/TrialBar.tsx", "oldPath": null,
          "status": "added" | "modified" | "deleted" | "renamed" | "copied" | "typechange",
          "additions": 120, "deletions": 0, "binary": false, "sizeAfter": 4310,
          "collapsed": false, "omitted": false, "omitReason": null,
          "beforePath": null, "afterPath": "revisions/1/files/after/src/main/client/…/TrialBar.tsx",
          "changedSincePrev": null }                                       // boolean for n>1
      ],
      "evidence": [
        { "id": "e1", "type": "image", "path": "revisions/1/media/trial-bar.png", "caption": "Trial bar on the dashboard",
          "description": "Shown to admins with 3 days left…", "order": 1, "width": 1440, "height": 400 },
        { "id": "e2", "type": "video", "path": "revisions/1/media/upgrade-flow.webm", "caption": "Upgrade flow", "order": 2 }
      ],
      "extras": [{ "id": "x1", "type": "mermaid" | "markdown" | "html", "path": "revisions/1/extras/components.mmd", "title": "Component graph" }]
    }
  ]
}
```

Session-level state (awaiting review, changes requested, approved) is derived by the dashboard from `review/` files, not stored. Ids `e<n>`/`x<n>` are unique within a revision; files are keyed by path. Types live in `shared/` (zod schema + inferred TS types) and are imported by both `cli/` and the dashboard server.

## 2. `ai-review` CLI packager (`cli/`)

TypeScript, ESM, Node 22, bundled with esbuild to a single `dist/index.js` (fast startup matters: it runs inside hooks). Deps: `commander`, `zod`, `fast-glob`, `image-size`. Installed on PATH via `npm link`, plus a launcher shim `~/.ai-review/bin/ai-review` that hardcodes the absolute node path (nvm is not on hook/Desktop PATHs). Store root `AI_REVIEW_HOME` (default `~/.ai-review`); the dashboard writes `~/.ai-review/config.json` `{port}` at startup so the CLI prints correct URLs (`http://127.0.0.1:4545/sessions/<id>`).

Two-phase publish is the primary mode, so the agent never writes into the repo:

| Command | Purpose |
|---|---|
| `ai-review init --repo . --jira QI-15472 --title … --claude-session $SID [--base REF] [--new]` | Creates `sessions/<id>/` with a draft manifest and `inbox/{media,spec,extras}/`; prints `{id, inbox, url}`. Reuses the latest session for (repo path, branch) unless its last decision is `approve` or `--new`. |
| `ai-review publish <id> [--from inbox/publish.json] [--note …] [--no-files] [--no-snapshot-ref] [--committed-only] [--max-file-bytes 5000000] [--collapse <glob>]` | Runs the git pipeline, moves inbox assets into `revisions/<n>/`, writes manifest, records `.git/ai-review/last-publish.json`, prints URL. One-shot form `ai-review publish --repo … --base … --media <glob> --spec <paths> --extras <paths> --pr-description <file>` is sugar that builds the same `publish.json`. |
| `ai-review feedback <id> [round] [--format markdown\|json]` | Latest unresolved round by default; markdown rendered from JSON by the shared renderer. |
| `ai-review resolve <id> --round n --from resolutions.json` | Validates and writes `review/resolutions-<n>.json`. |
| `ai-review pending --repo <path> --format json` | `{count, fingerprint, sessions:[…], message}` for the hook. |
| `ai-review status [<id>] --repo <path> --format brief\|json` | Open session for this branch, `changedSincePublish`, current tree hash. |
| `ai-review open [<id>]` | `open` the URL (or the sessions list). |
| `ai-review install --repo <path> [--with-stop-nudge] [--mcp] [--mirror]` | Section 8. |

`inbox/publish.json` (written by the skill; paths relative to `inbox/` or absolute):

```json
{ "title": "QI-15472: Trial bar", "claudeSessionId": "…", "base": "origin/master",
  "tickets": [{ "key": "QI-15472", "url": "…", "summary": "…" }],
  "spec": [{ "type": "jira", "file": "spec/jira.md" }, { "type": "markdown", "file": "/Users/…/plan.md" },
           { "type": "artifact", "file": "spec/design.html", "url": "https://claude.ai/code/artifact/…" }],
  "evidence": [{ "file": "media/trial-bar.png", "caption": "…", "description": "…" }, { "file": "media/upgrade-flow.webm", "caption": "…" }],
  "extras": [{ "file": "extras/components.mmd", "title": "Component graph" }],
  "prDescription": "pr-description.md", "note": "Round 2: addressed f1.l1, e1.c1" }
```

**Git pipeline (decision: include committed + staged + unstaged + untracked, honouring `.gitignore`).** The reviewer wants to see the change as it sits on disk. Instead of `git add -N` (mutates the real index) or per-file `--no-index` hacks, snapshot the working tree into a hidden ref using a temporary index. This is the `git stash create` technique; it never touches the user's index, working tree, or branches, and the ref is invisible to `git branch`/push:

```bash
cd "$REPO"                                   # always run from `git rev-parse --show-toplevel`
MB=$(git merge-base "$BASE" HEAD)            # baseSha; BASE defaults to origin/<default> via `git symbolic-ref refs/remotes/origin/HEAD`
export GIT_INDEX_FILE="$SESSION/tmp/index"   # temp index (deleted afterwards)
git read-tree HEAD                           # seed from HEAD so only changed files get hashed (fast on 9k files)
git add -A -- . ':!<oversized untracked paths>'   # untracked > --max-file-bytes are excluded and listed as omitted
TREE=$(git write-tree)
SNAP=$(git commit-tree "$TREE" -p HEAD -m "ai-review snapshot $SID rev $N")
git update-ref "refs/ai-review/$SID/rev-$N" "$SNAP"
unset GIT_INDEX_FILE
git -c core.quotepath=false diff --no-color --no-ext-diff --no-textconv --ignore-submodules=all \
    -M50% --full-index --unified=3 "$MB" "$SNAP" -- . ':!<omitted paths>' > revisions/$N/diff.patch
git -c core.quotepath=false diff --numstat     -M50% "$MB" "$SNAP"      # additions/deletions; "-\t-" marks binary
git -c core.quotepath=false diff --name-status -M50% -z "$MB" "$SNAP"   # A/M/D/R<score>/C/T + old/new paths
git cat-file -s "$SNAP:$path"                                           # sizeAfter
git show "$MB:$path" > files/before/$path ; git show "$SNAP:$path" > files/after/$path   # text files <= 512 KB
git diff … "refs/ai-review/$SID/rev-$((N-1))" "$SNAP" > revisions/$N/delta.patch          # N > 1
```

Rules: `--committed-only` swaps `$SNAP` for `HEAD`; `--no-snapshot-ref` falls back to `git diff $MB` (tracked changes vs working tree) plus `git diff --no-index -- /dev/null <file>` per untracked file (exit code 1 is success; run from repo root so paths stay relative), losing rename detection across untracked files and `delta.patch`. Binary: no `--binary` flag (patch shows "Binary files … differ"); `binary: true` from numstat; images ≤ 2 MB get `before/after` copies so the dashboard can show them side by side. Renames: `-M50%`, `oldPath` from `--name-status`; copies (`-C`) off for speed. Large files: `collapsed: true` when `additions+deletions > 1500`, `sizeAfter > 512 KB`, or path matches default globs (`**/package-lock.json`, `**/yarn.lock`, `**/pnpm-lock.yaml`, `**/*.snap`, `**/*.min.*`, `**/dist/**`); collapsed files stay in the patch but skip `files/` snapshots. Files whose patch would exceed `--max-file-bytes` (5 MB) are excluded from the diff command via pathspec and listed with `omitted: true, omitReason: "too-large"`. Stats are totals from numstat plus status counts. After publishing, `.git/ai-review/last-publish.json` stores `{sessionId, revision, treeHash}` where `treeHash = sha256(HEAD + git diff HEAD + untracked list)` for the Stop nudge.

## 3. Claude Code project integration files

### a. `.claude/skills/publish-review/SKILL.md`

```markdown
---
name: publish-review
description: Package the current implementation into an AI-review dashboard session (diff, screenshots/video evidence, Jira snapshot, plan docs, artifacts, PR description). Use when the user says "publish for review", "send this to review", runs /publish-review, or when a ticket implementation is complete and ready for the developer to review.
argument-hint: "[--jira KEY] [--base REF] [--title TEXT] [--new]"
allowed-tools: Bash(ai-review *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git rev-parse *) Bash(cp *) Bash(mkdir *) Bash(ls *) Bash(npx playwright *) Read Write mcp__atlassian__getJiraIssue mcp__atlassian__atlassianUserInfo mcp__playwright__*
---
# Publish the current work for review

Repo state: !`git status --short --branch | head -40`
Open review session for this branch (if any): !`ai-review status --repo "${CLAUDE_PROJECT_DIR}" --format brief`

Arguments: $ARGUMENTS

## Rules
- Do NOT commit, stage, stash, or modify repository files. Only write into the session inbox returned by step 1.
- Use absolute paths for every file you write. Never write into the repo's .claude/ or plans/.
- If a step's tool is unavailable (no Jira connector, no browser tool), skip it and say so in the PR description under "Not captured".
- If `AI_REVIEW_HEADLESS=1` is set, never wait for user input.

## Steps
1. **Session.** If the status above shows an open session for this branch and `--new` was not given, reuse it (the publish becomes a new revision). Otherwise run
   `ai-review init --repo "${CLAUDE_PROJECT_DIR}" --claude-session "${CLAUDE_SESSION_ID}" --jira <KEY> --title "<KEY>: <short title>" [--base <REF>] --format json`
   where KEY comes from the arguments, the branch name, or the conversation. Note the returned `id` and `inbox` path.
2. **Jira snapshot.** Call `mcp__atlassian__getJiraIssue` for KEY and write `<inbox>/spec/jira.md` as: `# KEY: summary`, a metadata line (type, status, assignee, url), then the description rendered as Markdown, then acceptance criteria and comments if present. Record the ticket URL for step 7.
3. **Spec documents.** Copy the plan/spec markdown files you worked from (for example under plans/ or the paths the user gave) into `<inbox>/spec/`, keeping the original file name; remember the source path.
4. **Evidence.** For each user-visible change, capture evidence into `<inbox>/media/`: screenshots via `mcp__playwright__browser_take_screenshot` with an absolute `filename`, or by writing and running a Playwright Test spec with `use: { screenshot: 'on', video: 'on' }` and `outputDir` set to `<inbox>/media` (`npx playwright test <spec>`). Name files descriptively (`trial-bar-admin.png`). Write a one-sentence caption and a two-to-three-sentence description for each (what is shown, which state, what to look at).
5. **Extras.** Save any artifact HTML you created with the Artifact tool, and any Mermaid diagram (`.mmd`) or Markdown explainer that helps the reviewer (for example a component/data-flow graph of the implementation), into `<inbox>/extras/`.
6. **PR description.** Write `<inbox>/pr-description.md`: Summary, What changed (by area), How to test, Risks/follow-ups, Not captured. For a re-publish after review, start with "Changes since round <n>" listing the feedback item ids you addressed.
7. **Publish.** Write `<inbox>/publish.json` (fields: title, claudeSessionId = "${CLAUDE_SESSION_ID}", base, tickets[{key,url,summary}], spec[{type: jira|markdown|artifact, file, title?, url?, sourcePath?}], evidence[{file, caption, description}], extras[{file, title}], prDescription, note) and run
   `ai-review publish <id> --from <inbox>/publish.json`.
8. Report the printed dashboard URL, the revision number, the file/line stats, and anything you could not capture.
```

### b. `.claude/skills/apply-review/SKILL.md`

```markdown
---
name: apply-review
description: Apply reviewer feedback from the AI-review dashboard (rejected files, file and line comments, evidence comments, overall feedback), record a per-item resolution, and republish a new revision. Use when the user says "apply the review", "address the review feedback", runs /apply-review, or when a hook reports unresolved review items for this repo.
argument-hint: "<sessionId> [round]"
allowed-tools: Bash(ai-review *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(npm test*) Bash(npm run *) Bash(npx vitest *) Bash(npx prettier *) Bash(npx oxlint *) Read Edit Write Grep Glob
---
# Apply review feedback: $ARGUMENTS

## Feedback to address
!`ai-review feedback $ARGUMENTS --format markdown`

## Session
!`ai-review status $0 --format brief`

## Rules
- Every item id in the feedback needs a response. Never silently skip one.
- Do NOT commit or stage. Do not touch files outside the reviewed change unless an item requires it.
- Keep replies concrete: what you changed, where, and how you verified it.
- If `AI_REVIEW_HEADLESS=1` is set, never wait for user input; when an item is ambiguous, respond `needs_clarification` with a specific question instead of guessing.

## Steps
1. Read the feedback top to bottom. Build a checklist of item ids: overall, each rejected file, each file comment, each line comment (path:line plus the quoted snippet), each evidence/extra comment.
2. For each line comment, open the file at the quoted snippet (search for the snippet text if line numbers have drifted) and fix or explain. For rejected files, treat the file comment as the required change. For evidence comments, fix the UI/behaviour and plan a new capture. For overall feedback, apply cross-cutting changes.
3. Run the relevant tests and linters for the files you touched (`npx vitest run <paths>`, `npx prettier --check`, `npx oxlint`). Fix failures you introduced.
4. Write `<session inbox>/resolutions.json`:
   `{ "round": <n>, "summary": "…", "items": [{ "id": "f1.l1", "status": "fixed" | "wont_fix" | "needs_clarification" | "acknowledged", "note": "…", "files": ["path", …] }] }`
   and run `ai-review resolve <sessionId> --round <n> --from <session inbox>/resolutions.json`.
5. Republish as a new revision: follow the publish-review skill with the same session id, re-capturing evidence only for changed screens, and start the PR description with "Changes since round <n>".
6. Reply with a table: item id, status, one-line note, then the new dashboard URL.
```

### c. MCP shim: not in v1

Skills + CLI cover both directions; every "tool" is a CLI command with a JSON file, which works identically in the terminal, Desktop, and `-p`. The shim would add a second process, an approval prompt, and a root-level `.mcp.json` that is not gitignored in qbdvision (it would show as untracked in a 9k-file repo). Revisit when adding `claude/channel` push. The entry to use then:

```json
{ "mcpServers": { "review-dash": { "command": "node",
    "args": ["/Users/bojanadrangova/.ai-review/mcp/server.js"],
    "env": { "REVIEW_DASH_URL": "http://127.0.0.1:4545" } } } }
```

(tools `publish_review_session`, `get_review_feedback`, `resolve_feedback_item` forwarding to `/api/*`; pre-approve with `"permissions":{"allow":["mcp__review-dash__*"]}`).

### d. Hooks (`.claude/settings.local.json` in qbdvision; `settings.json` elsewhere via `--shared`)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/ai_review_pending_feedback.sh\"", "timeout": 5 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/ai_review_publish_nudge.sh\"", "timeout": 10 }] }
    ]
  },
  "permissions": { "allow": ["Bash(ai-review *)"] }
}
```

`ai_review_pending_feedback.sh` (nags once per session per pending-set; skips when the prompt already is `/apply-review`):

```bash
#!/usr/bin/env bash
# UserPromptSubmit hook: surface unresolved AI-review feedback for this repo, once per (session, pending set).
input="$(cat)"
prompt="$(printf '%s' "$input" | jq -r '.prompt // empty')"
case "$prompt" in /apply-review*|/publish-review*) exit 0 ;; esac
session_id="$(printf '%s' "$input" | jq -r '.session_id // empty')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
AI_REVIEW="${AI_REVIEW_BIN:-$HOME/.ai-review/bin/ai-review}"
[ -x "$AI_REVIEW" ] || AI_REVIEW="$(command -v ai-review 2>/dev/null || true)"
[ -n "$AI_REVIEW" ] || exit 0
pending="$("$AI_REVIEW" pending --repo "$cwd" --format json 2>/dev/null)" || exit 0
[ "$(printf '%s' "$pending" | jq -r '.count // 0')" -gt 0 ] || exit 0
fingerprint="$(printf '%s' "$pending" | jq -r '.fingerprint')"
git_dir="$(git -C "$cwd" rev-parse --git-dir 2>/dev/null)" || exit 0
marker="$git_dir/ai-review/nagged-${session_id}"
[ -f "$marker" ] && [ "$(cat "$marker")" = "$fingerprint" ] && exit 0
mkdir -p "$git_dir/ai-review" && printf '%s' "$fingerprint" > "$marker"
printf '%s' "$pending" | jq '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:.message}}'
```

`message` is produced by the CLI, e.g. "The AI-review dashboard has 5 unresolved items (round 1) for session 20260925-1853-qi-15472-3f9a on this branch. Run /apply-review 20260925-1853-qi-15472-3f9a 1 when appropriate: http://127.0.0.1:4545/sessions/…/review/1".

`ai_review_publish_nudge.sh` (Stop; opt-in via `install --with-stop-nudge` because `additionalContext` on Stop continues the turn):

```bash
#!/usr/bin/env bash
# Stop hook: once per new working-tree state, remind Claude to republish when this branch has a review session.
input="$(cat)"
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active')" = "true" ] && exit 0
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
AI_REVIEW="${AI_REVIEW_BIN:-$HOME/.ai-review/bin/ai-review}"; [ -x "$AI_REVIEW" ] || exit 0
st="$("$AI_REVIEW" status --repo "$cwd" --format json 2>/dev/null)" || exit 0
sid="$(printf '%s' "$st" | jq -r '.session.id // empty')"; [ -n "$sid" ] || exit 0
[ "$(printf '%s' "$st" | jq -r '.changedSincePublish')" = "true" ] || exit 0
cur="$(printf '%s' "$st" | jq -r '.currentTreeHash')"
git_dir="$(git -C "$cwd" rev-parse --git-dir 2>/dev/null)" || exit 0
marker="$git_dir/ai-review/nudged-tree"
[ -f "$marker" ] && [ "$(cat "$marker")" = "$cur" ] && exit 0
mkdir -p "$git_dir/ai-review" && printf '%s' "$cur" > "$marker"
jq -n --arg s "$sid" '{hookSpecificOutput:{hookEventName:"Stop",additionalContext:("The working tree changed since review session " + $s + " was last published. If the task is complete, run /publish-review to publish a new revision; otherwise continue.")}}'
```

### e. `.gitignore`

Nothing repo-local is created outside `.claude/` and `.git/ai-review/`; qbdvision already ignores `.claude`. For other repos, `install` appends `.claude/settings.local.json` only if not already ignored. Nothing else.

## 4. Feedback contract (dashboard → agent)

`review/feedback-<round>.json`, written atomically by the dashboard on Submit, then `review/feedback-<round>.md` from the shared renderer (also used by `ai-review feedback`). Rounds are decoupled from revisions (`revision` says what was reviewed); a round is pending until `review/resolutions-<round>.json` exists.

```jsonc
{ "schemaVersion": 1, "sessionId": "…", "round": 1, "revision": 1, "submittedAt": "…",
  "decision": "approve" | "request_changes" | "reject",
  "overall": { "id": "overall", "body": "…" } | null,
  "files": [{ "id": "f1", "path": "src/…/TrialBar.tsx", "verdict": "approved" | "rejected" | "none",
              "comments": [{ "id": "f1.c1", "body": "…", "createdAt": "…" }],
              "lineComments": [{ "id": "f1.l1", "side": "new" | "old", "line": 42, "endLine": 42,
                                 "snippet": "const days = Math.floor(msLeft / 86400000);", "body": "…", "createdAt": "…" }] }],
  "evidence": [{ "id": "e1", "path": "revisions/1/media/trial-bar.png", "caption": "…",
                 "comments": [{ "id": "e1.c1", "timestamp": null | 12.4, "body": "…" }] }],
  "extras":   [{ "id": "x1", "comments": [{ "id": "x1.c1", "body": "…" }] }],
  "items": ["overall", "f1", "f1.c1", "f1.l1", "e1.c1"] }   // ids that require a response; approved files without comments are not items
```

Markdown layout the agent reads:

```markdown
# Review feedback, round 1 — 20260925-1853-qi-15472-3f9a (QI-15472: Trial bar)
Revision reviewed: 1 · Submitted: 2026-09-25 19:40 · Decision: **REQUEST CHANGES**
Dashboard: http://127.0.0.1:4545/sessions/20260925-1853-qi-15472-3f9a/review/1

## Overall feedback [overall]
> Good direction; fix the countdown math and the overlap before I approve.

## Files (2 rejected, 12 approved, 4 commented)
### src/main/client/…/TrialBar.tsx — REJECTED [f1]
- [f1.c1] file comment: > Split the formatting helpers out of the component.
- [f1.l1] src/main/client/…/TrialBar.tsx:42 (new)
  ```tsx
  42 | const days = Math.floor(msLeft / 86400000);
  ```
  > Off-by-one on the last day; use Math.ceil.
### src/main/client/…/useTrial.ts — commented [f3]
- [f3.c1] > Why not react-query here?
(Approved files without comments are omitted.)

## Evidence
### [e1] trial-bar.png — "Trial bar on the dashboard"
- [e1.c1] > Badge overlaps the avatar at 1280px.
### [e2] upgrade-flow.webm — "Upgrade flow"
- [e2.c1] at 00:12 > Modal flashes before the redirect.

## Extras
### [x1] Component graph
- [x1.c1] > Missing the TrialProvider node.

## Required response
Respond to every id above (`fixed`, `wont_fix`, `needs_clarification`, `acknowledged`) via
`ai-review resolve 20260925-1853-qi-15472-3f9a --round 1 --from <file>`, then republish with /publish-review.
```

Resolutions (`review/resolutions-<round>.json`, written by `ai-review resolve` after validation against the feedback's `items`):

```jsonc
{ "schemaVersion": 1, "sessionId": "…", "round": 1, "revision": 2, "createdAt": "…",
  "summary": "Fixed the countdown and overlap; kept the hook as is (see f3.c1).",
  "items": [
    { "id": "f1.l1", "status": "fixed", "note": "Math.ceil plus a unit test.", "files": ["src/…/TrialBar.tsx", "src/…/TrialBar.test.tsx"] },
    { "id": "f3.c1", "status": "wont_fix", "note": "The hook is read-only local state; react-query adds nothing here." },
    { "id": "e1.c1", "status": "needs_clarification", "note": "Which browser? Fine at 1280 in Chrome; see revision 2 e1." } ] }
```

`revision` is filled in by `publish` when the next revision lands (resolve writes `null` first). Dashboard display per item: status chip + note, links to the touched files in the new revision's `delta.patch`, coverage "x of y items answered", and a link to `review/agent-run-<round>.jsonl` when the run was headless. Unanswered ids show "no response".

## 5. Revision model: `revisions/<n>/` inside one session (recommended)

```
~/.ai-review/sessions/<id>/
  manifest.json
  spec/            jira.md, plan.md, design.html            (session-level; --respec overwrites jira.md, capturedAt updated)
  review/          feedback-<r>.json|.md, resolutions-<r>.json, agent-run-<r>.jsonl|.json
  revisions/<n>/   diff.patch, delta.patch (n>1), pr-description.md, files/{before,after}/…, media/…, extras/…
  inbox/           agent staging; emptied by publish
```

Reasons: stable paths (comments reference `revisions/1/media/x.png` forever), round 1 → round 2 in one screen, and `delta.patch` + `files[].changedSincePrev` give "changed since last review" for free thanks to the snapshot refs. Manifest changes: `currentRevision`, `revisions[]` (each with `deltaPath`, `inResponseTo`, `note`), nothing else. `--carry-evidence` copies the previous revision's unchanged evidence entries forward (flag `carriedFrom: 1`) so the reviewer is not forced to re-look.

## 6. Headless resume flow (dashboard server, Node)

`AgentAdapter` (`server/src/agents/adapter.ts`), implemented by `claude-code.ts`:

```ts
interface AgentAdapter {
  type: "claude-code";
  isSessionLive(agentSessionId: string): Promise<{ pid: number; status: string; cwd: string; kind: string } | null>;
  applyFeedback(req: { manifest: Manifest; round: number; fork?: boolean; signal: AbortSignal }): AsyncIterable<AgentEvent>;
  publishSession(req: { manifest: Manifest; signal: AbortSignal }): AsyncIterable<AgentEvent>; // "Re-publish" button: same mechanics, prompt "/publish-review"
}
```

Submit handler: write `feedback-<r>.json/.md` → `isSessionLive` (`execFile(claudeBin, ["agents","--json"], {timeout: 5000})`, match `sessionId`; any status counts as live; also `process.kill(pid, 0)` to confirm) → if live: respond `202 {pending: true}` and rely on the hook path (UI offers "Run as fork" = `--fork-session`) → else spawn:

```
claude -p "/apply-review <sessionId> <round>" --resume <agent.sessionId> \
  --output-format stream-json --verbose --include-partial-messages \
  --permission-mode acceptEdits \
  --allowedTools "Bash(ai-review *)" "Bash(git status *)" "Bash(git diff *)" "Bash(git log *)" "Bash(npm test*)" "Bash(npm run *)" "Bash(npx vitest *)" \
  --max-turns 80 --max-budget-usd 10
```

Spawn details: `cwd = manifest.repo.path` (so project skills/hooks/settings load); `stdio: ["ignore","pipe","pipe"]`; env = `process.env` minus every `CLAUDECODE`, `CLAUDE_CODE_*`, `CLAUDE_AGENT_SDK_*` key (nested-session guard), plus `AI_REVIEW_HOME`, `AI_REVIEW_HEADLESS=1`, `PATH` prefixed with `~/.ai-review/bin`; `claudeBin` resolved at startup (`AI_REVIEW_CLAUDE_BIN` → `which claude` → `~/.local/bin/claude`). One run per session (`review/.agent-run.lock` with pid). Persist every stdout line to `review/agent-run-<r>.jsonl`; `agent-run-<r>.json` holds `{status, pid, argv, startedAt, endedAt, exitCode, resultSubtype, numTurns, costUsd}`.

stream-json → UI events:

| line | UI event |
|---|---|
| `system/init` | `run.started {model, session_id, permissionMode, tools}` |
| `assistant` with `content[].text` | `agent.text` |
| `assistant` with `content[].tool_use` | `agent.tool {name, summary}` (Edit/Read → `file_path`, Bash → `command`, Skill → name) |
| `user` with `tool_result` | `agent.tool_result {tool_use_id, is_error, preview}` (denied tools surface here) |
| `stream_event` `content_block_delta/text_delta` | `agent.text_delta` |
| `result` | `run.finished {subtype, is_error, num_turns, duration_ms, total_cost_usd, result}` |

Unknown lines are stored but ignored. Timeouts: 15 min without a line → SIGTERM; 60 min hard cap; Cancel → SIGINT, 5 s, SIGTERM, 5 s, SIGKILL. On exit, the round is resolved only if `resolutions-<r>.json` appeared (the skill wrote it); otherwise the run is marked `failed`/`partial`, the round stays pending, and the hook path takes over next interactive session. Caveats carried from the research: always pass `--permission-mode` (restore rules differ under `-p`); `--mcp-config/--add-dir/--settings` are not restored on resume (not needed for apply; `.mcp.json` and `~/.claude.json` project servers still load); the system prompt is snapshotted, so all feedback goes through the skill/prompt, never `--append-system-prompt`; a Desktop-owned transcript will not show the headless turns until reopened; `-p` runs do not appear in the picker but `--resume <id>` still works.

## 7. Sample/dev data

`scripts/make-fixture.ts` (run with `npm run fixture`, `AI_REVIEW_HOME=./.dev-store`): create a temp repo under `os.tmpdir()/ai-review-fixture-<rand>`, commit a base (`main`, ~10 files incl. `package-lock.json` with 3,000 lines), branch `feature/QI-1234-demo`, then: modify `src/app.ts`, add `src/trial/TrialBar.tsx`, delete `src/legacy.ts`, `git mv src/util.ts src/utils/index.ts` + small edit (rename at >50%), add a generated 1×1 `assets/logo.png` and change it (binary), touch the lockfile (collapsed), commit; then leave one unstaged edit and one untracked `src/wip.ts`. Copy fixture media from `fixtures/media/` (a PNG and a short WebM), write `spec/jira.md`, `spec/plan.md`, `extras/components.mmd`, `extras/report.html`, `pr-description.md`, then call the packager programmatically (`publish()` from `cli/src/commands/publish.ts`) for revision 1; write a sample `review/feedback-1.json` (renderer produces the `.md`), a `resolutions-1.json`, apply two more edits, publish revision 2. Ends by printing the URL. Real-world trial: `ai-review publish --repo /Users/bojanadrangova/Projects/qbdvision --base origin/master --jira QI-15472 --title "QI-15472: Trial bar" --pr-description <file>` on the current branch (18 files, +625/-118, clean tree, no binaries), then `--note "rev 2"` after a small edit to exercise `delta.patch`. Verify `refs/ai-review/*` never shows in `git branch -a` or `git push --dry-run`.

## 8. Installation into qbdvision (`ai-review install --repo <path>`)

Writes: `.claude/skills/publish-review/SKILL.md`, `.claude/skills/apply-review/SKILL.md`, `.claude/hooks/ai_review_pending_feedback.sh` (+ `ai_review_publish_nudge.sh` with `--with-stop-nudge`), merges the hook groups and `Bash(ai-review *)` into `.claude/settings.local.json` (idempotent: entries whose command contains `ai_review_` are replaced, existing groups such as the `once: true` Jira detector untouched), creates `~/.ai-review/bin/ai-review` (absolute node path) and `.git/ai-review/`. It never writes `.mcp.json` without `--mcp`, never stores state under `.claude/` (the sync hook mirrors that folder), and skips `.gitignore` because `.claude` is already ignored there.

Coexistence: the sync hook only fires on Claude's Write/Edit tools, so a terminal `install` does not propagate; `--mirror` runs `.claude/hooks/sync_claude_folders.sh` with synthetic stdin (`{"tool_input":{"file_path":"<repo>/.claude/skills/publish-review/SKILL.md"}}`) to copy to qbdvision2/3/4, or the user runs `install` per checkout. The pre-commit gate is irrelevant because neither skill commits; the git Jira detector ignores the read-only git commands the skills run (the skills use `git rev-parse --abbrev-ref HEAD`, not `git branch`). The Atlassian server is registered only for the primary checkout path, so Jira snapshots in qbdvision2/3/4 fall back to key + URL until the developer runs `claude mcp add` there.

## 9. Risks and open questions

- **Writing `refs/ai-review/*` and blobs into the repo's `.git`.** Standard technique but a policy question; `--no-snapshot-ref` fallback exists.
- **Live-session collision.** `claude agents --json` is undocumented for this purpose; idle Desktop sessions block headless runs by design. "Run as fork" mitigates; "pending" is the default when live.
- **Evidence capture in qbdvision.** No Playwright MCP is configured and E2E is WebdriverIO; screenshots need `claude mcp add playwright …` or a Playwright Test spec (Playwright is present for PDF/Vitest browser tests). The skill degrades gracefully.
- **Jira via connector only in the primary checkout.** Fine for v1; the dashboard shows the link regardless.
- **Headless permissions.** `acceptEdits` + allowlist means unexpected Bash commands are denied silently; the UI must show denied tool results prominently. Do not use `bypassPermissions`.
- **Stop nudge noise.** `additionalContext` on Stop continues the turn; shipped opt-in.
- **Hook latency.** `ai-review pending` must stay under ~300 ms (bundled CLI, scan `sessions/*/manifest.json` + `review/` names only; no git calls).
- **Large repos.** Temp-index snapshot is fast after `read-tree HEAD`, but a first `git add -A` over huge untracked trees could be slow; oversize exclusion caps it.
- **Session reuse rule** (same repo + branch → new revision) may surprise when a branch hosts two tickets; `--new` exists.
- **Contract ownership.** `shared/` (manifest + feedback zod schemas + markdown renderer) must be agreed before either side implements.
- If the developer later prefers the SDK over `-p` (UI approvals), only `claude-code.ts` changes; if channels are enabled org-wide, the MCP shim moves from v1.1 to v1.

## Critical files

- `shared/schemas/manifest.ts` (manifest + feedback + resolutions zod schemas, `schemaVersion: 1`, shared by CLI and dashboard)
- `cli/src/git.ts` (temp-index snapshot ref, diff/numstat/name-status pipeline, collapse/omit rules, delta)
- `cli/src/commands/publish.ts` (inbox → `revisions/<n>/`, manifest writer, `.git/ai-review/last-publish.json`)
- `cli/templates/skills/publish-review/SKILL.md`, `cli/templates/skills/apply-review/SKILL.md`, `cli/templates/hooks/ai_review_pending_feedback.sh` (installed by `cli/src/commands/install.ts`)
- `server/src/agents/claude-code.ts` (`AgentAdapter`: `claude agents --json` live check, `claude -p --resume` spawn with env stripping, stream-json parser, `review/agent-run-<n>.jsonl`)

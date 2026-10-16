# Design decisions (confirmed 2026-09-25)

Decisions taken with the developer after reviewing the sketches and the research in this folder. Each one lists the alternative that was rejected and why, so the reasoning survives.

## D1. Send flow: write files, then resume Claude Code headlessly

On Submit the dashboard server:
1. writes the feedback to the session store (JSON + a markdown rendering the agent reads),
2. checks whether the originating Claude Code session is still live,
3. if not live: runs `claude -p --resume <sessionId> "/apply-review <reviewId>" --output-format stream-json ...` and streams the output into the dashboard,
4. if live: leaves the feedback pending; a `UserPromptSubmit` hook in the repo tells the open session to run `/apply-review`.

Behind an `AgentAdapter` interface so a second agent can be added later. Claude Code is the only adapter in v1.

Rejected: files-only (no automation on Submit) as too manual; Agent SDK ownership of the loop as too much work for v1 and its auth guidance favours API keys over the developer's claude.ai login. Both remain upgrade paths. See `03-claude-code-integration.md` §2.

## D2. Storage: global store at `~/.ai-review/`

- `~/.ai-review/sessions/<sessionId>/` holds a self-contained snapshot per published review: manifest, diff, media, spec snapshots, extras, and the review/feedback files.
- Each session records its `repoPath`, branch and base ref, so one dashboard index covers all four qbdvision checkouts.
- Override with `AI_REVIEW_HOME`.
- Files on disk are the contract; no database. The server indexes and watches the folder.

Rejected: per-repo `.ai-review/` (four checkouts → four folders, media inside repos, gitignore management). Can be revisited if sessions ever need to be shared with teammates.

## D3. Comments: file-level verdicts and comments only (revised 2026-09-26)

- Per file: verdict `approved | rejected | none` and free-text comments (as sketched).
- Reject requires a comment before advancing.
- No line-anchored comments. The first cut of this decision included them; the developer removed them after reviewing the mockup. The diff is read-only, which also drops the diff library's annotation and line-selection APIs from the plan.

## D4. Jira: agent snapshot plus link-out

- At publish time the agent fetches the ticket through its Atlassian connector and writes `spec/jira.md` (title, status, description, acceptance criteria, attachment list).
- The dashboard renders the snapshot and links out to the ticket URL.
- No Jira token in the dashboard for v1. The spec panel is designed so a "Refresh from Jira" button (REST v3 with email + API token, as in qbdash) can be added later.

Rejected for v1: live REST fetch (token setup, attachment proxy) and "both".

## D5. Packager snapshots the working tree into hidden git refs

The `ai-review publish` pipeline builds a temporary index from the target repo's working tree (committed + staged + unstaged + untracked, honouring `.gitignore`), writes a commit object and stores it as `refs/ai-review/<sessionId>/rev-<n>` in the repo's `.git`. Same technique as `git stash create`: never touches the user's index, branches or working tree; invisible to `git branch`; not pushed by `git push`. This gives immutable snapshots and a `delta.patch` between consecutive publishes. `--no-snapshot-ref` remains as a fallback (plain `git diff <base>` plus `--no-index` for untracked files).

Rejected: no refs (loses rename detection across untracked files and "changed since last review").

## D6. Evidence capture: Playwright MCP and Playwright Test specs

`ai-review install` registers `@playwright/mcp` (with `--caps devtools`) for the target repo. The publish skill describes both paths: MCP tools for quick PNG screenshots and WebM recordings with absolute output paths, and a small Playwright Test spec (`screenshot: 'on', video: 'on'`, `outputDir` in the session inbox) for flows worth re-running. The agent picks per capture.

## D7. One continuous session, no rounds (2026-09-26)

- A session is reviewed as one conversation: comments are `open` or `resolved`; nothing is numbered by round.
- Submit sends the currently open comments plus the file verdicts and the decision, then (D1) resumes the agent.
- The agent answers each comment through `ai-review resolve`: `resolved` with a one-line note, or `open` with a reply when it disagrees or needs an answer.
- Resolved comments are hidden by default everywhere, behind a "Show resolved (n)" toggle; the reviewer can reopen one.
- Files the agent changed after a verdict show an "updated" chip and their verdict resets.

Rejected: the round model from `05` and `06` (`feedback-<round>`, `resolutions-<round>`, "Round 1 applied · re-review"). The developer found it heavier than the problem; the single-session model keeps the same files-on-disk contract with fewer moving parts.

## Reconciliations between the two design documents (05 vs 06)

Where `05-dashboard-app-design.md` and `06-agent-integration-design.md` differ, the plan follows these calls:

- **Store layout:** `revisions/<n>/` inside each session from revision 1 (06), not a flat session (05).
- **Manifest:** 06's shape (`revisions[]` with `files[]`, `evidence[]`, `extras[]`; session-level `spec[]`, `tickets[]`, `agent`, `repo`). The packager writes `files[]` from git numstat/name-status; the server only slices the patch per file.
- **Review files:** `review/review.json` (dashboard-owned live state, autosaved), `review/resolutions.json` (agent-owned, merged by comment id), `review/sent/<iso>.json|.md` (immutable snapshot of each Submit), `review/runs/<runId>.json|.jsonl` (headless run logs). Supersedes the round-numbered files both documents proposed (see D7). The skill reads open comments through `ai-review feedback`.
- **Comment ids:** session-unique `c<n>` assigned when a comment is created, each with a `target` (`overall`, a file path, an evidence id or an extra id). Replaces the per-round `f<n>.c<m>` scheme from 06.
- **MCP shim:** not in v1 (06). Skills + CLI only.
- **Repo structure:** npm workspaces (`web`, `server`, `cli`, `shared`) with one lockfile, instead of 05's qbdash-style separate lockfiles. `shared` is a workspace package exporting TypeScript source.
- **Adapter interface:** `isSessionLive` + `applyFeedback` (async iterable of run events) from 06; RunManager persistence and SSE replay from 05.

## Defaults decided without a question (routine calls)

- **Stack:** Vite + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui on the web side; Express 5 + TypeScript on the server; shared zod schemas; npm; Node 22. Mirrors qbdash.
- **Ports:** server 4545, Vite dev 4546. Avoids qbdvision (8080, 3000, 6006) and qbdash (5173, 3001).
- **Diff rendering:** `@pierre/diffs` (exact pin), fallback `@git-diff-view/react`.
- **Markdown / Mermaid:** `streamdown` with `@streamdown/code` and `@streamdown/mermaid` (mermaid 11.x).
- **Agent HTML and exported artifacts:** sandboxed `srcdoc` iframe, never `allow-same-origin`, with a `connect-src 'none'` meta CSP injected. Claude artifact URLs cannot be iframed, so the agent exports the HTML into the session and the card links out.
- **Video:** native `<video>` + `media-chrome` controls + custom timestamp markers for comments.
- **Card deck:** `motion` drag gestures + keyboard; `embla` (shadcn Carousel) for evidence; `@tanstack/react-virtual` for scroll mode.
- **Evidence capture by the agent:** Playwright (test spec with `screenshot: 'on', video: 'on'`, or Playwright MCP for one-offs). WebM is fine; no ffmpeg dependency in v1.
- **Session-level decision:** `approve | request-changes | reject` (covers the "Request changes" action from the index sketch).
- **Revisions:** a re-publish after feedback still lands as a new snapshot on disk (needed for the "updated" chips and for `delta.patch`), but the UI shows only the latest code. No revision picker in v1.

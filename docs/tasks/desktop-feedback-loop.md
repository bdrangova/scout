# Task: a real feedback loop between the dashboard and Claude Desktop

Status: proposal, not started. Written 2026-10-19 on branch `retro-redesign` from a read-only exploration. Plan wins over research/05 and 06 where they differ.

## Problem

The user works almost only in Claude Desktop and does not use Claude Code session streaming. Today the loop is hand-carried:

Submit in the dashboard -> copy `/scout-apply-review <id>` (or open `claude://code/new?q=...&folder=...`) -> paste / confirm in Desktop -> the agent fixes things and calls `ai-review resolve` -> the user goes back to the dashboard and watches.

They want it seamless in both directions: (1) sending a review reaches the right Desktop session with minimal manual steps; (2) the dashboard shows the agent picking it up, progress, resolutions, `updated` files and the final answer, live. The same must work for the coming GitHub-PR-comments flow (docs/gh-comments-options.md, docs/pr-link-options.md) and for "agent finished, ready for re-review".

## Findings: how the loop works today (code evidence)

### Dashboard -> agent

| Step | Where | What it does |
|---|---|---|
| Submit | `web/src/state/useSendReview.ts` `send()` | `flushSave()`, then `POST /sessions/:id/review/send {decision, dispatch}`. `dispatch` is `target==='current' && origin!=='desktop'`. |
| Snapshot | `server/src/send.ts` `sendReview` | Writes `review/sent/<stem>.json\|.md\|.patch`, stamps `review.json`. With `dispatch` and no active run: `adapter.canResume()` then `runs.start()` (headless `claude -p --resume`), else returns `pending: {reason}`. |
| Desktop origin | `useSendReview.send` | `target==='current'`: copies `/scout-apply-review <id>` to the clipboard. `target==='new'`: `window.location.assign(claude://code/new?q=<cmd>&folder=<repo>)`. Both then show `PendingPanel`. |
| Agent notices | `cli/templates/hooks/ai_review_pending_feedback.sh` | `UserPromptSubmit` hook only. Runs `ai-review pending --repo $cwd`, injects `additionalContext` ("N open comments on session X, run /scout-apply-review") once per (Claude session, pending fingerprint) via a marker in `$GIT_DIR/ai-review/nagged-<session>`. Fires only when the user sends some prompt in that session. |
| Agent reads | `cli/templates/skills/scout-apply-review/SKILL.md` | Shell-injects `ai-review feedback <id>` and `ai-review status <id>`; works the checklist; PR step only on Approve. |

Guard rails that already hold: headless run uses `--permission-mode acceptEdits`, an explicit `--allowedTools` list, `--max-turns 80`, `--max-budget-usd 10`, never `bypassPermissions` (`server/src/agent/claude-code.ts`).

### Agent -> dashboard

The agent has exactly two channels, both plain files watched by the server:

| Agent action | File | Watcher (`server/src/watcher.ts`) | Dashboard reaction (`SessionLiveUpdates.tsx`) |
|---|---|---|---|
| `ai-review resolve` | `review/resolutions.json` | `resolutions.updated` | `reloadReview()`; comment cards show the resolution; status becomes `updated` |
| Edits files in the repo | working tree | `RepoWatcher` -> `tree.updated` (fingerprint) | `reloadDetail()`, toast "N files changed on disk", `updated` chip, verdict loses pin |
| Writes evidence/extras/spec/PR text | session folder | `session.updated` (300 ms debounce) | `reloadDetail()` |
| Headless run only | `review/runs/*.json` + SSE `/runs/:id/events` | `run.updated` | live transcript, `agent-working` status |

`watcher.ignored()` prunes everything under `review/` except `review.json`, `resolutions.json` and `runs/*.json`, so any new file needs a watcher change.

### What each side knows, and when

| | Knows | Does not know |
|---|---|---|
| Dashboard | A resolution landed; files changed on disk. For headless runs: everything (stream-json). For `claude agents --json` (already called by `listLiveAgents`): pid, sessionId, `idle\|busy\|waiting` of any live session, Desktop sessions included (verified on 2.1.241 in research/06). | Whether any Desktop session received the feedback; which session picked it up; whether it is working, waiting for a permission prompt, or done; the final answer; "working on comment 3/7". `agent-working` status derives from an active run only, so it is never shown for a Desktop session. |
| Agent (Desktop session) | Feedback, only after the user types a prompt (hook) or pastes `/scout-apply-review`. | That a send happened while it sat idle. Nothing pushes. |

### Two concrete bugs found

1. **Origin detection never says Desktop.** `cli/src/commands/init.ts:89` hardcodes `entrypoint: previous?.agent.entrypoint ?? 'cli'` and no code reads an environment variable. `sessionOrigin()` (`web/src/lib/runs.ts`) therefore returns `cli` for real sessions; only the web test fixture uses `desktop`. Consequence: Submit "Current session" asks the server to dispatch a headless resume; `canResume` then refuses because the Desktop session is live ("still open ... run as a fork"), so the user ends up on the pending panel anyway, with a misleading target label. The docs do not document an env var that identifies the client (CLAUDECODE and CLAUDE_CODE_CHILD_SESSION only say "spawned by Claude Code"). Unverified: `CLAUDE_CODE_ENTRYPOINT` and its Desktop value.
2. `PendingPanel` for `current` tells the user to "send any message in your open session". That is the manual step the user wants gone.

### Manual steps per round trip today (Desktop, existing session)

1 Submit; 2 switch to Desktop; 3 find the right session in the sidebar; 4 paste; 5 Enter (+ permission prompts); 6 switch back; 7 watch/refresh (resolutions are live, but nothing says Claude started or finished). New-session variant: Submit, click link, confirm the folder dialog, Enter, plus the new session has no context of the original work (acceptable: the feedback markdown and the `.patch` are self-contained).

## Findings: what Desktop / Claude Code can do (verified against docs, 2026-10-19)

| Capability | Verified facts | Source |
|---|---|---|
| Hooks run in Desktop | "Hooks fire wherever Claude Code runs: terminal, IDE extensions, the Desktop app, and cloud sessions." Desktop reads the same `~/.claude/settings.json` and project `.claude/settings.json`. | code.claude.com/docs/en/hooks, /desktop |
| Hook events | 33 events incl. `SessionStart` (matchers startup/resume/clear/compact/fork; may return `additionalContext`), `UserPromptSubmit`, `Stop`, `StopFailure`, `Notification` (matchers `permission_prompt`, `idle_prompt`, `elicitation_dialog`; side-effect only), `PostToolUse`, `SessionEnd`, `FileChanged`. `Stop` input carries `last_assistant_message`; `Stop` may return `additionalContext` that continues the turn. | /hooks |
| Hook handler types | `command` (supports `async`), `http` (POST body, headers), `mcp_tool`, `prompt`, `agent`. `SessionStart` supports only `command` and `mcp_tool`. | /hooks |
| MCP in Desktop | Desktop adds MCP servers via settings files; for a stdio server named in both `~/.claude.json` (user) and `.mcp.json`, the Code tab uses the `~/.claude.json` definition. Project `.mcp.json` servers need approval in interactive sessions. `list_changed` refreshes tools/prompts/resources in interactive sessions. MCP prompts appear as `/mcp__server__prompt` commands. Tool output cap 25k tokens. | /mcp |
| Channels | Research preview, claude.ai/Console auth only, Team/Enterprise admin must enable, requires `--channels` / `--dangerously-load-development-channels` at launch (flag hidden from `--help`). Nothing documented for launching Desktop sessions with flags. | /channels |
| Deep links, CLI | `claude-cli://open?cwd=...&q=...` opens a terminal, prefilled not sent, `q` max 5,000 chars. Not Desktop. | /deep-links |
| Deep links, Desktop | `claude://code/new` with `q` (alias `prompt`), `folder`; `file` accepted but unsupported. Folder is untrusted: confirmation dialog every time. Only first `folder` used. `q` truncated at ~14,000 chars. Prefilled, not auto-sent. **No documented link to open or resume an existing Code session by id** (only claude.ai chats/projects have ids). | support.claude.com/en/articles/14729294 |
| Cross-session messaging | Since v2.1.224. Each session may bind an inbox socket exported to hooks and Bash as `CLAUDE_CODE_MESSAGING_SOCKET` (+ `CLAUDE_CODE_MESSAGING_TOKEN`). A message to an idle session starts a new turn. Inbound controls (`crossSessionInbound`) decide deliver/hold/refuse; Desktop cannot show the approval dialog and keeps held messages until `dialogExpiry`. Wire format beyond the auth line is **not documented**; not a supported external API. | /cross-session-messaging |
| Desktop "work across sessions" | In-app tool surface to list/read/message other Desktop sessions. Not documented as usable by external processes. | /desktop |
| Scheduling | Desktop scheduled tasks: local, only while the app is open and the Mac awake, new session per run under "Scheduled", min interval 1 min, per-task permission mode, notification on fire. `/loop`: session-scoped, fires between turns, 1 min to 1 h, 7-day expiry, not restored on resume for self-paced loops. `Monitor` tool: background command whose output lines are fed back to Claude "mid-conversation"; background monitors are never restored on resume. | /desktop-scheduled-tasks, /scheduled-tasks, /tools-reference |
| Notifications | Desktop sends an OS notification when a Code session finishes a task and you are not viewing it. `PushNotification` tool exists. | /desktop, /tools-reference |
| Resume safety | "Don't run `claude --resume` on a conversation whose process is still running"; `--fork-session` still shares the files. Two writers on one transcript corrupt it. | /desktop |

Unverified (do not build on without a spike): whether Desktop sessions bind the inbox socket and what the line protocol is; whether a `Monitor` line wakes an idle Desktop session or only reaches Claude at the next turn; `CLAUDE_CODE_ENTRYPOINT` values; whether `claude agents --json` still lists Desktop sessions on the user's current version (it did on 2.1.241); whether Desktop passes `session_id` in hook input identically to the CLI (the existing hook already relies on it).

## Options

All keep the rule "local only, no credentials, never `bypassPermissions`".

**A. `ai-review mcp` server registered for Desktop.** A stdio MCP server (`ai-review mcp`) in `~/.claude.json` user scope exposing `review_pending`, `review_feedback`, `review_claim`, `review_progress`, `review_resolve`, `review_finish`, and an MCP prompt `apply_review` (`/mcp__scout__apply_review`). Dashboard -> agent: pull only; still needs a trigger (hook or the user). Agent -> dashboard: structured tool calls, no Bash permission prompt, one place for schema validation.

**B. Hook-first with presence.** Keep files as the contract. Add: `SessionStart` + `UserPromptSubmit` (claim: "this Claude session saw feedback X at T"), `Stop` (posts `last_assistant_message` and "turn finished"), `Notification` (permission prompt / idle), optional async `PostToolUse` heartbeat. Plus server-side presence from `claude agents --json` (busy / waiting) for the review's session. Skill additions: `ai-review claim`, `ai-review progress --comment cN`, `ai-review finish`.

**C. One-click launcher + return trip.** Submit opens (server-side `open` or the existing link) `claude://code/new?q=/scout-apply-review <id>&folder=<repo>`; clipboard fallback for an existing session; the skill's final message already ends with the dashboard URL (http link, clickable in Desktop). Fix origin detection so the UI offers the right primary action.

**D. Companion session that waits.** A session runs `/review-watch`, which starts a `Monitor` on `ai-review wait <repo>` (blocks until a new send, prints one line) and applies it; or a Desktop scheduled task polls every minute.

**E. Push into the live session.** Dashboard server posts into the Desktop session's inbox socket (recorded by the claim hook from `CLAUDE_CODE_MESSAGING_SOCKET`), so Submit starts a turn in the exact session with its context. No paste at all.

**F. Channels.** Not viable for Desktop-launched sessions (launch flag, preview, org switch). Rejected.

### Comparison

| | A. MCP | B. Hooks + presence | C. Launcher | D. Companion | E. Socket push |
|---|---|---|---|---|---|
| Dashboard -> agent | pull; needs trigger | needs a prompt in the session (existing nag) | link/clipboard prefill, user presses Enter | automatic after one-time `/review-watch` per session | automatic, existing session |
| Agent -> dashboard | structured, validated | claim, Stop answer, permission-waiting, busy/idle | final URL in the answer | same as B/A | same as B/A |
| Manual steps per round trip | 4 (trigger remains) | 4 (adds visibility, not push) | 3 new session (Submit, confirm folder, Enter) | 1 after setup; setup repeated every session (not restored on resume) | 1 |
| Live progress visibility | per tool call, if the model calls it | claim + turn end + waiting; "comment 3/7" from resolutions | none | as A/B | as A/B |
| Install | global `~/.claude.json` entry; approval prompt if per project | per repo (`ai-review install`, already exists) + 2 hook entries | none (server-side) | skill per repo; scheduled task global | per repo hook + server code |
| Security | extra process; tools can write only the session folder | shell hooks run with user rights; keep read/append only | folder confirmation dialog stays (good) | autonomous edits while the user may be mid-conversation; still `acceptEdits` of the session | unsupported API, sender classed as external; may be held or refused |
| Failure modes | server not started, tool search latency, model skips calls | hook not firing (user disabled hooks), marker drift, model never says done (Stop still fires) | link blocked by browser, folder dialog, stale `repo` path | monitor lost on resume, wakeup not delivered, clutter/cost for scheduled variant | protocol changes, socket stale, hold queue |
| Effort | M | S-M | S | M (S for the skill, M for `wait`) | L + spike |
| PR comments flow | add `pr_*` tools | same claim/progress files, keyed by `kind` | link with `/scout-pr-comments <id>` | same watcher | same |
| Verdict | nice-to-have, not needed first | **do first** | **do first** | opt-in after B | spike only |

### Why A is not first

Every A tool is a thin wrapper over a CLI command that already works in Desktop (`Bash(ai-review *)` is allowed by `ai-review install`). A adds no push, so it does not fix the actual gap (nothing wakes the session, nothing reports back unless the model chooses to). Revisit when `mcp_tool` hooks or channels become usable for Desktop, or when tool-call latency of Bash proves painful. (Same conclusion as research/06 section 3c.)

## Recommendation

Do **B + C now, D as opt-in, E as a time-boxed spike**, in the slices below. The smallest slice that changes how the loop feels is slice 1 (presence, no agent cooperation) plus slice 2 (claim and final answer).

Resulting round trip, existing flow: Submit (1 click) -> Desktop link opens with the command prefilled -> confirm folder (Desktop requirement) -> Enter -> the dashboard shows "Claude picked this up", "addressing comment 3/7", "needs your approval in Desktop", then "Claude finished: 6 resolved, 1 open" with the final answer and a re-review call to action. Three manual steps down from seven, and zero blind waiting. E (if the spike works) makes it one.

### Proposed contract additions (Contract v3 candidates)

```
review/agent.json            dashboard-readable, written ONLY by `ai-review claim|progress|finish` and hooks (single writer per field; atomic rename)
  { schemaVersion, sessionId,
    kind: 'review' | 'pr-comments' | 'open-pr',
    forSent: '<stem>' | null,                 // which send this claim answers
    agentSessionId: string,                   // the Claude session that picked it up (may differ from manifest.agent.sessionId)
    entrypoint: string | null, socket: string | null,   // socket only if the E spike pays off
    state: 'claimed' | 'working' | 'waiting' | 'done' | 'failed' | 'stale',
    claimedAt, lastSeenAt, current: { comment: 'c3' | null, note: string | null },
    finish: { at, summary: string (<= 4 KB), resolved: n, open: n } | null }
review/progress.jsonl        append-only, one event per line: { at, type: 'claimed'|'progress'|'waiting'|'stop'|'done', comment?, note?, tool?, message? } (cap 500 lines, rotate)
```

Server: whitelist both in `watcher.ignored()`/`classify()`, new `StoreEvent` `agent.updated {sessionId}`, `GET /sessions/:id/agent` (merges `agent.json`, last N events, derived `stale` when `lastSeenAt` older than 90 s while `working`, and the live `claude agents --json` status). Derived session status: `agent-working` when `agent.state` is `claimed|working|waiting` and not stale, in addition to an active run. Summary field `agent: { state, since }`. Bump schema per D8 rules; per the project memory there is no migration for old sessions.

`ai-review` verbs: `claim <id> [--kind] [--agent-session] [--for <stem>]`, `progress <id> [--comment cN] [--note] [--waiting]`, `finish <id> [--summary]`. All validate against the session and never touch repo files.

### Slices (each shippable, each with acceptance criteria)

**1. Presence from `claude agents --json` (server + web, no agent work).** S.
- Server: `GET /sessions/:id/agent-presence` -> `{ live, status: idle|busy|waiting|unknown, waitingFor?, pid }` for `manifest.agent.sessionId`; poll with a 3 s cache; 404-safe when the `claude` binary is missing (reuse `listLiveAgents`).
- Web: Submit/rail chip "Claude is working" / "Claude is waiting for you (permission)" / "Claude session idle" while the page is focused; poll 3 s only on pages of that session.
- Accept: with a fake `claude` script returning busy, the chip shows within 4 s and clears when idle; no process spawned when the tab is hidden; unit test for parsing (incl. malformed JSON); no change when the binary is absent.

**2. Fix origin and the Submit target.** S.
- `ai-review init` records `entrypoint` from the environment when present (spike: print `env | grep CLAUDE` inside a Desktop session to learn the real variable; store the raw value) and the dashboard treats "agent session is live in `claude agents`" as Desktop-or-CLI-interactive: never dispatch headless, show the Desktop actions as primary.
- Accept: a Desktop-created session (manual check) gets a non-`cli` origin; Submit for it never calls `canResume`-refusal path; tests cover origin mapping.

**3. Claim + progress + finish (CLI, skill, watcher, UI).** M.
- CLI verbs above; `scout-apply-review` skill: `claim` as step 0, `progress --comment cN` before each comment, `finish --summary` last (hook is the safety net, see 4).
- Watcher + `agent.updated` + `GET /sessions/:id/agent`; web "Agent activity" panel on Submit and a rail line: "Claude picked this up 2 min ago", "Addressing c3 (3 of 7 resolved)", "Finished 40 s ago".
- Accept: scripted run (`ai-review claim; progress; resolve; finish`) updates the panel without reload within 1 s of each write; `stale` appears after 90 s without heartbeat; schema + CLI tests; e2e on the fixture store; `AI_REVIEW_HEADLESS` runs write the same files (the headless run also claims).

**4. Hooks: Stop, Notification, SessionStart.** M.
- New templates `ai_review_stop.sh`, `ai_review_notify.sh` (shell + `jq`, append-only, `async: true`, 5 s timeout, no Node start-up). `UserPromptSubmit` hook also writes the claim when the prompt starts with `/scout-apply-review <id>` or it injects the nag. Stop: if a claim exists for this `session_id` in `done`-pending state, append `stop` with `last_assistant_message` (<= 4 KB), set `state` from open count (`done` when no open sent comments, else `waiting-for-user` shown as "Claude stopped with 2 open"). Notification (`permission_prompt`, `idle_prompt`): set `waiting`. Installed via `ai-review install` (settings merge already handles `hooks`; add events and matchers).
- Accept: piping sample hook JSON into each script produces the expected files; hooks no-op when no claim, no `jq`, or no `ai-review`; install is idempotent; no hook output ever blocks a turn (never return `decision: block`, never use Stop `additionalContext`).

**5. Launcher: one click, return trip.** S.
- Primary Submit action for Desktop origin: server-side `POST /sessions/:id/launch` runs `open "claude://code/new?q=...&folder=..."` (macOS only, argv array, `q` built from `applyReviewCommand` of a validated id; no shell). Clipboard copy stays as the fallback; PendingPanel text changes from "send any message" to the exact steps ("confirm the folder, press Enter").
- Re-review call to action: when `agent.state` becomes `done`, a toast with "Re-review N updated files" (link to Files filtered to `updated`), tab title badge, and an optional browser `Notification` (permission requested only on click). Desktop already raises an OS notification when its session finishes and the user is elsewhere; do not duplicate it with `osascript`.
- Accept: with `open` stubbed, the launch route builds the exact URL (unit test for encoding, `q` < 14,000 chars, refuses ids not matching `SESSION_ID_RE`); the toast appears once per `done` transition; no navigation when not on macOS.

**6. PR comments reuse (with the GitHub-comments feature).** M, after its contract lands.
- Same `agent.json` with `kind: 'pr-comments'`; `ai-review pr-resolve` also bumps `progress`; "Address open comments" uses the launcher with `/scout-pr-comments <id>`; the pending hook counts open PR threads only after an explicit dispatch marker (`review/dispatch.json`, written by the button), so external comments never nag by themselves. `open-pr` uses the same claim for "creating PR" state (docs/pr-link-options.md `creating` state).
- Accept: the PR page shows working/queued cards from `agent.current`; no PR comment is counted in Submit's open comments; hooks ignore PR threads without a dispatch.

**7. Opt-in companion (`/review-watch`).** M.
- Skill `review-watch` + `ai-review wait --repo <path> --timeout 55m` (blocks until a new send, prints one line, exits). The skill starts it with `Monitor`, applies the feedback when a line arrives, then restarts the monitor.
- Accept: spike first on the user's Desktop: does an idle session wake? If not, document that it only reacts at the next turn and drop this slice.

**8. Spike E: socket push (time-boxed, 0.5 day).** Record `CLAUDE_CODE_MESSAGING_SOCKET` in the claim from `SessionStart`; from a scratch script send a single line and observe delivery, hold, or refusal in a Desktop session. Ship nothing unless it works unattended and survives a Desktop update; keep it behind a setting and off by default because the wire format is undocumented.

## Risks

- **Hooks are shell on the user's machine.** Keep them read-and-append only, no network, never read `~/.claude`; reuse the existing marker dir under `$GIT_DIR/ai-review`. A repository may copy `.claude/` to sibling clones (a pack's after-install step does this for qbdvision): hook files must not hard-code repo paths.
- **Model compliance.** Skill-driven `progress`/`finish` may be skipped; hooks (Stop) and presence are the backstops, and `stale` makes silence visible instead of lying.
- **Claim attribution.** Concurrent Desktop sessions in the same repo: claim by (`agentSessionId`, `forSent`), never by repo alone. A second claim for the same send replaces the first and is recorded in `progress.jsonl`.
- **Assistant text in a local file.** `last_assistant_message` may quote code or secrets seen in the session; it stays in `~/.ai-review` (local, same trust as the transcript). Truncate and do not render as HTML.
- **Doc drift.** Hooks, Desktop links and Monitor are fast-moving; each slice must keep a "verified on <version>" line and degrade to today's behaviour when something is missing.
- **Headless fork is still tempting.** Keep "Run as fork" as an explicit fallback only; never resume a live Desktop transcript.
- **Polling cost.** Presence polling spawns `claude agents --json` (5 s timeout); cache per server, poll only while a client is viewing that session.

## Open questions (default answers)

1. Does Desktop set an environment variable that identifies it? Default: unknown; slice 2 starts with a 10-minute spike (`env` in a Desktop session) and stores the raw value.
2. Should Submit auto-open the Desktop link? Default: yes for Desktop origin on macOS, with the clipboard copy as well; the user can turn it off in a setting.
3. New session or the original one? Default: new session by link (works today, self-contained feedback); existing session via clipboard until the socket spike proves out.
4. Do we show the final answer text in the dashboard? Default: yes, truncated to 4 KB, collapsed, plain text.
5. Poll or push for presence? Default: poll every 3 s only while the Submit page or rail is visible; replace with hook events once slice 4 is in.
6. Should hooks be shared (`settings.json`) or local? Default: local (`settings.local.json`), as `install` does today.
7. Register the MCP server (option A) anyway? Default: no, until a concrete need appears (tool-call latency, approval prompts, `mcp_tool` hooks).
8. Use the Desktop scheduled-task poll (D variant)? Default: no; one session per run, only while the app is open, and it clutters the sidebar.
9. Notification channel for "finished"? Default: Desktop's own OS notification plus the in-dashboard toast and tab badge; no `osascript`.
10. Who is allowed to write `agent.json`? Default: only `ai-review` verbs and the two hook scripts, validated by the shared zod schema; the server only reads it.

## Sources

- Hooks: https://code.claude.com/docs/en/hooks
- Desktop: https://code.claude.com/docs/en/desktop
- Desktop scheduled tasks: https://code.claude.com/docs/en/desktop-scheduled-tasks
- Scheduled tasks and /loop: https://code.claude.com/docs/en/scheduled-tasks
- MCP: https://code.claude.com/docs/en/mcp
- Channels: https://code.claude.com/docs/en/channels
- Cross-session messaging: https://code.claude.com/docs/en/cross-session-messaging
- Deep links (CLI): https://code.claude.com/docs/en/deep-links
- Deep links (Desktop): https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link
- Tools reference (Monitor, PushNotification): https://code.claude.com/docs/en/tools-reference
- Env vars: https://code.claude.com/docs/en/env-vars
- Repo evidence: `cli/src/commands/{init,pending,resolve,status,feedback}.ts`, `cli/templates/hooks/ai_review_pending_feedback.sh`, `cli/templates/skills/scout-apply-review/SKILL.md`, `server/src/{send,watcher}.ts`, `server/src/agent/claude-code.ts`, `web/src/state/useSendReview.ts`, `web/src/components/layout/SessionLiveUpdates.tsx`, `web/src/components/submit/PendingPanel.tsx`, `web/src/lib/runs.ts`, research/03 and 06, docs/gh-comments-options.md, docs/pr-link-options.md.

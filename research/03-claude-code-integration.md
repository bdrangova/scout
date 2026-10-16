# Claude Code Integration Research: AI Code-Review Dashboard

*Researched 2026-09-25. The old `docs.claude.com/en/docs/claude-code/*` and `docs.claude.com/en/api/agent-sdk/*` URLs now redirect to `code.claude.com/docs/en/*`. The CLI installed on this machine is `2.1.241`. Anything marked "v2.1.257+" below needs `claude update` first.*

## 1. Hooks

**Events (33):** `SessionStart`, `Setup`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `MessageDisplay`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`, `ElicitationResult`, `SessionEnd` ([hooks reference](https://code.claude.com/docs/en/hooks)).

**What a hook receives on stdin.** Every event gets `session_id`, `prompt_id`, `transcript_path`, `cwd`, `permission_mode` and `hook_event_name`. Some events add more:
- `effort` on tool-context events.
- `scratchpad_dir` (v2.1.257+).
- `agent_id` and `agent_type` inside subagents.

```json
// Stop
{"session_id":"abc123","transcript_path":"~/.claude/projects/.../<id>.jsonl","cwd":"/Users/...",
 "permission_mode":"default","hook_event_name":"Stop","stop_hook_active":false,
 "last_assistant_message":"I've completed the refactoring...","background_tasks":[],"session_crons":[]}
// SessionEnd; reason is clear | resume | logout | prompt_input_exit | other
{"session_id":"abc123","transcript_path":"...","cwd":"/Users/...","hook_event_name":"SessionEnd","reason":"other"}
```

At `Stop`, read `last_assistant_message` rather than the transcript. The JSONL file is written asynchronously and can lag behind.

**Blocking and injecting context: yes.**
- **`Stop` / `SubagentStop`:**
  - `{"decision":"block","reason":"…"}` keeps Claude working. Exiting with code 2 and a stderr message does the same.
  - `{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"…"}}` also continues the conversation, but shows as feedback rather than an error.
  - Check `stop_hook_active` to avoid loops. Claude Code force-stops after 8 consecutive continuations.
- **Other events:** `SessionStart`, `UserPromptSubmit`, `PostToolUse` and others accept `hookSpecificOutput.additionalContext` (up to 10,000 characters). Plain stdout also reaches Claude on `SessionStart` and `UserPromptSubmit`.
- **Any event:** `{"continue":false,"stopReason":"…"}` and `systemMessage`.
- **`SessionEnd` cannot block anything**, and its JSON output is discarded.

**Hook types:**
- `command`, with `async`, `asyncRewake` and `args` (exec form).
- `http`, which POSTs the same JSON. If the connection fails or returns non-2xx, the session just continues.
- `mcp_tool`, `prompt`, and `agent` (experimental).

**Where to define them, and matchers.**
- **Per project:** `.claude/settings.json` (committed) or `.claude/settings.local.json`.
- **Elsewhere:** `~/.claude/settings.json`, a plugin's `hooks/hooks.json`, and skill or subagent frontmatter.
- **Trust:** project hooks only run after you accept the workspace trust prompt.
- **Matchers exist for:**
  - tool events (tool name, or a regex such as `mcp__.*`)
  - `SessionStart` (`startup|resume|clear|compact|fork`)
  - `SessionEnd` (the reason)
  - `SubagentStop` (agent type)
  - `PreCompact` (`manual|auto`)
- **No matchers:** `Stop` and `UserPromptSubmit` have none, and a `matcher` there is silently ignored.
- **`if` filter:** tool events also take a permission-rule filter, e.g. `"if": "Bash(git *)"`.

**Which hook for "agent finished → package the review": `Stop`.** Caveat: it fires at the end of every turn, not only when a task is done. So:
- Make the packager idempotent by keying it on a hash of `git diff HEAD`.
- Have the agent send the explicit "done" signal through an MCP tool (§2c).
- Use `SessionEnd` only for a final flush. It has a 1.5 s default budget, which you can raise per hook with `timeout` (up to 60 s) or with `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`.
- `claude -p` kills still-running async hooks at exit, so hand heavy work to the dashboard or to a detached process.

## 2. Sending feedback back to Claude Code

### a. CLI

All of these flags are confirmed in the [CLI reference](https://code.claude.com/docs/en/cli-reference):
- **Session:** `-p/--print`, `-r/--resume <id|name|/abs/path.jsonl>`, `-c/--continue`, `--session-id <uuid>` (choose the ID up front), `--fork-session`, `--name`.
- **Input/output:** `--output-format text|json|stream-json`, `--input-format text|stream-json`, `--include-partial-messages`, `--replay-user-messages`, `--verbose`, `--include-hook-events`, `--json-schema`.
- **Prompt and tools:** `--append-system-prompt[-file]`, `--allowedTools` / `--disallowedTools` / `--tools`.
- **Permissions:** `--permission-mode default|acceptEdits|plan|auto|dontAsk|bypassPermissions`, `--permission-prompt-tool`.
- **MCP and limits:** `--mcp-config`, `--strict-mcp-config`, `--max-turns`, `--max-budget-usd`.

```bash
claude -p --resume "$SID" "/apply-review r-42" \
  --output-format stream-json --verbose --include-partial-messages \
  --permission-mode acceptEdits --allowedTools "Read,Edit,Bash(npm test *)"
```

Resuming by ID works non-interactively and keeps full context: history (including tool calls and results), model, and agent ([sessions](https://code.claude.com/docs/en/sessions), [headless](https://code.claude.com/docs/en/headless)).

Gotchas:
- **Permission mode:** with `-p`, always pass `--permission-mode`, because the restore rules differ.
- **Flags not restored:** re-pass `--mcp-config`, `--settings`, `--add-dir` and `--plugin-dir` on every resume.
- **System prompt:** it is snapshotted on the session's first request. `--append-system-prompt` on a resume only takes effect after compaction (unless you pass `--system-prompt-snapshot off`, v2.1.257+). Put the feedback in the prompt instead.
- **Finding sessions:** `-p` and SDK sessions don't appear in the picker or in plain `--continue`. `--resume <id>` still finds them in any project.
- **Long-lived worker:** `--input-format stream-json` accepts JSONL messages on stdin in the SDK's `SDKUserMessage` shape: `{"type":"user","message":{"role":"user","content":"…"},"parent_tool_use_id":null}`.
- **Two processes on one session:** the docs don't cover this. Before resuming, check `claude agents --json` for a live entry with that `sessionId` (`status: busy|waiting|idle`), or use `--fork-session`.

### b. Agent SDK (`@anthropic-ai/claude-agent-sdk`)

`query({ prompt: string | AsyncIterable<SDKUserMessage>, options })` returns an async generator of `SDKMessage` (`system`/`init`, `assistant`, `user`, `stream_event`, `result`). It also exposes `interrupt()`, `setPermissionMode()`, `streamInput()` and `close()` ([TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)).

Relevant options: `resume`, `forkSession`, `sessionId`, `continue`, `cwd`, `canUseTool`, `hooks`, `mcpServers`, `settingSources`, `includePartialMessages`, `permissionMode`, `allowedTools`. `settingSources` loads user, project and local settings by default, like the CLI. For reading past sessions there are `listSessions()` and `getSessionMessages()`.

```ts
const review = createSdkMcpServer({ name: "review", tools: [
  tool("get_review_feedback", "Open review items", { reviewId: z.string() },
    async ({ reviewId }) => ({ content: [{ type: "text", text: await loadFeedback(reviewId) }] })) ]});
const q = query({ prompt: "/apply-review r-42", options: {
  resume: sid, cwd: repo, systemPrompt: { type: "preset", preset: "claude_code" },
  mcpServers: { review }, permissionMode: "acceptEdits", includePartialMessages: true,
  canUseTool: async (name, input) => uiApproval(name, input) } }); // {behavior:"allow",updatedInput}|{behavior:"deny",message}
for await (const m of q) sse.write(m);
```

**It is suitable for a local Node server:**
- It runs the Claude Code binary bundled with the package.
- It streams typed messages you can forward to the UI over SSE or WebSocket.
- `canUseTool` lets the dashboard answer permission prompts.
- Streaming-input mode lets you push follow-up feedback into a live session.

**Caveats:**
- The default `systemPrompt` is a minimal prompt, not Claude Code's. Set the `claude_code` preset as shown.
- The V2 `unstable_v2_*` session API was removed in 0.3.142, so ignore older examples that use it.
- The SDK docs tell SDK-built agents to use API-key auth; offering claude.ai login in third-party products requires Anthropic approval. Shelling out to your own `claude` CLI uses your existing login instead.

### c. MCP

Yes, this works. A project-scoped stdio server goes in `.mcp.json`. Interactive sessions ask once for approval; `-p` and SDK sessions load it automatically.

```json
{"mcpServers":{"review-dash":{"command":"node",
  "args":["${CLAUDE_PROJECT_DIR:-.}/.ai-review/mcp/server.js"],
  "env":{"REVIEW_DASH_URL":"http://127.0.0.1:4545"}}}}
```

- **Add from the CLI:** `claude mcp add --scope project review-dash -- node .ai-review/mcp/server.js`.
- **HTTP variant hosted by the dashboard:** `claude mcp add --transport http --scope project review-dash http://127.0.0.1:4545/mcp`. In JSON, a `url` entry needs `"type":"http"`.
- **Pre-approve its tools:** `"permissions":{"allow":["mcp__review-dash__*"]}`.
- **Resources are supported:** prompts can mention `@review-dash:review://feedback/latest`, and Claude gets built-in tools to list and read resources.
- **Prompts are supported:** they become commands, e.g. `/mcp__review-dash__apply_feedback r-42` ([MCP](https://code.claude.com/docs/en/mcp)).

### d. File handoff with a skill

Custom commands have been merged into skills. `.claude/commands/apply-review.md` and `.claude/skills/apply-review/SKILL.md` both create `/apply-review`. Skills are preferred because they add supporting files and the `name` and `paths` fields ([skills](https://code.claude.com/docs/en/skills)).

- **Frontmatter:** `description`, `disable-model-invocation`, `argument-hint`, `arguments`, `allowed-tools` (pre-approves tools for that turn only), `context: fork`, `model`, `effort`, `hooks`.
- **Substitutions:** `$ARGUMENTS`, `$0` and so on, `${CLAUDE_SESSION_ID}`, `${CLAUDE_PROJECT_DIR}`.
- **Dynamic context:** `` !`cmd` `` runs a shell command and inserts its output before Claude sees the skill.

```markdown
---
description: Apply reviewer feedback from the review dashboard
disable-model-invocation: true
argument-hint: [review-id]
allowed-tools: Read Edit Bash(cat *) Bash(git diff *) mcp__review-dash__*
---
Apply review $ARGUMENTS. Current feedback:
!`cat "${CLAUDE_PROJECT_DIR}/.ai-review/feedback/latest.md"`
Resolve each item via mcp__review-dash__resolve_feedback_item, then republish.
```

This runs interactively, as `claude -p --resume <id> "/apply-review r-42"`, or as SDK `prompt: "/apply-review r-42"`.

### e. Sending a message into a running session

- **Channels (research preview): built for exactly this.**
  - An MCP server declares `capabilities.experimental['claude/channel']` and emits `notifications/claude/channel` with `{content, meta}`.
  - The message appears in the open session as `<channel source="review-dash" …>`. If Claude is busy, it waits for the next turn.
  - A custom channel needs `claude --dangerously-load-development-channels server:review-dash`, which shows a warning dialog on every launch.
  - It requires claude.ai or Console auth. On Team/Enterprise plans an admin must set `channelsEnabled`.
  - Claude Code sends no delivery confirmation ([channels](https://code.claude.com/docs/en/channels), [channels reference](https://code.claude.com/docs/en/channels-reference)).
- **Cross-session messaging (v2.1.224+):** built for session-to-session messages via `SendMessage`/`ListAgents`, not for outside apps.
  - Each session has an inbox socket exposed to hooks and Bash as `CLAUDE_CODE_MESSAGING_SOCKET` (plus `CLAUDE_CODE_MESSAGING_TOKEN`).
  - Only the auth line is documented, not the message format, and inbound controls apply. It is not a supported external API ([cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)).
- **Remote Control:** only claude.ai/code and the Claude apps can drive a session. It needs a subscription login and has no third-party API ([Remote Control](https://code.claude.com/docs/en/remote-control)).
- **Deep links:** `claude-cli://open?cwd=/abs/repo&q=<url-encoded, max 5000 chars>` opens a new terminal session with the prompt typed in but not sent ([deep links](https://code.claude.com/docs/en/deep-links)).
- **Background sessions:** `claude --bg`, `claude agents --json`, and `claude attach|logs|stop|respawn <id>`. Replying to a session is only possible inside the agent-view UI ([agent view](https://code.claude.com/docs/en/agent-view)).

**Recommended combination for v1:**
1. Files plus the `/apply-review` skill as the source of truth.
2. An MCP shim (a thin stdio server that forwards to the dashboard) for structured tools.
3. A "Send to Claude" button that resumes the session headlessly when it is idle or closed. Use CLI `-p --resume` first; switch to the SDK when you want approvals in the UI.
4. A `UserPromptSubmit` hook that adds "N unresolved review items; run /apply-review" as `additionalContext`.

**Tradeoffs:**
- **Channels** give true push but are a preview feature behind a dev flag and org settings.
- **Resume** is robust but must not collide with a session that is still live.
- **Files plus skill** work everywhere (terminal, Desktop, `-p`, SDK) but need something to trigger them; the hook covers that.

## 3. Session artifacts Claude Code already produces

**Where they live:** `~/.claude/projects/<cwd with non-alphanumerics replaced by "-">/<session-id>.jsonl`. Long names are truncated at 200 characters plus a hash. Retention is 30 days by default (`cleanupPeriodDays`).

**Official stance:** there is no official schema. The docs describe the format as internal and liable to change between versions. They point you to `/export`, `claude -p --output-format json|stream-json`, the hooks' `transcript_path`, or the SDK's `getSessionMessages()` ([sessions](https://code.claude.com/docs/en/sessions#where-transcripts-are-stored)).

**Shape observed in a real transcript on this machine.** Desktop sessions (`"entrypoint":"claude-desktop"`) write to the same store.
- **Record `type`s:** `user`, `assistant`, `attachment`, `system` (subtypes `stop_hook_summary`, `local_command`, `compact_boundary`), `queue-operation`, `last-prompt`, `ai-title`, `custom-title`, `mode`.
- **Common fields on every record:** `uuid`, `parentUuid` (records form a tree; see also `isSidechain`), `sessionId`, `timestamp`, `cwd`, `gitBranch`, `version`, `permissionMode`, `promptId`.
- **`assistant.message`:** the raw API message (`model`, `content[]` of `thinking` / `text` / `tool_use {id,name,input}`, `usage`, `stop_reason`).
- **`user.message.content`:** either a prompt string or `tool_result` blocks keyed by `tool_use_id`.
- **`user.toolUseResult`:** structured tool output.
  - Edit: `filePath, oldString, newString, structuredPatch, originalFile`
  - Write: `filePath, content, structuredPatch`
  - Bash: `stdout, stderr, interrupted`
  - Agent: `agentId, agentType, totalDurationMs, totalTokens`
- **Per-session folders:** `<session-id>/subagents/agent-<id>.jsonl` with a `.meta.json`, and `<session-id>/tool-results/` for oversized outputs.

For a "what the agent did" view, use `getSessionMessages()`. If you parse the JSONL for per-edit diffs from `structuredPatch`, parse defensively.

## 4. Screenshots and recordings

- **Playwright MCP** (`@playwright/mcp` 0.0.82):
  - `browser_take_screenshot {filename, fullPage, type}` saves PNG or JPEG.
  - With `--caps devtools` you also get `browser_start_video {filename, size, fps, cursor}` and `browser_stop_video` (WebM), `browser_video_chapter` title cards, and `browser_start_tracing`.
  - `--output-dir` only applies to files it names automatically; explicit filenames are relative to the workspace root.
  - Setup: `claude mcp add playwright -- npx @playwright/mcp@latest --caps=devtools --output-dir=.ai-review/current/media` ([README](https://github.com/microsoft/playwright-mcp)).
- **Chrome DevTools MCP:** `take_screenshot {filePath, fullPage}`. `screencast_start {filePath: .webm|.mp4}` requires `--experimentalScreencast=true` ([tool reference](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md)).
- **agent-browser** (a CLI the agent can call via Bash): `agent-browser screenshot shot.png --full`. `agent-browser record start demo.webm|demo.mp4` (needs ffmpeg) and `record stop` ([README](https://github.com/vercel-labs/agent-browser)).
- **Claude Code's built-in browsers:**
  - The Desktop Browser pane (configured via `.claude/launch.json`, with `autoVerify`) takes screenshots for Claude to look at. In this session its screenshot action has no save-to-file option.
  - Claude in Chrome (`claude --chrome`) can save screenshots to disk. Its recordings are GIF only, and the export arrives as a browser download ([desktop](https://code.claude.com/docs/en/desktop), [Chrome](https://code.claude.com/docs/en/chrome)).

**Most reliable approach:** have the agent write and run a Playwright Test spec for the flow under review.
- Configure `use: { screenshot: 'on', video: 'on', trace: 'on' }` and point `outputDir` at `.ai-review/sessions/<id>/media`.
- The result is deterministic, can be re-run, and produces PNG, WebM and a trace.
- If you need MP4, convert with `ffmpeg -i flow.webm -c:v libx264 -pix_fmt yuv420p flow.mp4` ([Playwright videos](https://playwright.dev/docs/videos)).
- Use Playwright MCP for one-off captures while implementing.

## 5. Claude artifacts

**No public per-user API returns an artifact's HTML.** The only official way to fetch artifact content is the org-admin Compliance API: `GET /v1/compliance/code/artifacts/{artifact_id}/versions/{version_id}` ([artifacts](https://code.claude.com/docs/en/artifacts)).

**Practical options:**
- **Your own artifacts:** the `Artifact` tool publishes a local HTML or Markdown file, so the source is already on disk. Record its path and the URL in the session manifest.
- **Someone else's artifact:** when Claude reads the URL, Claude Code saves the page's full source to a local file. The agent can copy it into the session folder. So yes, it has to be exported by the agent.

**It can't be iframed.** Checked on 2026-09-25:
- `claude.ai/code/artifact/<uuid>` sends `frame-ancestors 'self' chrome-extension://…`.
- `claude.ai/public/artifacts/<uuid>` sends `frame-ancestors 'self'`.

Show the saved source in a sandboxed `<iframe srcdoc>` and link out to the claude.ai URL.

## 6. Jira

- **Endpoint:** `GET https://<site>.atlassian.net/rest/api/3/issue/{issueIdOrKey}?fields=summary,description,status,attachment,issuetype,assignee&expand=renderedFields,names`. Other parameters: `properties`, `fieldsByKeys`, `updateHistory`, `failFast`. Required scope: `read:jira-work` ([OpenAPI spec](https://developer.atlassian.com/cloud/jira/platform/swagger-v3.v3.json)).
- **Auth:** `Authorization: Basic base64("email:api_token")` ([basic auth](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/)).
  - Classic tokens use the site URL.
  - Scoped tokens must use `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...`.
  - Tokens created after 2024-12-15 expire within one year ([API tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)).
- **Rendering ADF.** `fields.description` comes back as ADF JSON in v3.
  - **Simplest:** `expand=renderedFields` gives you `renderedFields.description` as HTML.
    - Sanitize it with DOMPurify.
    - Rewrite image and attachment URLs to a proxy on your Node server, because `fields.attachment[].content` and `/rest/api/3/attachment/content/{id}` need auth (Range requests are supported).
  - **High fidelity:** `@atlaskit/renderer` (React, heavy, actively published), with `@atlaskit/adf-utils` `traverse` to pull out media.
  - **Markdown for the agent:** `adf-to-md` (1.2.1, last released 2024-11), `adf-to-markdown` (1.0.1), or a small custom walker built on `adf-utils`.
- **Agent-side alternative:** Atlassian's Rovo MCP server, `claude mcp add --transport http atlassian https://mcp.atlassian.com/v2/mcp`, then authenticate with `/mcp` ([getting started](https://developer.atlassian.com/cloud/rovo-mcp/guides/getting-started/)). This environment already has claude.ai Atlassian connectors (`getJiraIssue`, `searchJiraIssuesUsingJql`), so a skill can have Claude write `jira/issue.md` into the session folder.

## Recommended v1 integration architecture

```
Claude Code session (terminal / Desktop)       Dashboard server (Node, 127.0.0.1:4545)
  Stop, SessionEnd hooks  --HTTP POST-->          packager: diff, notes, media -> .ai-review/sessions/<sid>/
  review-dash MCP (stdio)  <--HTTP-->             API: sessions, feedback items, Jira proxy, SSE -> React UI
  UserPromptSubmit/SessionStart hooks  <-- read .ai-review/feedback (pending -> additionalContext)
  /publish-review, /apply-review skills           "Send to Claude": check claude agents --json
  Playwright MCP / Playwright Test -> media/        idle/closed -> claude -p --resume <sid> "/apply-review <rid>"
                                                    live        -> mark pending (+ channel push later)
```

1. **Files on disk are the contract.** `.ai-review/` (gitignored) holds:
   - `sessions/<sid>/{manifest.json, diff.patch, notes.md, media/, artifacts/, jira/}`
   - `feedback/<rid>.{json,md}` plus `latest.md`

   The dashboard only indexes these files, so hooks, skills, MCP, CLI and SDK all work from the same data.
2. **Capture.**
   - When the agent considers the task done, it calls `publish_review_session` with notes, media paths, the Jira key and artifact URLs.
   - An HTTP `Stop` hook is the safety net, idempotent on the diff hash. The dashboard replies 2xx at once and packages in the background.
   - Optionally, a command `Stop` hook blocks once per new diff and tells Claude to publish, respecting `stop_hook_active`.
3. **Feedback.**
   - The reviewer records items with file, line range, severity, comment and status.
   - If the session is idle or closed, the dashboard resumes it headlessly and streams the `stream-json` output into the UI.
   - If it is live, the dashboard marks the feedback pending. The `UserPromptSubmit` or `SessionStart` hook surfaces it and the developer runs `/apply-review`.
4. **Upgrade path.** Add the `claude/channel` capability to the MCP shim for true push. Move to the SDK when you want sessions owned by the dashboard, with `canUseTool` approvals in the UI.

**Why this design:**
- Everything except the optional channel is generally available.
- Nothing depends on the internal transcript format.
- The same files work from the terminal, Desktop, `-p` and the SDK.
- The risky parts (resuming a live session, preview features, SDK auth policy) are confined to the "Send to Claude" button.

## Environment notes

- **Existing config:** `~/.claude/settings.json` has no hooks yet, and project MCP servers are approved through `enabledMcpjsonServers`.
- **Plaintext credentials:** `~/.claude/.mcp.json` and `~/.claude/mcp.json` store credentials directly in their `env` blocks (values not shown here). Switch these to `${VAR}` references, and never let the dashboard serve files from `~/.claude`.
- **Org-managed account:** there is an org policy-limits file (e.g. `require_trusted_devices`), which suggests channels and Remote Control may need an admin to enable them.
- **Servers needing OAuth:** these plugin MCP servers can't be used until authorized (run `/mcp` in an interactive session; claude.ai connectors are authorized in claude.ai settings): `plugin:engineering:` asana, atlassian, datadog, github, linear, notion, pagerduty, slack.

**Sources:**
- Claude Code docs:
  - [hooks](https://code.claude.com/docs/en/hooks)
  - [CLI reference](https://code.claude.com/docs/en/cli-reference)
  - [headless](https://code.claude.com/docs/en/headless)
  - [sessions](https://code.claude.com/docs/en/sessions)
  - [MCP](https://code.claude.com/docs/en/mcp)
  - [skills](https://code.claude.com/docs/en/skills)
  - [permissions](https://code.claude.com/docs/en/permissions)
  - [settings reference](https://code.claude.com/docs/en/settings-reference)
  - [channels](https://code.claude.com/docs/en/channels)
  - [channels reference](https://code.claude.com/docs/en/channels-reference)
  - [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)
  - [env vars](https://code.claude.com/docs/en/env-vars)
  - [Remote Control](https://code.claude.com/docs/en/remote-control)
  - [deep links](https://code.claude.com/docs/en/deep-links)
  - [agent view](https://code.claude.com/docs/en/agent-view)
  - [desktop](https://code.claude.com/docs/en/desktop)
  - [Chrome](https://code.claude.com/docs/en/chrome)
  - [artifacts](https://code.claude.com/docs/en/artifacts)
  - [tools reference](https://code.claude.com/docs/en/tools-reference)
- Agent SDK docs:
  - [overview](https://code.claude.com/docs/en/agent-sdk/overview)
  - [quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart)
  - [TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)
  - [sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
  - [streaming modes](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)
  - [skills](https://code.claude.com/docs/en/agent-sdk/skills)
  - [V2 preview (removed)](https://code.claude.com/docs/en/agent-sdk/typescript-v2-preview)
- Browser tooling:
  - [Playwright MCP](https://github.com/microsoft/playwright-mcp)
  - [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md)
  - [agent-browser](https://github.com/vercel-labs/agent-browser)
  - [Playwright videos](https://playwright.dev/docs/videos)
- Atlassian:
  - [Jira OpenAPI spec](https://developer.atlassian.com/cloud/jira/platform/swagger-v3.v3.json)
  - [Jira basic auth](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/)
  - [Jira REST v3 intro](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
  - [API tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)
  - [API tokens vs scoped tokens](https://community.developer.atlassian.com/t/api-tokens-vs-api-tokens-with-scopes/95162)
  - [Rovo MCP getting started](https://developer.atlassian.com/cloud/rovo-mcp/guides/getting-started/)
  - [Atlassian MCP server](https://github.com/atlassian/atlassian-mcp-server)
- npm registry entries for `adf-to-md`, `adf-to-markdown`, `@atlaskit/renderer` and `@atlaskit/adf-utils`

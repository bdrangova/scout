# Dashboard app design (Plan agent output, 2026-09-25)

Designed under the confirmed decisions in `04-design-decisions.md`. Verified facts that shape it: `@pierre/diffs@1.5.1` exposes `PatchDiff` / `MultiFileDiff` / `CodeView` from `@pierre/diffs/react`, `WorkerPoolContextProvider({ poolOptions: { workerFactory, poolSize } })`, `DiffLineAnnotation = { side: 'deletions'|'additions', lineNumber, metadata }` (lineNumber 0 = file-level slot), `SelectedLineRange {start,end,side?,endSide?}`, `renderGutterUtility(getHoveredLine)`, and interaction options `onLineSelected` / `onLineNumberClick`; scroll-jump #1075 is still open and is triggered by `lineAnnotations` identity changes. Streamdown plugins register as `plugins={{ mermaid }}` with a Tailwind `@source` per plugin package. media-chrome ships `media-chrome/react` wrappers. Claude CLI 2.1.241 supports `--resume <id>` from any directory, needs `--verbose` for `--include-partial-messages`, ends a turn gracefully on SIGINT, and cannot use `--permission-prompts` (2.1.259+). Ports 4545/4546 are free; ffmpeg is absent (fixture video must come from Playwright).

## 0. Framing decisions

- **Layout mirrors qbdash exactly**: root `package.json` (orchestration: `concurrently`, `@playwright/test`), `web/package.json`, `server/package.json`, separate lockfiles, no workspaces. `shared/` has no package.json; it is plain TS pulled in by both tsconfigs (`include: ["src", "../shared"]`, as qbdash already does) via a `@shared/*` alias (Vite `resolve.alias` + `server.fs.allow: ['..']`; tsconfig `paths`; `tsx` honours paths on the server). `zod@4` is pinned to the same version in both packages.
- **Server runtime**: Node 22, `"type": "module"`, `tsx watch server/src/index.ts`, Express 5 on **4545**. Vite on **4546** with `strictPort: true` and `/api` proxied to 4545 (SSE streams through Vite's proxy; never add `compression`).
- **Store root** comes from `AI_REVIEW_HOME` (default `~/.ai-review`); `npm run dev:fixtures` sets it to `./fixtures` and `AGENT_ADAPTER=fake`, so the whole UI (including "Send to agent") works without Claude Code.
- **Disk is the contract**: the server reads `manifest.json` and only the files it declares; the dashboard writes only under `review/`.

## 1. Directory tree

```
code-scout/
├─ package.json                 # dev, dev:fixtures, test, lint, typecheck, e2e (concurrently)
├─ playwright.config.ts         # webServer: server 4545 + web 4546, AI_REVIEW_HOME=fixtures
├─ .claude/launch.json          # "dashboard" entry for the Desktop browser pane (port 4546)
├─ shared/
│  ├─ constants.ts              # PORTS, LARGE_FILE_THRESHOLDS, STORE_LAYOUT
│  ├─ schemas/session.ts        # SessionManifest, FileEntry, EvidenceItem, SpecSource, ExtraContent
│  ├─ schemas/review.ts         # ReviewDraft, FileReview, comments, anchors, Submission
│  ├─ schemas/agent.ts          # AgentRun, AgentRunEvent
│  ├─ schemas/api.ts            # SessionSummary, SessionDetail, request/response envelopes
│  ├─ review/reducer.ts         # pure reducer + selectors (progress, next unreviewed) — used by web, tested in node
│  └─ review/feedback-markdown.ts # ReviewDraft + SessionDetail -> markdown for the agent
├─ server/
│  ├─ package.json  tsconfig.json  vitest.config.ts   # express@5, zod, chokidar@4, diff@9, tsx, supertest
│  └─ src/
│     ├─ index.ts               # listen(4545)
│     ├─ app.ts                 # createApp({ home, adapter, watch }) -> Express app (supertest-able)
│     ├─ config.ts              # env: AI_REVIEW_HOME, PORT, AGENT_ADAPTER, CLAUDE_BIN
│     ├─ sse.ts                 # headers, heartbeat, Last-Event-ID replay helper
│     ├─ store/paths.ts         # sessionDir(), safe join, allowlist checks
│     ├─ store/index.ts         # SessionIndex: scan + chokidar watch + cache + EventEmitter
│     ├─ store/manifest.ts      # read + zod-validate manifest, derive stats/reviewStatus
│     ├─ store/patch.ts         # split diff.patch per file, counts, status, isLarge, language
│     ├─ store/review.ts        # draft read/write (atomic), submissions, feedback files
│     ├─ routes/{sessions,files,media,content,review,runs,events}.ts
│     └─ agent/{adapter.ts,claude-code.ts,fake.ts,runs.ts,stream-json.ts}
├─ web/
│  ├─ package.json  vite.config.ts  index.html  tsconfig*.json  eslint.config.js  vitest.config.ts  components.json
│  ├─ tests/setup.ts            # jest-dom + vi.mock('@pierre/diffs/react') + Worker stub
│  └─ src/
│     ├─ main.tsx  App.tsx  index.css   # Tailwind v4 + @source lines for streamdown packages
│     ├─ lib/{api.ts,sse.ts,hotkeys.ts,format.ts}
│     ├─ state/{ReviewProvider.tsx,reviewContext.ts,useSession.ts,useAutosave.ts}
│     ├─ pages/{SessionListPage,SessionLayout,FilesPage,EvidencePage,SpecPage,ExtrasPage,SubmitPage,RunPage}.tsx
│     ├─ components/ui/*        # shadcn: button, card, tabs, textarea, dialog, badge, carousel, tooltip, kbd
│     ├─ components/layout/{SessionHeader,ModeToggle,SectionTabs,ShortcutHelp}.tsx
│     ├─ components/diff/{DiffWorkerProvider,FileDiffView,FileReviewCard,CardDeck,ScrollList,VerdictOverlay,CommentBox,LineCommentThread,LargeFileGate}.tsx
│     ├─ components/evidence/{EvidenceCarousel,EvidenceCard,ImageViewer,VideoPlayer,TimelineMarkers,EvidenceComments}.tsx
│     ├─ components/spec/{SpecPanel,JiraCard,MarkdownSpecCard,ArtifactCard}.tsx
│     ├─ components/extras/{ExtrasPanel,ExtraCard}.tsx
│     ├─ components/submit/{DecisionPicker,FeedbackSummary,PrDescription,AgentRunView}.tsx
│     └─ components/common/{Markdown,SandboxedHtml,ErrorBoundary,EmptyState}.tsx
└─ fixtures/
   ├─ README.md
   ├─ agent-run.sample.jsonl    # canned stream-json lines replayed by FakeAdapter
   ├─ scripts/make-patch.sh     # temp git repo: commit files/old, replace with files/new, git diff -M > diff.patch
   ├─ scripts/make-media.ts     # Playwright chromium: 2 PNG screenshots + 3 s WebM recording (no ffmpeg needed)
   └─ sessions/2026-09-25T10-22Z_QI-1234_demo/
      ├─ manifest.json  diff.patch  pr-description.md
      ├─ files/old/**  files/new/**          # full contents (drive make-patch.sh and context expansion)
      │   # src/components/TodoList.tsx (modified), src/hooks/useTodos.ts (added),
      │   # src/utils/legacyFormat.ts (deleted), src/components/Item.tsx -> TodoItem.tsx (renamed+edited),
      │   # src/data/countries.ts (~2000 added lines: the "large" file), README.md (small edit)
      ├─ media/login-page.png  dashboard.png  checkout-flow.webm
      ├─ spec/jira.md  plan.md  artifact.html
      └─ extras/architecture.md (mermaid block)  coverage.html
```

`fixtures/sessions/*/review/` is gitignored so dev runs never dirty the fixture.

## 2. Data model (`shared/schemas`, zod v4; TS shapes shown)

```ts
// session.ts — written by the agent/packager, read-only for the dashboard
FileEntry = { id: string /* new path, or old path when deleted */, path, oldPath?,
  status: 'added'|'modified'|'deleted'|'renamed'|'binary', additions: int, deletions: int,
  hunks: int, language?, isLarge: boolean, hasFullContents: boolean, note?: string }   // derived by server from diff.patch
EvidenceItem = { id, kind: 'image'|'video', file /* relative to media/ */, mime?, title,
  description?: string /* agent-written markdown */, capturedAt?, width?, height?, durationSec?, relatedFiles?: string[] }
SpecSource = | { kind:'jira', id, key, url?, file:'spec/jira.md'|'spec/jira.html', format:'markdown'|'html', fetchedAt? }
             | { kind:'markdown', id, title, file, sourcePath? /* absolute path on disk, shown, never uploaded */ }
             | { kind:'artifact', id, title, file, format:'html'|'markdown', url? }
ExtraContent = { id, title, kind:'markdown'|'html'|'mermaid', file, description? }
SessionManifest = { schemaVersion: 1, id, title, createdAt, revision: int = 1, parentSessionId?,
  agent: { kind:'claude-code', sessionId?: uuid, cwd, model? },
  repo: { root, branch?, baseRef?, headRef? }, ticket?: { key, url?, summary? },
  prDescriptionFile?: 'pr-description.md', fileNotes?: Record<path,string>,
  evidence: EvidenceItem[], spec: SpecSource[], extras: ExtraContent[] }

// review.ts — written by the dashboard under review/
LineAnchor = { path, side:'old'|'new', startLine: int, endLine: int, endSide?: 'old'|'new' }  // store-level; mapped to pierre's deletions|additions in FileDiffView only
Comment = { id: ulid, body, createdAt, updatedAt? }
FileComment = Comment & { fileId, anchor?: LineAnchor }              // no anchor => file-level
FileReview = { fileId, verdict:'approved'|'rejected'|'none', comments: FileComment[], viewed: boolean, updatedAt }
EvidenceComment = Comment & { evidenceId, timestampSec?: number }    // video comments carry a timestamp
Decision = 'undecided'|'approve'|'request-changes'|'reject'
ReviewDraft = { schemaVersion: 1, sessionId, reviewId: ulid, files: Record<fileId, FileReview>,
  evidence: Record<evidenceId, EvidenceComment[]>, overall: { body, decision: Decision },
  ui?: { mode:'swipe'|'scroll', currentFileId?, section? }, updatedAt }
Submission = { reviewId, sessionId, submittedAt, decision, counts: { files, approved, rejected, commentedOnly, lineComments, evidenceComments },
  feedbackJson: 'review/<reviewId>.json', feedbackMd: 'review/<reviewId>.md', runId? }

// agent.ts
AgentRun = { id: ulid, sessionId, reviewId, adapter:'claude-code'|'fake', status:'queued'|'running'|'succeeded'|'failed'|'cancelled',
  startedAt, endedAt?, exitCode?, agentSessionId?, costUsd?, numTurns?, resultText?, error? }
AgentRunEvent = { seq: int, at } & ( {type:'status', status} | {type:'init', model, sessionId} | {type:'assistant_text', text}
  | {type:'partial', text} | {type:'tool_use', id, name, input} | {type:'tool_result', toolUseId, text /* truncated 4 KB */, isError?}
  | {type:'result', isError, text, costUsd?, numTurns?, durationMs?} | {type:'stderr', line} | {type:'error', message} )
```

On disk: `review/draft.json` (autosaved), `review/<reviewId>.json` + `.md` (immutable submission snapshot), `review/latest.md` (copy, for the `/apply-review` skill), `review/submissions.json`, `review/runs/<runId>.json` + `<runId>.jsonl` (raw stream lines). `reviewStatus` (`unreviewed | in-progress | submitted | applying | applied`) is derived by the server from these files, never stored in the manifest.

## 3. Server API (all under `/api`, JSON unless noted; zod-validated on both sides)

| Method & path | Response / notes |
|---|---|
| `GET /health` | `{ ok, home, adapter, claudeBin? }` |
| `GET /sessions` | `SessionSummary[]`: id, title, createdAt, ticket, revision, stats `{files, additions, deletions}`, reviewStatus, progress `{reviewed,total}`; invalid manifests appear with `error` so you see why |
| `GET /sessions/:id` | `SessionDetail` = manifest + `files: FileEntry[]` + stats + `prDescription` (inlined) + `reviewStatus` + `activeRunId?` |
| `GET /sessions/:id/files/:fileId/patch` | `text/plain` per-file slice of `diff.patch` (what `PatchDiff` consumes); `413 {isLarge}` unless `?force=1` |
| `GET /sessions/:id/files/:fileId/contents?side=old\|new` | `text/plain` full contents from `files/`; 404 if absent (feeds `loadDiffFiles`) |
| `GET /sessions/:id/patch` | whole `diff.patch` (for a future MultiFile/CodeView mode) |
| `GET /sessions/:id/media/:file` | `res.sendFile(file, { root: mediaDir, acceptRanges: true })`; `send` answers `Range` with 206 natively; only files declared in `manifest.evidence` are served |
| `GET /sessions/:id/content/:kind/:file` | raw spec/extras file with proper `Content-Type` (`kind` = spec\|extras; allowlisted by manifest) |
| `GET /sessions/:id/review` | `ReviewDraft` (empty draft created on first read) |
| `PUT /sessions/:id/review` | body `{ draft, baseUpdatedAt }` → `{ updatedAt }`; `409` if the file changed since `baseUpdatedAt` (client reloads); atomic write (tmp + rename) |
| `POST /sessions/:id/review/submit` | body `{ decision, overall, dispatch: boolean }` → `{ submission, run? }`; writes snapshot JSON + markdown + `latest.md`; if `dispatch`, starts a run |
| `GET /sessions/:id/submissions` | `Submission[]` |
| `POST /sessions/:id/runs` | body `{ reviewId }` → `AgentRun` (`409` if a run is active for the session; `412 {reason}` if adapter `canResume` fails, e.g. session live in a terminal or no `agent.sessionId`) |
| `GET /runs/:runId` | `AgentRun` |
| `GET /runs/:runId/events` | **SSE**: replays persisted `.jsonl` from `Last-Event-ID`, then live; `event: run`, `id: seq`; heartbeat comment every 15 s |
| `POST /runs/:runId/cancel` | SIGINT (ends the turn cleanly), SIGTERM after 10 s |
| `GET /events` | **SSE** store watch: `session.added|updated|removed`, `review.updated` (external writes only), `run.updated` |

Agent adapter boundary (`server/src/agent/adapter.ts`):

```ts
interface AgentAdapter {
  kind: 'claude-code' | 'fake';
  canResume(session: SessionDetail): Promise<{ ok: true } | { ok: false; reason: string }>;
  start(req: { session; reviewId; feedbackMdPath; feedbackJsonPath; onEvent(e: AgentRunEvent): void })
    : Promise<{ cancel(): void; done: Promise<{ exitCode: number; result?: ... }> }>;
}
```

`ClaudeCodeAdapter` spawns `claude -p --resume <sid> "/apply-review <reviewId>" --output-format stream-json --verbose --include-partial-messages --permission-mode acceptEdits --allowedTools "Read,Edit,Write,Bash(npm test *),Bash(git diff *)"` with `cwd = manifest.agent.cwd` and the inherited env (uses the existing login; no `--bare`, so project hooks/MCP load as in a terminal). `stream-json.ts` parses NDJSON with `readline` and maps `system/init`, `assistant` blocks, `user` tool results, `stream_event` text deltas and `result` to `AgentRunEvent`. `canResume` checks `claude agents --json` for a live entry with that `sessionId` and that `claude` is on PATH. `FakeAdapter` replays `fixtures/agent-run.sample.jsonl` with 150 ms delays. `RunManager` keeps one active run per session, persists every event, and re-indexes the session when the run ends (the skill may rewrite `diff.patch` or publish a `revision: 2` session with `parentSessionId`).

## 4. Frontend

Routes (react-router 7): `/` session list (live via `/api/events`); `/s/:id` → `SessionLayout` (header + section tabs) → `files` (`?mode=swipe|scroll`, `/files/:fileId` deep link), `evidence/:evidenceId?`, `spec`, `extras`, `submit`, `runs/:runId`.

Component tree mapped to the sketches:

- **Header (sketch p.2)** `SessionHeader`: `+3,658 −245 · 33 files · reviewed 12/33` with a progress bar, `ModeToggle` (Scroll | Swipe), ticket chip linking out.
- **Files (p.2–4)** `FilesPage` → `CardDeck` (swipe) or `ScrollList` (scroll). Both render the same `FileReviewCard` = header (`path`, `+33 −4`, status badge) + `FileDiffView` (`PatchDiff`, unified by default, split toggle) + `VerdictOverlay` + `X`/`✓` buttons + `CommentBox` (button label switches to "Comment & Reject" when a reject is pending). `CardDeck` uses `motion.div` (`drag="x"`, `useTransform` for rotate/opacity/overlay colour, commit on `|offset.x| > 120 || |velocity.x| > 500`, `AnimatePresence` fly-off), renders current + two peeking cards, and starts drags from the card header via `dragControls` so dragging never fights the diff's horizontal scroll or text selection. `ScrollList` uses `@tanstack/react-virtual` with `measureElement` and mounts `FileDiffView` only near the viewport.
- **Evidence (p.5–6)** `EvidencePage` → `EvidenceCarousel` (shadcn Carousel/embla; arrow keys) → `EvidenceCard`: `ImageViewer` (`react-zoom-pan-pinch`) or `VideoPlayer` (native `<video slot="media">` inside `MediaController`/`MediaControlBar` from `media-chrome/react`) + agent `description` (Markdown) + `EvidenceComments` (video: "Comment at 0:42" pauses and captures `currentTime`; clicking a comment seeks; `timeupdate` highlights the active one) + `TimelineMarkers` (own marker strip above the control bar, `left: t/duration*100%`; more robust than overlaying `MediaTimeRange`).
- **Spec (p.7)** `SpecPanel` tabs per source: `JiraCard` (`QI-1234 ↗`; markdown via `Markdown`, html via `SandboxedHtml`), `MarkdownSpecCard` (shows `sourcePath`, "local only"), `ArtifactCard` (`SandboxedHtml` + "Open on claude.ai"). Content comes through `useSpecContent(source)`; a live Jira loader later only swaps this hook and adds `live: true` on the source.
- **Extras (p.1)** `ExtrasPanel` → `ExtraCard`: markdown/mermaid via `Markdown` (streamdown `mode="static"`, `plugins={{ code, mermaid }}`), html via `SandboxedHtml`.
- **Submit (p.8)** `SubmitPage`: ticket chip, overall feedback textarea, `DecisionPicker`, `FeedbackSummary` (per file: verdict, comments with `path:L12–15 (new)` anchors; per evidence with timestamps), `PrDescription` (agent-written, rendered), Submit → confirm dialog → `AgentRunView` (streamed transcript: text, collapsible tool calls, result/cost, Cancel, "session updated, reload" banner from `/api/events`).

State: `ReviewProvider` holds `SessionDetail` + `ReviewDraft` + `currentFileId` and exposes `dispatch` for the pure reducer in `shared/review/reducer.ts` (`SET_VERDICT`, `ADD_COMMENT`, `DELETE_COMMENT`, `SET_OVERALL`, `SET_MODE`, `GO_TO`, `ADVANCE`). Flow rules live in the reducer: approve → verdict + advance; comment → add + advance; reject → `pendingReject` until a non-empty comment is submitted, then verdict + advance; `ADVANCE` picks the next file with no verdict and no comments, wrapping, and points at Submit when none remain. `useAutosave` PUTs the whole draft 250 ms after every action, immediately on verdicts, and with `fetch(..., { keepalive: true })` on `pagehide`; a `409` reloads the draft. Swipe and scroll modes are two views over the same `currentFileId`, so switching modes scrolls to the current card and vice versa.

Keyboard (`useHotkeys`, ignored while typing except ⌘/Ctrl+Enter): `←/→` prev/next card, `A` approve, `X`/`R` reject (focus comment), `C` focus comment, `⌘+Enter` submit comment (or "Comment & Reject"), `Esc` cancel pending reject, `S` toggle mode, `1–5` sections, `Space`/`M` play-pause / comment at time (video), `?` help.

## 5. Milestones

**M1 — scaffold, fixture, session list, diff cards (demoable day 1–2).** Root/web/server package.json and configs; `shared/schemas/*`; `fixtures/` (files/old+new, `make-patch.sh`, manifest, spec/extras text; `make-media.ts` run once and outputs committed); `store/{index,manifest,patch}.ts`; routes `sessions`, `files`; `DiffWorkerProvider` (`import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'` → `WorkerPoolContextProvider poolOptions={{ workerFactory: () => new DiffsWorker(), poolSize: 2 }}` mounted once in `App`); `FileDiffView`, `FileReviewCard` (no verdict yet), `CardDeck` with ←/→ and drag; `SessionListPage`, `SessionLayout`, `SessionHeader`.
*Verify*: `npm run dev:fixtures`; list shows the demo session with `+N −M · 6 files`; cards show added/deleted/renamed files correctly highlighted; `curl -I` the patch route; supertest: file entries have expected statuses and counts; `vitest` passes with the pierre mock.

**M2 — verdicts, comments, autosave, progress.** `shared/review/reducer.ts` + tests; `routes/review.ts` (GET/PUT, 409); `ReviewProvider`, `useAutosave`; `VerdictOverlay`, `CommentBox` with reject flow; header progress; hotkeys; `ModeToggle` with a plain (non-virtualized) `ScrollList`.
*Verify*: approve → green fly-off and next card; X → comment box focused, "Comment & Reject", empty submit blocked; reload keeps every verdict (draft.json on disk); reducer tests cover the three rules and wrap-around.

**M3 — evidence, spec, extras.** `routes/{media,content}.ts` (Range 206); `Markdown` (streamdown + code + mermaid, `@source` lines, `optimizeDeps.include: ['mermaid']`); `SandboxedHtml` (srcdoc, `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"`, injected CSP `connect-src 'none'; form-action 'none'`, storage shim, height via `postMessage` checked against `iframe.contentWindow`); `EvidenceCarousel`, `ImageViewer`, `VideoPlayer`, `EvidenceComments` (timestamp capture, seek); `SpecPanel` cards; `ExtrasPanel`.
*Verify*: screenshots zoom/pan; webm plays and a comment stores `timestampSec`; supertest `Range: bytes=0-99` → 206 with `Content-Range`; `architecture.md` renders the mermaid diagram; `artifact.html` runs its script but `fetch()` inside it fails (CSP).

**M4 — submit, feedback files, agent adapter, streaming.** `shared/review/feedback-markdown.ts` (+ snapshot test); `store/review.ts` submissions; `agent/{adapter,claude-code,fake,runs,stream-json}.ts`; routes `runs`, `review/submit`; `sse.ts`; `SubmitPage`, `FeedbackSummary`, `AgentRunView`, `RunPage`.
*Verify*: with `AGENT_ADAPTER=fake`, Submit writes `review/<id>.json|.md|latest.md` and the run view streams the canned transcript, shows cost/result, and Cancel stops it; supertest reads the SSE body with `Last-Event-ID` replay; `stream-json.test.ts` maps real sample lines; with the real adapter, `POST /runs` returns 412 with a clear reason when `agent.sessionId` is missing.

**M5 — polish.** Line comments (`options.onLineSelected` → `selectedLines` → inline `CommentBox`; `lineAnnotations`/`renderAnnotation` → `LineCommentThread`; `renderGutterUtility` "+" button; anchors mapped old/new ↔ deletions/additions; memoised per-file annotation arrays); `TimelineMarkers`; virtualized `ScrollList`; `LargeFileGate` ("render anyway"); `/api/events` store watch (chokidar) → live list + "session updated" banner; `ShortcutHelp`; Playwright smoke (open fixture → approve card → reload → submit with fake adapter → transcript visible).
*Verify*: selecting lines 12–15 on the new side creates a comment that survives reload and appears in `latest.md` with the quoted lines; markers sit at the right proportion of the strip and seek on click; 33-file synthetic session scrolls smoothly; copying the fixture folder to a new id makes it appear in the list without refresh.

## 6. Risks and gotchas, with mitigations

1. **@pierre/diffs churn and StrictMode**: pin `1.5.1` exactly; one `WorkerPoolContextProvider` at the app root (1.5.1 already ref-counts the singleton via `useInsertionEffect`, but never mount it per card); `FileDiffView` is the only file importing `@pierre/diffs`, so API changes are localised; happy-dom has no Worker/Shadow DOM, so tests mock the module.
2. **Scroll jump (#1075, still open)**: it fires when the `lineAnnotations` identity changes. Keep per-file annotation arrays in `useMemo` keyed on that file's comments only, memoise `options`, and set `overflow-anchor: none` on the card/scroll containers (the workaround identified in the issue).
3. **Vite worker import**: use the `?worker` import, not `new URL()`; set `worker: { format: 'es' }` so the production build keeps the worker's Shiki imports.
4. **Styling inside Shadow DOM**: theme via `options.theme` `{light, dark}` + `themeType`, extra CSS only through `unsafeCSS`; annotations render in light DOM, so shadcn/Tailwind comment widgets work.
5. **Large files**: `isLarge` (> 1500 changed lines or > 200 KB slice) gates rendering behind a button; the fixture's `countries.ts` exercises it.
6. **shiki version split**: research says `@streamdown/code` wants shiki ^3.19, but the package's main branch already targets ^4.4.3. At install run `npm view @streamdown/code@1.1.1 peerDependencies` and pick one shiki satisfying it (`@pierre/diffs` accepts ^3 || ^4); check `npm ls shiki` shows a single copy, add an `overrides` entry if not.
7. **Mermaid**: stay on 11.17.2 (12 changes layout/theme and needs ES2024); `optimizeDeps.include: ['mermaid']` avoids the "504 Outdated Optimize Dep"; `errorComponent` shows the source on parse errors; React 19.3's `useId` is selector-safe.
8. **Sandboxed HTML**: never `allow-same-origin`; the srcdoc frame inherits the app's CSP, which is fine because the app sets none in v1 (if one is added later, move to a frame page on a second port + `postMessage`); `Origin: null` breaks root-relative asset paths, so artifacts using CDN allowlists work but local-path assets need copying into the session folder.
9. **Video**: Playwright/MediaRecorder-style WebM can report `duration = Infinity`; on `loadedmetadata` seek to a huge time and back, and fall back to `EvidenceItem.durationSec` for marker math. No ffmpeg on the machine, so fixtures are WebM only (Chrome fine); mp4 shows up only when the agent supplies it. media-chrome elements are web components: test marker math as a pure function.
10. **motion drag vs. diff scrolling**: start drags from the header via `dragControls`; buttons and keys remain the primary path; honour `prefers-reduced-motion`.
11. **Store watcher**: chokidar 4 dropped globs, so watch `<home>/sessions` with `depth: 2` and filter paths; `awaitWriteFinish` (agents write media progressively); ignore the server's own `review/` writes; a manifest that fails validation is listed with its error rather than hidden.
12. **SSE**: no compression middleware, heartbeats every 15 s, `id:` = event `seq` so `EventSource` reconnects replay from the persisted `.jsonl`.
13. **Express 5**: wildcard routes must be named (`/*splat`); `res.sendFile` with `root` blocks traversal; only manifest-declared files are ever served; async route errors propagate to the error handler.
14. **Claude CLI specifics (2.1.241)**: always pass `--permission-mode` with `-p`; `--include-partial-messages` needs `--verbose`; `--permission-prompts none` is unavailable until 2.1.259; `--resume` works from any directory; resuming a session still open in a terminal is undefined, hence the `claude agents --json` check and a 412 telling the user to run `/apply-review <id>` in that terminal; the flags `--mcp-config/--add-dir` are not restored on resume (pass them if the packager records them in the manifest).
15. **Ports**: 4545/4546 are free today; `strictPort` makes a collision fail loudly rather than silently shifting.

## Where a different answer to the decisions would have changed the design

- **D1** (no headless resume): `ClaudeCodeAdapter.start` becomes a "notify only" adapter and `AgentRunView` shows "feedback written to `review/latest.md`; run `/apply-review <id>`"; API and files unchanged.
- **D2** (per-repo `.ai-review/` instead of global): `AI_REVIEW_HOME` becomes a list of roots; `SessionIndex` watches each and prefixes ids; everything else is path-relative already.
- **D3** (file-level comments only): drop `LineAnchor` usage and the M5 line-comment item; the schema keeps `anchor` optional so nothing else moves.
- **D4** (live Jira in v1): add `server/src/routes/jira.ts` reusing `qbdash/backend/src/drivers/jira.ts` (email + API token, `expand=renderedFields`, attachment proxy) and a `live: true` flag on the `jira` spec source; `JiraCard` is unchanged.

## Critical files

- `shared/schemas/review.ts` (review draft, anchors, submission — the on-disk contract both sides share)
- `shared/review/reducer.ts` (approve/reject/comment/advance rules shared by swipe and scroll modes)
- `server/src/store/index.ts` (session index, patch slicing, watcher; everything the API serves comes from here)
- `server/src/agent/claude-code.ts` (the adapter that spawns `claude -p --resume` and maps stream-json to run events)
- `web/src/components/diff/FileDiffView.tsx` (the only file touching `@pierre/diffs`: worker, annotations, selection, anchor mapping)

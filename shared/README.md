# Contract v2 — live working tree

Authoritative; supersedes Contract v1, research/05 §2 and research/06 §1/§4 where they differ. Decision D8 (research/07): the dashboard reads everything live. The server computes code diffs from the repo working tree on demand; evidence, spec, extras and the PR description are plain files the agent writes into the session folder, which the server watches. There are no revisions, snapshot refs, inbox or publish step. Reviews happen on the machine that has the repo.

All timestamps are ISO-8601 strings. Schemas live in `shared/src/schemas/*.ts` as zod v4 objects with inferred TS types; each exports the schema (`ManifestSchema`) and the type (`Manifest`). `shared/src/index.ts` re-exports everything **except `shared/src/git/**`, which is Node-only** (spawns git, reads the filesystem). The server and the CLI import it as `@review-dash/shared/git/<file>`; the web must never import it.

## Store

`AI_REVIEW_HOME` (default `~/.ai-review`) → `sessions/<id>/`:

```
manifest.json                 written by `ai-review init` only (atomically: tmp + rename); nothing else edits it
evidence/                     images and videos the agent drops here; optional evidence/index.json
extras/                       .md | .html | .mmd | .mermaid; optional extras/index.json
spec/                         jira.md, plan.md, design.html …; optional spec/index.json
pr-description.md             optional, session root
review/review.json            dashboard-owned live review state
review/resolutions.json       agent-owned (written by `ai-review resolve`)
review/sent/<stem>.json       immutable snapshot of each Submit; <stem> = sentAt with ':' → '-'
review/sent/<stem>.md         the rendered feedback the agent reads
review/sent/<stem>.patch      the full working-tree diff at send time
review/runs/<runId>.json      AgentRun;  review/runs/<runId>.jsonl  raw stream-json lines
```

### Archive

`AI_REVIEW_HOME/archive/<id>/` holds archived sessions: the same folder, moved as a whole from `sessions/<id>/` (one `fs.rename`; copy + remove only across volumes), plus `archived.json` = `{ archivedAt }` written by whoever archived it (`POST /sessions/:id/archive` or `ai-review archive <id>`). The id never changes. Archived sessions are never listed as live, their repos are not watched and no tree is computed for them; `ai-review init` never reuses one. Unarchiving moves the folder back and removes `archived.json`. An archived session can be deleted permanently (`DELETE /sessions/archived/:id` or `ai-review delete <id> --yes`): that removes `archive/<id>` recursively (review state, comments, sent snapshots and run logs) and nothing else: never the repository, `refs/ai-review/*` or `<home>/cache`, and a symlinked entry only loses the link. Live sessions cannot be deleted (404; archive first). Because the session watcher only watches `sessions/`, archiving produces `session.removed` and unarchiving `session.added`; there are no archive-specific events, and deleting emits nothing (the web refetches the archived list itself).

Session id: `<yyyymmdd>-<hhmm>-<slug>-<4hex>` matching `SESSION_ID_RE`. Run id: `run-<yyyymmddhhmmss>-<4hex>`. Comment ids `c<n>`, n ≥ 1, never reused. Artifacts have no ids: they are referred to by their path relative to their folder (`evidence/flow.webm` → `flow.webm`).

## constants.ts

```ts
SCHEMA_VERSION = 2
DEFAULT_SERVER_PORT = 4545; DEFAULT_WEB_PORT = 4546
SESSION_ID_RE, RUN_ID_RE, COMMENT_ID_RE, FINGERPRINT_RE (/^[0-9a-f]{16}$/)
COLLAPSE_CHANGED_LINES = 1500; COLLAPSE_MAX_BYTES = 512 KiB; OMIT_MAX_BYTES = 5 MiB
COLLAPSE_GLOBS = ['**/package-lock.json','**/yarn.lock','**/pnpm-lock.yaml','**/*.snap','**/*.min.*','**/dist/**']
SECTIONS = ['files','evidence','spec','extras','submit'] as const
SESSIONS_DIR = 'sessions'; ARCHIVE_DIR = 'archive'; ARCHIVED_FILE = 'archived.json'
SESSION_EVIDENCE_DIR = 'evidence'; SESSION_EXTRAS_DIR = 'extras'; SESSION_SPEC_DIR = 'spec'
SESSION_PR_DESCRIPTION_FILE = 'pr-description.md'; ARTIFACT_INDEX_FILE = 'index.json'
```

## schemas/manifest.ts

```ts
Manifest = {
  schemaVersion: 2, id, title, createdAt, updatedAt,
  agent: { type: 'claude-code', sessionId: string|null, cliVersion: string|null, entrypoint: string|null },
  repo: { path: string /* top level, posix */, remote: string|null, branch: string|null, baseRef: string },
  tickets: { key: string, url: string|null }[]
}
```

`baseRef` is a ref name chosen once at `ai-review init` and stored here. The diff is always "all files changed against master": `defaultBase(repo)` (`git/repo.ts`) resolves `origin/master`, then `master`, then `origin/main`, then `main`, then the ref `origin/HEAD` points to (else `HEAD`). The remote ref is preferred because a stale local master is a trap (a checkout 121 commits behind origin/master produced a 1,688-file diff instead of the true 392). `ai-review init --base <ref>` overrides the choice. The working tree is compared against the merge base of `baseRef` and HEAD (`git/base.ts resolveBase`), computed live each time, never against the base tip, so commits that landed on master after the branch point do not show up as reversed changes. When the two have several merge bases (criss-cross merges: both branches merged master separately and HEAD also contains an older tip of the base branch) no single one is right, so they are folded into a virtual merge base the way git's own merge strategy does (`git merge-tree --write-tree`, intermediate trees wrapped in synthetic commits for three or more); the diff against that tree is the branch's own work. Where the merge bases conflict, the hunks are joined with git's `union` merge driver (a throwaway attributes file in the overlay), so the virtual tree never carries conflict markers; a conflicting binary path keeps the first base's blob. The folded objects are written to an overlay object directory (`<AI_REVIEW_HOME>/cache/objects/<sha1 of the repo path>`, read through `GIT_OBJECT_DIRECTORY` + `GIT_ALTERNATE_OBJECT_DIRECTORIES`), never into the user's repo, and the result is memoized per process by repo and merge bases. If the fold fails, the first merge base is used.

## schemas/tree.ts (computed, never stored)

```ts
TreeFile = { path, oldPath: string|null, status: 'added'|'modified'|'deleted'|'renamed'|'copied'|'typechange',
  additions, deletions, binary, sizeBefore: number|null, sizeAfter: number|null,
  collapsed, collapseReason: string|null, omitted, omitReason: string|null, untracked, fingerprint /* 16 hex */ }
WorkingTree = { computedAt, baseRef, baseSha, baseVirtual, headSha, branch: string|null, dirty, durationMs, fingerprint /* 16 hex */,
  stats: { files, additions, deletions, added, modified, deleted, renamed, binary, collapsed, omitted }, files: TreeFile[] /* sorted by path */ }
```

- `fingerprint` (file): sha1 of the per-file patch text, truncated to 16 hex; for binary or omitted files sha1 over status, sizes, the before blob id and the after blob id (`git hash-object` of the file on disk). Identical across recomputes when nothing changed; it is what a verdict is pinned to.
- `baseSha`: the merge base of `baseRef` and HEAD at compute time; with several merge bases it is the id of the virtual merge-base tree (see manifest `baseRef` above) and `baseVirtual` is true. Either way `git show <baseSha>:<path>` is the before side (the server reads a virtual tree through the overlay object directory).
- `fingerprint` (tree): sha1 over baseSha, headSha and every file's path + fingerprint. Carried by `tree.updated`.
- Collapse/omit rules (`git/rules.ts decideFile`): omitted when a text file's blob exceeds `OMIT_MAX_BYTES` on either side (reason `too-large`; left out of the patch, counts zeroed); collapsed when omitted (`omitted`), more than `COLLAPSE_CHANGED_LINES` changed lines (`too-many-changed-lines`), after-size above `COLLAPSE_MAX_BYTES` (`too-large`), or a `COLLAPSE_GLOBS` match (`generated-or-vendored`). Binaries are never omitted.
- `untracked` files are included when `git ls-files --others --exclude-standard` lists them (so `.gitignore` is honoured); one larger than `OMIT_MAX_BYTES` is listed as omitted.

## schemas/commits.ts (computed, never stored)

```ts
Scope = 'uncommitted' | <40-64 hex commit sha>
Commit = { sha, shortSha, subject, author, authoredAt, parents: sha[], merge: boolean /* parents > 1 */, pushed: boolean,
  stats: { files, additions, deletions } }
Remote = { ref: string|null /* upstream, else origin/<branch> if it exists, else null */, ahead, behind }
CommitList = { baseRef, baseSha, headSha, branch: string|null, remote: Remote, commits: Commit[] /* oldest first, baseRef..HEAD */,
  uncommitted: { files, additions, deletions } | null /* null when clean */, fingerprint /* 16 hex */ }
```

- `commits` is `git log --reverse <baseRef>..HEAD`: the commits HEAD has and the base ref lacks. Commits merged in from master are on the base side too and drop out; merge commits HEAD made itself stay (`merge: true`). The range is the ref, not `baseSha`, so it is the same whether or not the base is virtual; `baseSha` carries the tree's value (a tree id when `WorkingTree.baseVirtual`).
- A commit is `pushed` when it is reachable from `remote.ref`; with no remote ref nothing is pushed. `remote.ahead` is `git rev-list <ref>..HEAD`, `behind` the reverse.
- A merge commit's own changes are its diff against its first parent.
- `CommitList.fingerprint` changes when HEAD, the remote ref, a `pushed` flag or the uncommitted stats change. The server emits `tree.updated` when either the tree fingerprint or this one changed (the event still carries the tree fingerprint), so a push or fetch refreshes the timeline.
- Scopes: the session's own diff (base → working tree) is the full diff and keeps its routes. A scope narrows the view to `uncommitted` (HEAD → working tree) or to one commit (its first parent → the commit). `GET /sessions/:id/scopes/:scope` returns a `WorkingTree` for the scope: for a commit `baseRef` is `<sha>^1`, `baseSha` the parent, `headSha` the commit, `branch` null, `dirty` false; for `uncommitted` `baseRef` is `HEAD`, `baseSha` and `headSha` are HEAD, `dirty` true. File fingerprints are those of the scope's own patches. A verdict never uses them: a verdict is always pinned to the full-diff `TreeFile.fingerprint` of the same path.

## schemas/artifacts.ts and artifacts/*

Optional `index.json` files the agent may write (all fields optional except `file`):

```ts
EvidenceIndex = { items: { file, caption?, description?, order? }[] }
ExtrasIndex   = { items: { file, title?, order? }[] }
SpecIndex     = { items: { file, type?: 'jira'|'markdown'|'artifact', title?, url?, sourcePath?, capturedAt?, order? }[] }
```

Derived items (the server lists the folder, parses the index if present, and calls the pure helpers in `shared/src/artifacts/`):

```ts
EvidenceItem = { path, type: 'image'|'video', caption, description: string|null, order }
ExtraItem    = { path, type: 'markdown'|'html'|'mermaid', title }
SpecItem     = { path, type: 'jira'|'markdown'|'artifact', title, url: string|null, sourcePath: string|null, capturedAt: string|null }

deriveEvidence(files, index|null): EvidenceItem[]
deriveExtras(files, index|null, readText: (file) => string|null): ExtraItem[]
deriveSpec(files, index|null, readText): SpecItem[]
mergeIndex(files, items|null)      // indexed first by `order` then index position (missing files dropped), then the rest sorted by filename
evidenceTypeFromPath / extraTypeFromPath / specTypeFromPath / mimeFromPath
deriveTitle(path, explicit, content) // index title, else first `# ` heading / <title>, else filename
```

`files` are posix paths relative to the folder (nested folders allowed); `index.json` and files of unknown type are ignored. Spec type default: `.html` → `artifact`, filename starting with `jira` → `jira`, else `markdown`. `readText` is only called when the index gives no title.

## schemas/review.ts (dashboard-owned `review/review.json`)

```ts
Verdict = 'none'|'approved'|'rejected';  Decision = 'undecided'|'approve'|'request-changes'|'reject'
Mode = 'swipe'|'scroll';  Section = 'files'|'evidence'|'spec'|'extras'|'submit'
CommentTarget = { kind: 'overall'|'file'|'evidence'|'extra'|'spec', ref: string|null }   // ref: repo path / artifact path; null iff overall
Comment = { id /* c<n> */, target, body, timestampSec: number|null, createdAt, updatedAt: string|null, sentAt: string|null, resolvedAt: string|null, reopenedAt: string|null }
FileReview = { verdict, fingerprint: string|null /* TreeFile.fingerprint when judged */, viewed }
Review = { schemaVersion: 2, sessionId, files: Record<path, FileReview>, comments: Comment[], nextCommentId,
  overall: { decision }, sent: { at, decision } | null, ui: { mode: 'swipe'|'scroll'|'grid', currentFile: string|null, section }, updatedAt }
emptyReview(sessionId, now?)
```

## schemas/resolutions.ts (agent-owned) — unchanged apart from `schemaVersion: 2`

```ts
Resolution = { status: 'resolved'|'open', note, at, files: string[] }
Resolutions = { schemaVersion: 2, sessionId, updatedAt, comments: Record<c<n>, Resolution> }
```

## Derived (review/status.ts)

```ts
commentStatus(comment, resolution|null): 'open'|'resolved'       // latest event wins; reopen wins a tie
mergeComments(review, resolutions|null): CommentWithStatus[]
fileIsUpdated(entry, file: TreeFile)      // verdict ≠ none && entry.fingerprint !== null && entry.fingerprint !== file.fingerprint
effectiveVerdict(entry, file): Verdict    // the stored verdict, or none when the file is updated
progress(review|null, tree)               // reviewed = files whose effective verdict ≠ none; total = tree.files.length
anyFileUpdated(review, tree)
allFilesApproved(review, tree)            // every tree file's effective verdict is approved
sessionStatus({ review, tree, resolutions, activeRun })
  // agent-working if activeRun; updated if any file is updated (sent or not) or, after a send,
  // resolutions.updatedAt > sent.at; approved if sent.decision === 'approve' and allFilesApproved; sent if sent;
  // in-progress if any effective verdict or any comment; else unreviewed
```

## review/reducer.ts

`reviewReducer(state, action, ctx: { files: TreeFile[] })`. `SET_VERDICT` carries `fingerprint: string|null` (falls back to the tree's); a reject is stored when its comment lands, pinned to the tree fingerprint at that moment. `ADVANCE`/approve/comment move to the next file whose effective verdict is `none` and that has no file comment (wrapping once), so a file updated since its verdict comes back into the deck. Other actions unchanged.

## review/sent.ts (`review/sent/<stem>.json`)

```ts
SentSnapshot = { schemaVersion: 2, sessionId, sentAt, decision, tree: { baseSha, headSha, branch }, patchPath /* review/sent/<stem>.patch */,
  files: { path, verdict, fingerprint, status, additions, deletions }[],   // effective verdict ≠ none
  comments: Comment[] /* open at send time, sentAt stamped */, counts: { files, approved, rejected, commented, unreviewed, openComments } }
buildSentSnapshot({ review, tree, decision, resolutions, now }); stampSent(review, sent, now); sentFileStem(sentAt); sentPatchPath(sentAt)
```

The server writes the `.json`, the `.md` (`renderSentMarkdown(sent, { title, dashboardUrl, evidence?, extras?, spec? })`) and the `.patch` (every per-file patch of the tree concatenated) in one go.

`renderSentMarkdown` layout: title line; `Sent · Decision · Dashboard` line; `Tree: <branch> @ <head12> (base <base12>) · Diff: \`<patchPath>\``; `## Overall`; `## Files (…)` with `### path — REJECTED|commented|approved`; `## Evidence`, `## Spec`, `## Extras` with `### <path> — <caption|title>` (path alone when unknown); `## Required response` telling the agent to change the working tree (nothing to publish), run `ai-review resolve <id> --comment c<n> …` per comment, and where the `.patch` is. Empty sections omitted.

## schemas/agent.ts — unchanged (AgentRun, AgentRunEvent)

## schemas/api.ts

```ts
Health = { ok: true, home, adapter, claudeBin }
SessionSummary = { id, title, repo: { path, branch, baseRef }, tickets, status, progress: { reviewed, total }, openComments,
  stats: { files, additions, deletions }, updatedAt, activeRunId: string|null }
SessionListItem = SessionSummary | { id, error }
ArchivedMarker = { archivedAt }                                  // archive/<id>/archived.json
ArchivedSession = { id, title, tickets, repo: { path, branch, baseRef: string|null }, createdAt, updatedAt, archivedAt }  // baseRef from the archived manifest
SessionDetail = { manifest, tree: WorkingTree, evidence: EvidenceItem[], extras: ExtraItem[], spec: SpecItem[], prDescription: string|null, status, progress, activeRunId }
ReviewResponse, PutReviewRequest/Response/Conflict, SendRequest = { decision, dispatch }, SendResponse = { sent, run, pending }, StartRunRequest — as before
StoreEvent =
  | { type: 'session.added'|'session.updated'|'session.removed'|'review.updated'|'resolutions.updated', sessionId }
  | { type: 'run.updated', sessionId, runId }
  | { type: 'tree.updated', sessionId, fingerprint /* WorkingTree.fingerprint */, durationMs }
FileContentsSide = 'before'|'after'
ApiError = { error, reason?, isLarge? }
```

## Routes (all under /api)

```
GET  /health
GET  /sessions                                    SessionListItem[] newest first (summary uses the cached tree; computes it if absent)
GET  /sessions/archived                           ArchivedSession[] newest archivedAt first (registered before /sessions/:id)
GET  /sessions/:id                                SessionDetail (tree from the cache, recomputed when stale); 404 unknown or malformed id,
                                                  422 { error: 'repo-missing: <path>' } when the repository is gone, 422 for an invalid manifest or a git failure
POST /sessions/:id/archive                        → { id }; moves sessions/<id> to archive/<id> (emits session.removed via the watcher);
                                                  404 unknown, 409 { error: 'run-active' } while a run is queued or running
POST /sessions/:id/unarchive                      → { id }; moves it back (emits session.added); 404 not archived, 409 { error: 'exists' }
DELETE /sessions/archived/:id                     → { id }; removes archive/<id> for good (registered before /sessions/:id; no event);
                                                  404 not archived (a live id is left untouched) or malformed id, 409 { error: 'run-active' } if a run record still says running
GET  /sessions/:id/files/*path/patch              text/plain per-file patch; 413 { error, isLarge: true } for a collapsed file unless ?force=1; 404 unknown/omitted
GET  /sessions/:id/files/*path/contents?side=before|after
                                                  text/plain: before = `git show <baseSha>:<oldPath ?? path>`, after = the file on disk; 404 when that side does not exist
GET  /sessions/:id/patch                          the whole working-tree patch
GET  /sessions/:id/commits                        CommitList (404 unknown session, 422 repo-missing)
GET  /sessions/:id/scopes/:scope                  WorkingTree of a scope ('uncommitted' or a commit sha in baseSha..HEAD; 404 otherwise)
GET  /sessions/:id/scopes/:scope/files/*path/patch      text/plain, same rules as the full-diff patch route (413 for collapsed unless ?force=1)
GET  /sessions/:id/scopes/:scope/files/*path/contents?side=before|after   before = the parent's (or HEAD's) blob, after = the commit's blob (disk for 'uncommitted')
GET  /sessions/:id/evidence/*path                 only paths listed by deriveEvidence; sendFile with root + Range (206)
GET  /sessions/:id/extras/*path                   only paths listed by deriveExtras; correct Content-Type
GET  /sessions/:id/spec/*path                     only paths listed by deriveSpec; correct Content-Type
GET  /sessions/:id/review                         ReviewResponse (empty review in memory when missing)
PUT  /sessions/:id/review                         PutReviewRequest → { updatedAt } | 409 { error, current }
POST /sessions/:id/review/send                    SendRequest → SendResponse; writes sent/<stem>.json|.md|.patch
GET  /sessions/:id/runs · POST /sessions/:id/runs · GET /runs/:runId · GET /runs/:runId/events (SSE) · POST /runs/:runId/cancel
GET  /events                                      SSE of StoreEvent
```

Express 5 path syntax. Web routes: `/`, `/s/:id/files`, `/s/:id/files/*path`, `/s/:id/evidence/*path?`, `/s/:id/spec`, `/s/:id/extras`, `/s/:id/submit`.

## shared/src/git (Node-only)

```
run.ts          git(repo, args, { env?, input?, okExitCodes?, signal? }): Promise<Buffer>; gitText; gitTry; GitError
repo.ts         topLevel, headSha, currentBranch, remoteUrl, refExists, defaultBase, mergeBase, isDirty, untrackedFiles, showFile, blobInfo, hashFiles
parse.ts        parseNumstatZ, parseNameStatusZ
rules.ts        decideFile, matchesCollapseGlob, globToRegExp, OMIT_REASON_TOO_LARGE, COLLAPSE_REASON_*
split-patch.ts  splitPatch(patchText): Map<path, string>, patchFileKey, parseHeaderLine, readCString, unquotePath
fingerprint.ts  patchFingerprint, metadataFingerprint, treeFingerprint
base.ts         resolveBase({ repo, baseRef, overlayDir?, signal? }): Promise<{ sha, virtual, env: ProcessEnv|null, reason: string|null }> (merge base, or the virtual one for several; `env` must go to every git call that reads a virtual `sha`), overlayDirFor(root, repo)
working-tree.ts computeWorkingTree({ repo, baseRef, overlayDir?, signal?, now? }): Promise<{ tree: WorkingTree, patches: Map<path, string> }>
commits.ts      computeCommitList({ repo, baseRef, overlayDir?, signal? }): Promise<CommitList> (one `git log --numstat` pass, upstream/origin remote ref, pushed flags, uncommitted stats), parseCommitLog
scope-tree.ts   computeScopeTree({ repo, scope, signal? }): Promise<{ tree: WorkingTree, patches }> for 'uncommitted' or a commit sha (sizes and blobs from git, nothing from disk for a commit)
```

`computeWorkingTree` runs `git diff <mergeBase>` (`-M50%`, `--full-index`, fixed `a/`/`b/` prefixes so user config cannot change the output), adds a `--no-index` patch per untracked file, parses numstat and name-status, reads sizes (disk after, `cat-file --batch-check` before), applies the rules, splits the patch per file, fingerprints, and reports `durationMs`. Omitted files are excluded from the diff by pathspec. It is built for a 400-file, 1.2 MB patch: one `git diff`, one numstat, one name-status, one `cat-file --batch-check` (before sizes and blob ids), one `hash-object --stdin-paths` (after blob ids of binary/omitted files); `splitPatch` and fingerprinting are linear in the patch size. The only per-file git call is the `--no-index` patch of each untracked file.

## Migration notes

### server
- Delete: everything revision-related in `store/` (manifest revisions, `rev/:n` params, `files/{before,after}` snapshot reads, `delta.patch`, inbox handling), `store/patch.ts` and its test (moved to `@review-dash/shared/git/split-patch`), `store/mime.ts` if it only mapped evidence/extras types (use `mimeFromPath`).
- Add a tree cache: per session, `computeWorkingTree({ repo: manifest.repo.path, baseRef: manifest.repo.baseRef })` → `{ tree, patches }`; invalidate from a repo watcher (chokidar on `repo.path`, ignoring `.git/` except `HEAD`/`index`/`refs`, honouring `.gitignore` as far as practical, 300 ms debounce); after each recompute emit `tree.updated { sessionId, fingerprint, durationMs }` and log the timing. See research/07 for the performance plan.
- Watch the session folder too: `evidence/`, `extras/`, `spec/`, `pr-description.md` changes → `session.updated`.
- `GET /sessions/:id` builds `SessionDetail` from the manifest, the cached tree, `deriveEvidence/deriveExtras/deriveSpec` over directory listings (recursive, posix-relative paths; parse `index.json` with the `*IndexSchema`, ignore it when invalid and log), and `pr-description.md`.
- `files/*path/patch` serves `patches.get(path)`; `contents?side=` uses `showFile(repo, tree.baseSha, oldPath ?? path)` / `fs.readFile(join(repo, path))`; `GET /sessions/:id/patch` concatenates the per-file patches in `tree.files` order.
- Send: `buildSentSnapshot({ review, tree, decision, resolutions, now })`, then write `<stem>.json`, `<stem>.md` (`renderSentMarkdown(sent, { title: manifest.title, dashboardUrl, evidence, extras, spec })`) and `<stem>.patch` (`sent.patchPath`).
- `sessionStatus` now takes `{ review, tree, resolutions, activeRun }`; `progress(review, tree)`.
- `SessionSummary` lost `createdAt`/`currentRevision`; `updatedAt` = max(manifest.updatedAt, review.updatedAt, resolutions.updatedAt, tree.computedAt).
- Fixtures: `@review-dash/shared/testing/fixtures` exports are now `makeManifest`, `makeTree`, `makeTreeFile`, `makeEvidence`, `makeExtra`, `makeSpec`, `makeComment`, `makeReview`, `makeResolution`, `makeResolutions`, `fp`, `BASE_SHA`, `HEAD_SHA` (plus `SESSION_ID`, `T0..T3`). `manifest()`, `revision()`, `fileEntry()`, `comment()`, `review()`, `resolution()`, `resolutions()` are gone.

### web
- Replace `Revision`/`FileEntry` with `WorkingTree`/`TreeFile` from `SessionDetail.tree`; evidence/extras/spec come from `SessionDetail.evidence|extras|spec` (no ids: key lists and comment refs by `item.path`).
- Routes: `/api/sessions/:id/files/<path>/patch` and `.../contents?side=` (no `rev/:n`); media at `/api/sessions/:id/evidence/<path>`, extras at `/extras/<path>`, spec at `/spec/<path>`.
- Reducer context is `{ files: tree.files }`; `SET_VERDICT` carries `fingerprint: file.fingerprint`. `CommentTarget` is `{ kind, ref }` with `ref: null` for overall; comments on spec items are allowed (`kind: 'spec'`).
- Listen for `tree.updated` on `/api/events`: refetch the detail (or skip when `fingerprint` matches the loaded tree); the "updated" chip is `fileIsUpdated(review.files[path], file)`.
- Status/progress helpers take the tree; "updated" also means the agent answered after the send.
- `SessionSummary` has no `createdAt`/`currentRevision`; sort by `updatedAt`.
- Never import `@review-dash/shared/git/*`.

### cli
- Delete `publish.ts`, the snapshot-ref code, `last-publish.ts`, the inbox/publish commands and the `/publish-review` skill text that says to republish. Replace with `ai-review init --repo <path> [--base <ref>] --title … [--ticket KEY[=url]]` that writes the manifest (`repo.path = topLevel`, `baseRef = --base ?? defaultBase(repo)` — i.e. `origin/master` → `master` → `origin/main` → `main` → `origin/HEAD` target; the stored name is what the server passes to `computeWorkingTree`, which diffs against its merge-base with HEAD, `remote`, `branch`) and prints the session folder, plus `ai-review path <id> [evidence|extras|spec]` so the agent knows where to drop files. Evidence/extras/spec are written straight into the session folder (optionally with `index.json`).
- `git.ts`, `rules.ts` and their tests move to `@review-dash/shared/git/{run,repo,parse,rules}`; delete the CLI copies. `ai-review feedback` renders with `renderSentMarkdown(sent, { title, dashboardUrl, evidence?, extras?, spec? })` or just prints `review/sent/<stem>.md`.
- `ai-review resolve` is unchanged apart from `schemaVersion: 2` in `resolutions.json`.
- Fixtures (`scripts/make-fixture.ts`, `fixtures/`): a fixture session is now a manifest pointing at a real (temp) git repo plus `evidence/`, `extras/`, `spec/`, `pr-description.md`; there is no `revisions/` folder.

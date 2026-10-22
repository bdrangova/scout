# Contract v2 — live working tree

Authoritative; supersedes Contract v1, research/05 §2 and research/06 §1/§4 where they differ. Decision D8 (research/07): the dashboard reads everything live. The server computes code diffs from the repo working tree on demand; evidence, spec, extras and the PR description are plain files the agent writes into the session folder, which the server watches. There are no revisions, snapshot refs, inbox or publish step. Reviews happen on the machine that has the repo.

All timestamps are ISO-8601 strings. Schemas live in `shared/src/schemas/*.ts` as zod v4 objects with inferred TS types; each exports the schema (`ManifestSchema`) and the type (`Manifest`). `shared/src/index.ts` re-exports everything **except `shared/src/git/**`, which is Node-only** (spawns git, reads the filesystem). The server and the CLI import it as `@review-dash/shared/git/<file>`; the web must never import it.

## Store

`AI_REVIEW_HOME` (default `~/.ai-review`) → `sessions/<id>/`:

```
manifest.json                 written by `ai-review init` only (atomically: tmp + rename); nothing else edits it
                              init reuses the latest live session of (repo, branch), approved or not, unless `--new`;
                              after an approval it resets `overall.decision` to undecided and keeps verdicts/comments
evidence/                     images and videos the agent drops here; optional evidence/index.json
extras/                       .md | .html | .mmd | .mermaid; optional extras/index.json
spec/                         jira.md, plan.md, design.html …; optional spec/index.json
pr-description.md             optional, session root
review/review.json            dashboard-owned live review state
review/resolutions.json       agent-owned (written by `ai-review resolve`)
review/pr-comments.json       written by `ai-review pr-sync` / `pr-link` only: the session's PR + its GitHub comments
review/pr-resolutions.json    agent-owned (written by `ai-review pr-resolve`)
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
SECTIONS = ['spec','extras','evidence','files','submit'] as const
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
LineAnchor = { side: 'old'|'new', line: number /* ≥ 1 */, endLine?: number /* ≥ line, a short range */ }
CommentTarget = { kind: 'overall'|'file'|'evidence'|'extra'|'spec', ref: string|null, anchor?: LineAnchor }   // ref: repo path / artifact path; null iff overall; anchor only on `file`
Comment = { id /* c<n> */, target, body, timestampSec: number|null, createdAt, updatedAt: string|null, sentAt: string|null, resolvedAt: string|null, reopenedAt: string|null }
FileReview = { verdict, fingerprint: string|null /* TreeFile.fingerprint when judged */, viewed }
Review = { schemaVersion: 2, sessionId, files: Record<path, FileReview>, comments: Comment[], nextCommentId,
  overall: { decision }, sent: { at, decision } | null, ui: { mode: 'swipe'|'scroll'|'grid', currentFile: string|null, section }, updatedAt }
emptyReview(sessionId, now?)
```

A `file` comment with an `anchor` is a line comment (GitHub-style, on one side of the diff; `old` numbers the before side). Everywhere a file comment counts (`commentedPaths`, `progress`, the grid's Commented state, `nextUnreviewedFile`, the sent snapshot's `commented` count) a line comment counts the same: it targets `file.path`. Ids and resolutions are unchanged. Helpers in `review/line-anchor.ts` (`anchorKey`, `formatLineAnchor` → `12` / `10-14` / `12 (old)`, `anchorLabel` → `line 12`) and `review/patch-lines.ts` (`parsePatchLines(filePatch)` → numbered content lines, `filePatchFor(patch, path)`, `anchorInPatch`, `anchorExcerpt`).

## schemas/resolutions.ts (agent-owned) — unchanged apart from `schemaVersion: 2`

```ts
Resolution = { status: 'resolved'|'open', note, at, files: string[] }
Resolutions = { schemaVersion: 2, sessionId, updatedAt, comments: Record<c<n>, Resolution> }
```

## schemas/pr-comments.ts: GitHub PR comments (external, read-only for the dashboard)

```ts
PrIdentity = { repo: 'owner/name', number, url, title, state: 'open'|'closed'|'merged', draft, baseRef, headRef, headSha /* '' until synced */ }
PrComment = { id /* rc<n> line | rv<n> review summary | ic<n> conversation; n = GitHub database id */, githubId, nodeId|null, url /* permalink */,
  prNumber, kind: 'line'|'review-summary'|'general', author: { login, isBot, kind: 'human'|'bot'|'copilot' }, body /* markdown */,
  authorAssociation?: string|null /* GitHub author_association */, reviewState: 'approved'|'changes-requested'|'commented'|'dismissed'|null, path|null, line|null /* current, null if outdated or file-level */,
  startLine|null, side: 'old'|'new'|null, originalLine|null, commitSha|null, diffHunk|null, outdated, resolvedOnGitHub,
  threadId|null /* root id */, inReplyTo|null, createdAt, updatedAt, removedAt|null /* gone from GitHub at the last sync */ }
PrComments    = { schemaVersion: 2, sessionId, fetchedAt, pr: PrIdentity, trustedAuthors?: string[] /* config allowlist at sync */, comments: PrComment[] }          // review/pr-comments.json
PrResolution  = { status: 'addressed'|'declined', note, commitSha|null, files, at, sentAt|null /* review.sent.at when recorded */ }
PrResolutions = { schemaVersion: 2, sessionId, updatedAt, comments: Record<PrCommentId, PrResolution>, trust?: { authors: string[], comments: (PrCommentId | { id, bodyHash, updatedAt })[] } /* user grants */ }   // review/pr-resolutions.json
PrSummary     = { number, url, title, state: 'open'|'draft'|'merged'|'closed', baseRef, headRef, updatedAt } // SessionSummary.pr / SessionDetail.pr
PrCommentCounts = { prNumber, fetchedAt, total, open, addressed, declined, outdated, addressedInLastSend, declinedInLastSend } // roots only
PrCommentView = PrComment & { status: 'open'|'addressed'|'declined'|'outdated', trusted: boolean, resolution, closedBy: 'github-outdated'|'github-resolved'|'removed'|null,
  isReply, inLastSend, anchor: LineAnchor|null }
PrCommentsResponse = { pr|null, fetchedAt|null, lastSendAt|null, comments: PrCommentView[], resolutions|null, counts|null }
```

**Untrusted text.** Comment bodies are third-party input and a prompt-injection vector. `isTrustedPrComment(comment, prTrustFor(prComments, resolutions))` (`review/pr-trust.ts`): trusted = `author_association` OWNER/MEMBER/COLLABORATOR, Copilot (exactly the bot logins in `COPILOT_BOT_LOGINS` with type Bot, case-sensitive, never a substring; a person named `Copilot` or a lookalike bot is not trusted), a login in `trustedPrCommentAuthors` of `~/.ai-review/config.json` (copied into `pr-comments.json` at sync; exact case-insensitive equality), or a comment/author the user trusted with `ai-review pr-trust` (terminal only, stored in `pr-resolutions.json` `trust`). A comment grant is pinned to `hashPrBody(body)` (the full sha256; a short 16-hex pin from an earlier version lapses at the next sync and must be re-confirmed) and lapses when the body is edited: `pr-sync` drops it and reports `trustLapsed` (ids; also printed and in `--json`); a legacy bare-id grant counts until the next sync pins it to the body stored before that sync. An author grant is standing: that person's edits and new comments stay trusted. `PrCommentView.trusted` carries it. Untrusted comments are stored and shown in the dashboard but left out of the sent markdown, the hook counts, `ai-review pr-comments` and every dispatch; the feedback says how many were left out. Trusted bodies are still wrapped in `<untrusted-github-comment id=… author=…>` blocks (markers inside a body are neutralised) under one instruction that they are data, never to be obeyed.

Why a sibling `pr-resolutions.json` and not an `external` target in `resolutions.json`: the id space differs (GitHub ids, not `c<n>`), `pr-sync` rewrites `pr-comments.json` wholesale while resolutions must survive it, the status words differ (addressed/declined, with a commit), and `sessionStatus` (`resolutions.updatedAt > sent.at` → updated) and the Submit counts must not move because of external comments. One PR per session for now: `pr` is the current PR and every comment carries `prNumber`; `prs: PrIdentity[]` can replace `pr` later (field names match `PullRequest` in docs/pr-link-options.md).

Pure helpers (`review/pr-comments.ts`, browser-safe): `prCommentStatus(comment, resolution)` (resolution wins; else outdated / resolved on GitHub / removed → `outdated`; else `open`), `isAddressedInLastSend(resolution, lastSendAt)` (`sentAt` equals `review.sent.at`; a resolution without `sentAt` counts when `at >= lastSendAt`), `prCommentAnchor(comment)` (a `LineAnchor` for a current line comment, else null), `derivePrComments(prComments, resolutions, lastSendAt)` (views in display order, replies after their root sharing its status), `prCommentCounts`, `buildPrCommentsResponse`, `prSummary`. `renderPrCommentsMarkdown` renders the open ones; `renderSentMarkdown(sent, { …, prComments: { sessionId, pr, views } })` appends it as `## GitHub PR comments` before `## Required response`. External comments are never part of `Review.comments`, the sent snapshot's counts or Submit's open comments.

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

`reviewReducer(state, action, ctx: { files: TreeFile[] })`. `SET_VERDICT` carries `fingerprint: string|null` (falls back to the tree's); a reject is stored when its comment lands, pinned to the tree fingerprint at that moment. `ADVANCE`/approve/comment move to the next file whose effective verdict is `none` and that has no file comment (wrapping once), so a file updated since its verdict comes back into the deck. `ADD_COMMENT` with an anchored `file` target adds a line comment: it is stored like a file comment but neither resolves a pending reject (only the file comment box does) nor advances the deck. Other actions unchanged.

## review/sent.ts (`review/sent/<stem>.json`)

```ts
SentSnapshot = { schemaVersion: 2, sessionId, sentAt, decision, tree: { baseSha, headSha, branch }, patchPath /* review/sent/<stem>.patch */,
  files: { path, verdict, fingerprint, status, additions, deletions }[],   // effective verdict ≠ none
  comments: Comment[] /* open at send time, sentAt stamped */, counts: { files, approved, rejected, commented, unreviewed, openComments } }
buildSentSnapshot({ review, tree, decision, resolutions, now }); stampSent(review, sent, now); sentFileStem(sentAt); sentPatchPath(sentAt)
```

The server writes the `.json`, the `.md` (`renderSentMarkdown(sent, { title, dashboardUrl, evidence?, extras?, spec? })`) and the `.patch` (every per-file patch of the tree concatenated) in one go.

`renderSentMarkdown(sent, ctx)` layout: title line; `Sent · Decision · Dashboard` line; `Tree: <branch> @ <head12> (base <base12>) · Diff: \`<patchPath>\``; `## Overall`; `## Files (…)` with `### path — REJECTED|commented|approved`; `## Evidence`, `## Spec`, `## Extras` with `### <path> — <caption|title>` (path alone when unknown); `## Required response` telling the agent to change the working tree (nothing to publish), run `ai-review resolve <id> --comment c<n> …` per comment, and where the `.patch` is. Empty sections omitted. A comment line is `- [c<n>] > body`; a line comment is `- [c<n>] path:LINE > body` (`path:START-END` for a range, `path:LINE (old)` for the before side) followed, when `ctx.patch` (the full diff the server writes to the `.patch`) is given, by an indented fenced excerpt of the 1–3 diff lines around the anchor (`<number> <+|-| > <text>`), so the agent sees the code without opening the patch.

## schemas/agent.ts — unchanged (AgentRun, AgentRunEvent)

## schemas/api.ts

```ts
Health = { ok: true, home, adapter, claudeBin }
SessionSummary = { id, title, repo: { path, branch, baseRef }, tickets, status, progress: { reviewed, total }, openComments,
  stats: { files, additions, deletions }, updatedAt, activeRunId: string|null,
  pr?: PrSummary|null, prComments?: PrCommentCounts|null /* optional: from review/pr-comments.json */ }
SessionListItem = SessionSummary | { id, error }
ArchivedMarker = { archivedAt }                                  // archive/<id>/archived.json
ArchivedSession = { id, title, tickets, repo: { path, branch, baseRef: string|null }, createdAt, updatedAt, archivedAt }  // baseRef from the archived manifest
SessionDetail = { manifest, tree: WorkingTree, evidence: EvidenceItem[], extras: ExtraItem[], spec: SpecItem[], prDescription: string|null, status, progress, activeRunId, pr?: PrSummary|null, prComments?: PrCommentCounts|null }
ReviewResponse, PutReviewRequest/Response/Conflict, SendRequest = { decision, dispatch }, SendResponse = { sent, run, pending }, StartRunRequest — as before
StoreEvent =
  | { type: 'session.added'|'session.updated'|'session.removed'|'review.updated'|'resolutions.updated'|'pr-comments.updated', sessionId }
  | { type: 'run.updated', sessionId, runId }
  | { type: 'tree.updated', sessionId, fingerprint /* WorkingTree.fingerprint */, durationMs }
FileContentsSide = 'before'|'after'
ApiError = { error, reason?, isLarge? }
```

## Routes (all under /api)

```
GET  /health
GET  /sessions                                    SessionListItem[] newest first (summary uses the cached tree; computes it if absent)
GET  /sessions/archived[?kind=code-review|test-run] ArchivedSession[] newest archivedAt first; optional kind filter, otherwise all kinds (registered before /sessions/:id)
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
GET  /sessions/:id/pr-comments                    PrCommentsResponse (empty when never synced; 404 unknown session; 422 invalid file)
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

## Test runs (`kind: 'test-run'`)

A test run is a second session kind in the same store: `~/.ai-review/sessions/<id>/` holds `manifest.json` plus all review state exactly as for a code review (`review.json`, `resolutions.json`, `sent/`, `runs/`). The content is read live from the run folder (`manifest.run.path`) through the index the publish skills write. Dashboard routes live under `/t/<id>`.

### schemas/manifest.ts

`ManifestSchema = z.union([CodeReviewManifestSchema, TestRunManifestSchema])`. `CodeReviewManifest` is the shape above with `kind?: 'code-review'` (absent in older manifests). `TestRunManifest` = the same `schemaVersion/id/title/createdAt/updatedAt/agent/tickets` plus `kind: 'test-run'` and `run: { path /* absolute run folder, inside repo */, repo /* absolute checkout, where the agent runs */, feature: string|null, area: string|null }`, no `repo`. Helpers: `isTestRun(m)`, `manifestKind(m)` (`'code-review'` default), `agentCwd(m)` (`repo.path` or `run.repo`). `SCHEMA_VERSION` stays 2.

### schemas/test-run.ts: `<run>/test-run.json` (`TEST_RUN_INDEX_FILE`, `TEST_RUN_INDEX_SCHEMA_VERSION = 1`)

```ts
TestRunIndex = {
  schemaVersion: 1, runId: string, title: string, feature: string|null, area: string|null, createdAt, updatedAt,
  publishedBy: { plan?: P, dataSetup?: P, run?: P },          // P = { at: iso, hashes?: Record<string,string> } (source hashes, so a rerun rewrites only what changed)
  roots: Record<alias, relPath>,                              // alias /^[a-z][a-z0-9-]*$/; `run` must exist and be "."
  pages: ('gaps'|'data-setup'|'logs')[],                      // optional pages, default []
  overview: Panel[],                                          // default []
  scenarios: Scenario[],                                      // ids unique
  gaps?: { id, title, status: string, scenarios: string[], markdown? }[],
  bugs?: { slug, title, path: Ref, jira?, screenshots: Ref[], scenarios: string[] }[],
  dataSetup?: { steps: Step[], videos: Evidence[], screenshots: Evidence[], snapshotPath?: string /* local path to copy, not a Ref */, notes? },
  logs?: { path: Ref, label }[],
}
Scenario = { id /^[A-Za-z][\w-]*$/, title, status: 'planned'|'pass'|'fail'|'uncertain'|'gap'|'na'|'blocked',
  layers?: { name, status, note? }[], steps?: Step[], stepsMarkdown?: string,   // the skills write the step text; the server never parses steps.md
  evidence: { videos, screenshots, data: Evidence[] },      // each defaults to []
  logs: { path: Ref, from: line>=1, to: line>=from, label? }[],  // excerpts
  links: { gaps: string[] /* gap ids */, bugs: string[] /* bug slugs */ }, notes?, order: int>=0 }
Step = { label?, action?, expected?, observed?, result? }
Evidence = { path: Ref, caption?, layer?, atSec? /* chapter on the video timeline */ }
```

`roots` values are relative to the run folder with no leading `/`; `..` is allowed only as a leading chain (`../..`, `../../bugs`) because the plan and the bugs sit above the run folder (`plan: '../..'` is the plan folder holding `test-plan.md`). The server additionally refuses roots that resolve outside `run.repo`.

**Refs.** Every path in the index is `<alias>:<relative path>` (`RunRefSchema`, `/^[a-z][a-z0-9-]*:[^\0]+$/`), no leading `/` and no `..` segment on either separator. `parseRunRef(ref)` returns `{ alias, path }` or `null`. Example: `run:scenarios/s1-pass/videos/a.mp4`, `bugs:x/x.md`, `plan:test-plan.md`.

**Panels** (`overview`): `PanelSchema = z.union([discriminated union on type, unsupported fallback])`. Types: `markdown {markdown}`, `stats {items: {label, value, tone?, hint?}[]}`, `table {columns, rows}`, `key-value {items: {key, value}[]}`, `gallery {items: Evidence[]}`, `video {path, caption?, chapters?: {atSec, label}[]}`, `log {path, from, to, label?}`, `links {items: {label, scenario?|ref?|url?}[]}`, `scenario-list {ids?, statuses?}`; each with optional `title` and `span: 1|2`. Anything else (an unknown type, or a known type with a broken shape) parses as `{ type: 'unsupported', originalType, reason: 'unknown-type'|'invalid-shape', original }`: the index stays valid, the dashboard shows a placeholder and the server reports a warning.

**Fingerprints.** A scenario's fingerprint (16 hex, `FINGERPRINT_RE`) is computed by the server over its sorted evidence paths and sizes, the step text and the status; never over logs. A verdict stores it in `review.files[<scenario id>].fingerprint`, so "updated since your verdict" works as for files. `review.files` is keyed by item id: the repo path of a code review, the scenario id of a test run; `ui.currentFile` holds the current scenario id; `ui.section` accepts `SECTIONS` and `TEST_SECTIONS` (`overview, review, gaps, data-setup, logs, submit`).

### Review additions

`CommentTargetKind` adds `scenario` (ref = scenario id), `bug` (ref = slug) and `log` (ref = the log's `alias:path`; may carry an anchor, side `new` only). `Comment.kind?: 'not-clear'|'incorrect'|'expected-behaviour'` (`CommentKindSchema`) says what the reviewer means. `ReviewItem = { path, fingerprint }` (`TreeFile` fits; a scenario is `{ path: id, fingerprint }`); `effectiveVerdict`, `fileIsUpdated`, `anyFileUpdated`, `allFilesApproved`, `progress`, `sessionStatus` and the reducer's `ReviewContext` take items (`ReviewItem[]` or `{ files }`); `ReviewContext.itemKind` (`'file'` default, `'scenario'`) sets the target of a verdict's own comment. `isItemComment(kind)` is true for `file` and `scenario` and decides "commented" everywhere (`commentedPaths`, reducer, sent counts).

### schemas/sent.ts, review/sent.ts

`SentSnapshotSchema = z.union([CodeReviewSentSnapshotSchema, TestRunSentSnapshotSchema])`; `SentSnapshot` stays the code-review type, `AnySentSnapshot` is the union, `isTestRunSent(s)` narrows. `TestRunSentSnapshot = { schemaVersion: 2, kind: 'test-run', sessionId, sentAt, decision, run: { path, indexFingerprint: string|null }, scenarios: { id, title, status, verdict, fingerprint }[] /* all scenarios, effective verdict */, comments: Comment[] /* open, sentAt stamped */, counts: { scenarios, approved, rejected, commented, unreviewed, openComments } }`. `buildTestRunSentSnapshot(review, scenarios, decision, resolutions, now, run)` builds it (`scenarios` = `{ id, title, status, fingerprint }[]`); there is no patch. `stampSent` accepts either kind.

### api.ts additions

`TestRunSummary = { kind: 'test-run', id, title, createdAt, updatedAt, run: { path, feature, area }, tickets, status, counts: { scenarios, pass, fail, gap, na, blocked, uncertain, planned }, reviewed, total, openComments, lastSend?, activeRunId, latestRunStatus? }`; `SessionListItem = SessionSummary | TestRunSummary | { id, error }` (`SessionSummary.kind?: 'code-review'`). `SessionDetail = CodeReviewDetail (kind?: 'code-review') | TestRunDetail`, `TestRunDetail = { kind: 'test-run', manifest, index, warnings: string[], scenarios: (Scenario & { fingerprint })[], missing: string[], computedAt }`. `StoreEvent` adds `{ type: 'testrun.updated', sessionId }`.

### review/test-run-markdown.ts

`renderTestRunSentMarkdown(sent, { title, dashboardUrl, index: { bugs?, logs? } })`:

```
# Test review feedback — <title> (<id>)
Sent: <iso> · Decision: **<DECISION>** · Dashboard: <dashboardUrl>/t/<id>/review
Run: `<run.path>`

## Overall                      comments with no target
## Scenarios (n rejected, n approved, n commented, n not reviewed)
### <id> · <title>              only scenarios with a verdict or a comment, index order
Verdict: **<VERDICT>** · Status: <status>
- [c<n>] at 1:05 **[kind]** body      timestamp when set, kind prefix when set, multi-line bodies quoted with `  > `
## Bugs                         ### <slug> — <title>
## Logs                         ### <alias:path> — <label>; a line comment is `- [c<n>] alias:path:12 **[kind]** body`
## Required response            same wording as the code-review renderer, without the patch sentence
```

Empty sections are omitted; `\n` endings, one trailing newline. The grouping and quoting helpers shared with `renderSentMarkdown` live in `review/markdown-helpers.ts`.

Fixture run folder: `fixtures/test-runs/demo/plans/f/a/test-runs/run-1/` (see `fixtures/test-runs/README.md`); the schema tests parse its `test-run.json`.

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

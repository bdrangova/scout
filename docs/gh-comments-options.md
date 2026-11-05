# GitHub PR comments: four options

Mocks: `design/retro/mocks/gh-comments.html` (a tab per option, light and dark, 1440x900 and 800px; serve the folder). Fixture: PR #482 on variety-app with 10 threads (4 addressed, 1 declined, 1 outdated, 4 open) and a Copilot summary: a Copilot suggestion on a diff line, a human nit, a two-comment thread, a declined bot suggestion with its reason, a fix that touched three files, an outdated comment, a review-level "Changes requested" and a general comment. Every option shows the four statuses, the rail, the empty state, 43 comments, how to trigger "address these" and the run in progress.

## Is it another spec?

Half right. As an input it behaves like a spec: it says what the work should do. But a spec is context fixed before the work, read-only, and has no outcome. A PR comment has an author, a place, a thread, a GitHub id, and a per-item outcome (addressed, declined, outdated, open) that changes while you watch, plus a write-back (reply). That is a source with its own lifecycle, closer to the reviewer's own comments plus resolutions than to `spec/`. So: **store it as its own source (not in `spec/`), and let the UI decide where it shows.** Option B is the "it is a spec" answer; A, C and D treat it as a source.

## Where each concern lives

| Concern | Need | Home (recommended) |
|---|---|---|
| What was said (author, bot or human, place, thread, status) | read, then scan | PR feedback page: one card per thread, GitHub on the left |
| What the agent did (note, files, commit, mini diff) | verify | Same card, right side; full diff by "Open in Files" at the fixing commit |
| Overall progress (handled / total) | glanced at | Rail block header and the page's progress bar; tab shows the open count |
| Find an unaddressed comment | frequent | Rail: group by file / author / status, Open filter |
| Replies to GitHub | end of the loop | Push replies button (drafts, edited per card) |
| Start addressing | once or twice | "Address open comments" split button, starts a run like Submit |
| Fetch / refresh | rare | Refresh button and `ai-review pr-sync`; never automatic |
| Reviewer's own comments and Submit | unchanged | Submit stays about the reviewer's feedback; PR comments never count as Open comments |

## Options

**A. PR feedback: a section of its own.** Sixth tab (count = open, like Submit). Rail block: PR number, handled/total bar, All/Open/Handled, group by File/Author/Status, a glyph per status. Page: progress panel, then threads grouped by file; each card is GitHub on the left (diff context, comments, Bot tag, suggestion) and the agent on the right (note, commit chip, changed files with a mini diff, draft reply). PR-level comments form their own group. Trigger: split button runs the agent; progress shows as working/queued cards and the run notice.

**B. A generated doc in Spec.** The agent writes `spec/pr-feedback.md`; Spec renders it beside the Jira ticket, the rail shows it with its headings nested and a handled/total chip. Statuses are text badges. No button: you ask Claude Code in the terminal. Nothing new to build.

**C. Inline in Files.** Annotations under the diff line, like line comments but with author, Bot tag and status; the fix's lines are marked and linked ("Fix on lines 19–20"). Files rail gets a PR box (progress, Address, Push) and a "GitHub comments" filter; tree rows and the fixing commit in the timeline carry counts. Comments without a line live in a "PR conversation" panel.

**D. An "Addressed" view.** Sixth tab for verification: rows grouped by what you must do (ready to push, needs your call, already replied, outdated, still open). Comment on the left; on the right a side-by-side before/after, the agent's note and the editable reply with an "Include in push" tick. A sticky bar pushes the ticked replies.

## Comparison

● good, ◐ partial, ○ poor.

| | A. Section | B. Spec doc | C. Inline in Files | D. Addressed view |
|---|---|---|---|---|
| Review what was asked | ● all kinds, threads, filters | ◐ readable, no filter | ◐ line comments only; summaries in a side panel | ◐ handled ones first, open ones at the bottom |
| Verify what changed | ◐ mini diff, jump to Files | ○ text link | ● in the diff, fix lines marked | ● before/after beside the comment |
| Find an unaddressed comment | ● Open filter, group by status | ◐ table of open ones | ○ file by file, counts only | ◐ list at the bottom |
| Push replies back | ◐ per card + one button | ○ not possible | ◐ per annotation + rail button | ● tick, edit, push bar |
| Trigger and progress | ● button, run, live cards | ○ terminal only, file rewrites | ◐ rail box, annotation flips | ◐ button, rows fill in |
| 43 comments | ● rail groups + compact rows | ○ long document | ◐ folded code, collapsed notes | ◐ compact rows, one expanded |
| Effort | M–L: tab, rail block, page, contract, CLI | S: no contract change | L: anchor mapping (original to current line), outdated, diff deck changes | M–L: page + the push path |
| Fit with shell | new tab, rail block pattern as Files | perfect, Spec exists | fits Files, but the deck is a verdict flow | new tab, overlaps A |

## Recommendation

**A as the home, with D's push bar folded into it later and C's links as a finishing touch.** Reasons: it is the only option that holds every kind of comment (summaries and general comments have no line), gives one place for progress and for finding what is still open, and keeps the reviewer's Submit flow untouched. C is the best way to verify but cannot be the home (no summaries, no overview, crowds the deck); D is a subset of A arranged for pushing. B proves nothing about state and cannot push.

Smaller-first slice, in order, each shippable:

1. **Today, no code:** the agent writes `spec/pr-feedback.md` (option B). Validates the skill, the ingest and the wording of notes.
2. **Contract + `ai-review pr-sync` + read-only A page:** rail group by file/status, threads with the agent's note and commit chip, progress bar. You tell Claude Code to address comments; it records outcomes with `ai-review pr-resolve`.
3. **Address button and progress:** starts a run, working/queued states.
4. **Push replies** (drafts, per-card edit, sticky tick bar) via `gh`.
5. **Files links:** "Open in Files" at the fixing commit, `gh` counts on tree rows and the timeline node. Annotations in the diff only if the links prove not enough.

## Data the contract would need (no implementation)

Separate from `Comment` (ids `c<n>`, the reviewer's own): external comments must not enter Submit, `openComments` or the sent snapshot.

```
github/pr.json            written by `ai-review pr-sync`; the server only reads it
  PrFeedback = { schemaVersion, fetchedAt, pr: { number, url, title, repo, headRef, baseRef, headSha }, threads: PrThread[] }
  PrThread   = { id: 't<n>' (local, never reused), kind: 'line'|'review'|'general'|'summary', nodeId, path|null, line|null,
                 originalLine, side, commitSha, diffHunk, outdated, resolvedOnGitHub, reviewState?,
                 comments: { ghId, nodeId, author: { login, kind: 'bot'|'user' }, body, suggestion|null, createdAt, url, inReplyTo|null }[] }
review/pr-resolutions.json   agent-owned, written by `ai-review pr-resolve <t> --addressed|--declined|--outdated --note … --reply … --commit …`
  { schemaVersion, sessionId, updatedAt, threads: Record<t<n>, { status: 'addressed'|'declined'|'outdated'|'open', note, at, files[], commits[],
      reply: { body, status: 'draft'|'posted', postedAt, ghCommentId } | null }> }
```

Derived in `shared` like `commentStatus`: status = resolution, else `outdated` when GitHub says so, else `open`; `working`/`queued` from the active run. Summary gets `prFeedback: { open, total }`; `SECTIONS` gains `'pr'`; one new `StoreEvent` (`prfeedback.updated`); routes `GET /sessions/:id/pr-feedback` (merged), `POST …/pr-feedback/sync`, `POST …/pr-feedback/replies`.

Ingestion, by a skill or the CLI through `gh` (the server holds no token): `gh pr view --json number,url,title,headRefName,baseRefName,reviews,comments` for summaries and general comments; `gh api repos/{o}/{r}/pulls/{n}/comments --paginate` for line comments (`path`, `line`, `original_line`, `diff_hunk`, `commit_id`, `in_reply_to_id`, `user.type`); GraphQL `reviewThreads { isResolved isOutdated }` to group threads and flag outdated. Bots are `user.type == "Bot"` (Copilot included). Replies: `gh api -X POST …/comments/{id}/replies`.

## Open questions

1. Own source or Spec? **Own source** (above); B stays the zero-code stopgap.
2. Who talks to GitHub? **The CLI/skill via `gh`; the server only reads files.** The Refresh button asks the server to run the CLI.
3. Does the dashboard post replies? **Yes, only on an explicit Push, as drafts you can edit; never automatically.**
4. Resolve threads on GitHub when pushing? **Off by default** (the tick in the push bar); never for declined threads.
5. Do external comments count in Submit's Open comments? **No.** Separate counter on the tab and rail.
6. New comments arriving after a sync? **Manual refresh, plus a refresh when a run starts; new threads get a "new" mark.**
7. Outdated comments? **Shown, collapsed, counted as handled, no reply needed.**
8. Which commit "addressed" a thread? **The agent records it; uncommitted work shows "uncommitted" until the next commit.**
9. Several PRs per session? **One PR per session, found from the branch with `gh pr view`.**
10. Does the agent ever skip a comment on its own? **Yes, as "declined" with a reason you can send back for reconsideration; it never closes a thread itself.**

Related: `docs/pr-link-options.md` (PR identity `manifest.prs`, the Submit choice "Update PR / Open new PR"); a session may have several PRs over its life, so answer 9 should read "the current PR, resolved from `manifest.prs`".

## Phase 1 built (data, CLI, server)

Decision: option C. External PR comments appear inline on the diff lines in Files, and the Submit page's one comments panel ("Open comments" / "Comments") lists the PR threads next to the session's own comments, under the same headings: by file path under Files, the ones that name no file under Overall. There is no separate GitHub section. Open threads show; addressed, declined, outdated and resolved/deleted ones count as resolved and sit behind "Show n resolved" (the header counts include them). Each card keeps the author, body, replies, "View on GitHub", the agent's note with the commit chip, the "Not sent to agent" tag and an "In Files" link. Status is carried by colour, not a word: an addressed card has a green wash and a declined one a red wash (the file cards' approved/rejected tint; the word is `sr-only`); open and outdated keep their chip. There is no "In last send" anywhere in the UI (`inLastSend` and `lastSendAt` stay in the contract, unused by web). The cards are informational: they never change Will be sent, the suggested decision or the send. No replies are posted and no GitHub thread is resolved; external comments never count in Open comments or the verdict counts. Full contract: `shared/README.md` ("schemas/pr-comments.ts").

**Files.** `review/pr-comments.json` (written only by `ai-review pr-sync` / `pr-link`: PR identity + comments, merged on every sync, vanished comments kept with `removedAt`) and `review/pr-resolutions.json` (agent-owned, `ai-review pr-resolve`: `addressed` with a note and optional `commitSha`, or `declined` with the reason; each carries `sentAt` = the `review.sent.at` current when recorded). A sibling file rather than an `external` target in `resolutions.json`: different id space (`rc|rv|ic<githubId>`), a different writer, different statuses, and `sessionStatus` and Submit must not react.

**For the UI agent**
- Import from `@scout/shared`: `PrCommentsResponse` (`PrCommentsResponseSchema`), `PrCommentView`, `PrComment`, `PrCommentCounts`, `PrSummary`, `PrIdentity`, `PrResolution`, `PrCommentStatus` (`open|addressed|declined|outdated`), `PrAuthor` (`kind: human|bot|copilot`), `LineAnchor` (already used by the diff). Do not re-derive status: the route returns views; to derive client-side use `derivePrComments(prComments, resolutions, lastSendAt)`, `isAddressedInLastSend(resolution, lastSendAt)`, `prCommentAnchor(comment)`, `prCommentCounts`.
- Route: `GET /api/sessions/:id/pr-comments` returns `PrCommentsResponse` (`comments` in display order: anchored line comments by path and line, then outdated/file-level ones, review summaries, general; replies directly after their root; `pr: null` and no comments when never synced). `view.anchor` is a `LineAnchor` (`side: 'new'|'old'`, `line`, `endLine?`) for a current line comment, null for outdated/removed/file-level ones (show those in a file-level or "outdated" group; `originalLine` and `diffHunk` are there for context). `view.url` is the GitHub permalink. `view.inLastSend` marks answers recorded for the last Submit (`resolution.sentAt === lastSendAt`); a reply's `status` equals its root's and replies are not counted (`isReply`).
- Summary and detail: `SessionSummary.pr` / `SessionDetail.pr` (`PrSummary`: `number, url, title, state: open|draft|merged|closed, baseRef, headRef, updatedAt`; null when no PR is known; the PR tab opens `pr.url` in a new tab) and `prComments` (`PrCommentCounts`: `total, open, addressed, declined, outdated, addressedInLastSend, declinedInLastSend`, roots only). Both optional/nullable.
- Events on `/api/events`: `pr-comments.updated` (either PR file changed; refetch the route) and `session.updated` when `pr-comments.json` changes (refetch the detail for `pr`).
- Fixture sessions (`npm run fixture`; see `fixtures/README.md`): `20261005-0900-var-201-pr-comments-b4e1` (every state, thread with reply, Copilot/human, summaries, general; sent, so `lastSend` exists), `20261005-0930-qi-15472-trial-bar-pr-fresh-c5d2` (draft PR, all open, nothing sent), `20261005-1000-qi-15472-trial-bar-pr-no-comments-d6f3` (PR, zero comments), `20261005-1030-qi-15472-trial-bar-pr-merged-e7a4` (merged PR, all addressed in the approved send).

**CLI** (all through `gh`; the server never talks to GitHub):
- `ai-review pr-sync [id] [--repo <path>] [--pr N] [--json]`: `gh pr view` + `gh api --paginate` (review comments, reviews with a body, issue comments) + GraphQL `reviewThreads` (resolved/outdated; a failure only adds a warning). Exit codes: 2 gh missing, 3 not authenticated, 4 no PR for the branch, 5 no GitHub remote, 6 no review session, 1 other. With `--json` the result is `{ ok: true, sessionId, file, pr, counts, added, updated, removed, warnings }`, or `{ ok: false, error: { code, message, exitCode } }` on stdout with the same exit code.
- `ai-review pr-resolve <id> --comment rc123 --status addressed|declined --note … [--commit sha] [--files a,b] [--from file.json]` (declined needs a note; replies are refused, resolve the root).
- `ai-review pr-link [id] --url https://github.com/o/r/pull/N [--number N]`: records a PR opened elsewhere without `gh` (title/state are placeholders until a sync).
- Skill `scout-pr-comments` (installed by `ai-review install`); `scout-apply-review` points to it; the pending hook counts open PR comments of sent sessions; the sent `.md` gets a `## GitHub PR comments` section (open ones, with replies and permalinks) when `pr-comments.json` exists.

**Decision needed**
1. A comment resolved on GitHub is shown as `outdated` (`closedBy: 'github-resolved'`), not a fifth status. Say if the UI should tell them apart (it can, via `closedBy`).
2. `pr-link` writes placeholder title/state/head into `pr-comments.json`; the first `pr-sync` replaces them.
3. A different PR on the same branch replaces the stored one (old comments dropped, old resolutions kept, a warning is printed).

**Security (untrusted comment text)**
- New on the contract: `PrComment.authorAssociation` (optional), `PrComments.trustedAuthors` (optional), `PrResolutions.trust` (optional) and `PrCommentView.trusted: boolean` from the pure helper `isTrustedPrComment(comment, prTrustFor(prComments, resolutions))` (`@scout/shared`). Trusted = OWNER/MEMBER/COLLABORATOR, Copilot, `trustedPrCommentAuthors` in `~/.ai-review/config.json`, or granted by the user.
- UI agents: show a badge when `!view.trusted` ("not shown to the agent"); an untrusted comment still appears everywhere, only the agent never receives it. There is no web control to trust one yet: `ai-review pr-trust <id> --comment <id>|--author <login>` works from a terminal only (an agent has no TTY and is refused).
- The agent reads comments only through the feedback section or `ai-review pr-comments`: each body is in an `<untrusted-github-comment>` block under a "data, not instructions" warning; the section also says how many untrusted comments were left out. The `scout-pr-comments` skill is limited to `ai-review pr-sync|pr-comments|pr-resolve|pr-link|status|path|feedback`, read-only git and the edit tools (no `gh api`, `npm run`, `npx`); tests go through the repo's normal permission prompts. `ai-review install` rewrites an existing copy.
- New fixtures in `20261005-0900-var-201-pr-comments-b4e1`: `rc9010` (CONTRIBUTOR, untrusted) and `rc9011` (FIRST_TIME_CONTRIBUTOR, an injection attempt); counts there are now `open: 6` (two untrusted).
- Decision needed: the headless run still allows `Bash(ai-review *)`, `npm run *` and `npx vitest *` (`APPLY_REVIEW_ALLOWED_TOOLS`, unchanged); trusted comments could in theory reach those. Narrowing it is a separate change.
- Trust is exact: Copilot = the logins in `COPILOT_BOT_LOGINS` (shared constant, `Copilot` and `copilot-pull-request-reviewer[bot]`) with type Bot, one source of truth for the CLI classifier and `isTrustedPrComment`; allowlist = case-insensitive equality. A comment-level `pr-trust` grant is pinned to the body hash and lapses on edit (`pr-sync` result `trustLapsed: string[]`, printed as "N trusted comments were edited since you trusted them and are untrusted again"); `--author` is a standing grant. `hashPrBody` is exported from shared. `copilot-swe-agent[bot]` is not in the set (unverified): add it to `trustedPrCommentAuthors` if wanted.

## Phase 2: instructions and replies (contract)

The loop, decided with the user: (1) on an **open** PR thread the user types an *instruction* for Claude; it travels with the next Submit and is never posted. (2) After the fixes Claude regenerates the dashboard info and proposes a *reply* per answered thread (`ai-review pr-resolve --reply "…"`). (3) The user edits or accepts it, Submits, and `ai-review pr-reply` posts those texts to GitHub. The Submit is the approval; the server still never calls GitHub.

**Files**
- `review/pr-resolutions.json`: each resolution gains optional `proposedReply` (max 65000 chars, `PR_REPLY_MAX_LENGTH`). Written only by `pr-resolve --reply`; never posted by itself.
- `review/pr-replies.json` (`PR_REPLIES_FILE`, new; the dashboard server writes it, and `pr-reply` sets `postedAt`/`githubUrl`): `{ schemaVersion, sessionId, updatedAt, replies: { [rc|ic|rv id]: { body, kind: 'instruction'|'reply', editedAt, postedAt: string|null, githubUrl? } } }`. Keyed by the thread root. A new draft's `kind` is derived from the status at its first save (open → `instruction`, addressed/declined → `reply`); later saves keep it, so a private instruction never becomes a public reply by an edit. Only an explicit `kind: 'reply'` on the request ("Use this reply") converts it.
- Sent snapshot (`review/sent/*.json`) gains optional `prReplies: { commentId, kind, body, url }[]`: the unposted drafts at Submit. An instruction is included only while its comment is open, a reply only while it is addressed/declined; posted drafts are never included again. A Submit with no decision and no comments but with drafts is accepted. The `.md` gets `## PR comment instructions and replies`: `### Instructions for GitHub PR comments` (the user's own text, trusted; comment bodies are not repeated) and `### Replies the reviewer approved to post`.

**Server**
- `PUT /api/sessions/:id/pr-replies/:commentId`, body `{ body, kind? }` → `{ commentId, draft: { body, kind, editedAt, postedAt } | null, updatedAt }`. 404 unknown comment id (not in `pr-comments.json`), 400 for a reply inside a thread, an outdated/removed comment, a bad id or body. `kind` must equal the kind the status implies (else 400). Saving an existing unposted draft whose kind no longer fits the status (an instruction on an answered thread, a reply on a reopened one) is a 409 with `reason: 'pr-reply-kind-mismatch'` unless the request names the implied kind. A blank body deletes the draft, except an already-posted one (kept as the record); saving the posted text again changes nothing; a new text starts a new unposted draft. Atomic write under a per-session lock; the watcher reports `pr-comments.updated`.
- `GET /pr-comments` views gain `proposedReply: string|null` and `draftReply: { body, kind, editedAt, postedAt }|null` (thread roots only; both optional in the schema).
- Shared: `PrRepliesSchema`, `PrReplyDraftSchema`, `PutPrReplyRequest/ResponseSchema`, `SentPrReplySchema`, `prReplyKindFor`, `buildSentPrReplies`, `renderPrRepliesMarkdown`; `derivePrComments`/`buildPrCommentsResponse` take the drafts as a last argument.

**CLI**
- `ai-review pr-resolve <id> --comment … --status … --note … [--reply <text>]` (also `reply` in `--from` items).
- `ai-review pr-reply [--session <id>] [--repo <path>] [--dry-run]`: reads the LATEST sent snapshot's `prReplies` of kind `reply`; posts each with `gh api --method POST <endpoint> --input -` (JSON body on stdin, never in a shell string): `repos/{o}/{r}/pulls/{n}/comments/{id}/replies` for `rc`, `repos/{o}/{r}/issues/{n}/comments` for `ic` and `rv`. Skips: comment not in `pr-comments.json`, a reply inside a thread, a removed comment, `postedAt` already set, a draft whose stored kind is not `reply`, and a draft removed or edited since the Submit (submit again to approve the new text). One failure does not stop the rest; `postedAt`/`githubUrl` are written after each post; the exit code is 1 when any failed. It never reads `proposedReply`.
- Skills: `scout-pr-comments` passes `--reply` on every `pr-resolve`, follows the instructions section, and runs `ai-review pr-reply` only when the feedback lists approved replies; its allowed tools add `Bash(ai-review pr-reply *)` and still contain no `gh`.

**Web** (see `web/src/DESIGN.md`, "Reply box"): each open or answered thread root gets a text box (instruction on an open thread, proposed or edited reply on an answered one, a read-only quote once posted); an untouched proposal is not a draft until "Use this reply" or an edit; there is no Dismiss (it could not be persisted). Text autosaves after 250 ms and Submit flushes the boxes first. An answered thread with an unaccepted proposal or an unposted draft stays visible in Open comments until posted; the header counts only threads still open on GitHub. Will be sent shows "Instructions n" and "PR replies n", and Submit works with only drafts and no decision.

**Fixtures** (`20261005-0900-var-201-pr-comments-b4e1`): see `fixtures/README.md`.

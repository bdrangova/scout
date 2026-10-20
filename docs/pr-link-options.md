# Showing that a pull request was opened, and linking to it

Mock: `design/retro/mocks/pr-link.html` (serve the folder; light and dark at 1440x900, key screens at 800px; every option shows the ten states below). Fixture content is invented (QI-15472 trial-app, PR #231 into master).

## Problem

A session has `pr-description.md` (Submit shows it) but nothing records that a PR was opened on GitHub, by whom (Claude Code through `gh pr create`, or the developer), or links to it. The user wants it visible across the app: list rows, rail, status, timeline, Submit, bar. Second requirement: when the review is approved and submitted, the user chooses what happens with the code, and a session can have several PRs over its life.

## States (one map for all options)

`ready` (approved and sent, no PR; Create PR offered) · `creating` (run in progress) · `open` · `draft` · `updated` (open, but the branch has commits newer than the PR or the last review: re-review) · `merged` · `closed` · `external` (open, found on GitHub, not created here: tagged "detected") · `error` (gh not signed in, push rejected: Retry) · `none` (no GitHub remote, multi-repo session, `gh` missing: nothing renders anywhere).

Tones follow the existing vocabulary and live in one new map, `STATUS_TONE.pr(state)` → `{ tone, label, icon }`: ready/creating info, open ok, draft neutral, updated warn, merged info, closed err, error err. Labels always carry the meaning; colour never alone. "Updated" reuses the existing re-review concept (U14 "Updated since sent"): the PR state adds the PR-specific fact (N commits since the PR opened, K not pushed).

## The choice at Submit (all options)

When the decision is Approve, Submit asks what happens to the code:

| Choice | Does | Result |
|---|---|---|
| **Update PR #231** (or "Push to feature/trial-bar" when no PR exists) | commit uncommitted changes (message from the pr-description.md title), rebase if behind, push the same branch; no `gh pr create` | PR becomes `updated · N new commits` (re-review), checks re-run, history gets iteration n+1. This is also how GitHub-comment iterations land |
| **Open new PR** | new branch from HEAD (suggested `feature/trial-bar-2`, editable), `git push -u`, `gh pr create --base master` with title and body from pr-description.md | the new PR becomes current; the old one moves to History |
| **Approve only** | nothing | as today |

Default: update when a PR is open for the branch, else open a new one. Shown as radio cards in a "After approval" panel (A, B, D) with the command that will run under the selected card, or as a split-button menu in the send bar (C). The button names the choice ("Approve and update PR", "Approve and open new PR"). A run executes it (kind `open-pr` or `push`); the outcome shows as a run row, the PR state in the option's surface, and pushed/PR markers on the timeline.

Edge cases (mock section "The choice at Submit"): uncommitted files (warn: they are committed first; review them via scope Uncommitted); branch behind the remote (warn: rebase first, a conflict stops the run and says so); no remote or not GitHub (whole PR UI hidden; Approve only); gh not signed in (Open new PR fails: err notice, pushing still works); PR merged or closed (update disabled with the reason, only new PR); agent working (Submit disabled). History: iterations and earlier PRs appear in the Pull request panel (A), the PR page (B), a one-line "Iteration" row in the popover (A, D) or the row subtitle (C).

## Information architecture: where each concern lives

| Concern | Home | Why |
|---|---|---|
| Does a PR exist, its number and state | wherever the session is identified (rail identity, list row) | it is a fact about the branch, like the ticket and branches |
| Create it | the place the review ends (Submit, after Approve is sent) | the decision and the PR are one journey; the agent runs it as a run |
| Choose update vs new PR | Submit, in the Decision area (or the send button) | it is part of the approval decision |
| Link out | the PR chip/row/tab, always an explicit "Open on GitHub" | external navigation should never be a surprise |
| Checks, reviews, comments count | one detail surface (popover, panel or page) | glanced rarely, too much for the rail |
| GitHub comments to address | the same detail surface (see below) | it is the same PR |
| Re-review needed | the existing Updated status, plus an amber PR state and "N new commits" | one concept, two places that agree |
| Find sessions by PR | list row badge + filter pills "PR open", "Needs PR" | |

## Options

**A. Chip in the rail identity, Submit panel, list badge.** At Submit the choice sits in an "After approval" panel and the Pull request panel lists History. A chip under "from <branch>" (inline on the one-line compact identity) opens a popover with details and the next action; Submit gets a "Pull request" panel above the compose panels; the timeline marks the PR commit with an icon; list rows get a small chip after the branches. Roomy identity grows 23px.

**B. Sixth arrow tab "PR" with its own page.** The tab shows the state (green "Create PR", amber dot, "Merged"); the page has status, checks, reviewers, GitHub comments entry; the rail block is a five-row pipeline; the timeline ends in a PR node (dashed until it exists); the list has a PR column.

**C. Minimal: status row.** The choice is a split button in the send bar. After approval the review block's "Suggested decision" row becomes a "Pull request" row (No PR yet [Create PR] / PR #231 open ↗); the Submit send bar carries the same state and the primary action; list rows get "#88 ↗". No detail surface.

**D. Bar element that morphs.** One control right of the tabs on every page: ink "Create PR" → "Opening…" → "● #231 open ↗" → amber "2 new" → "merged" → red "PR failed". Click opens the A popover.

## Comparison

| Flow | A | B | C | D |
|---|---|---|---|---|
| Know a PR exists | rail chip (rail open), Submit panel | tab on every page | rail row, send bar | bar, every page, rail closed too |
| Open it | chip → popover → GitHub (2 clicks) | tab → page → GitHub (2) | row is the link (1) | chip → popover → GitHub (2) |
| Create it | popover or Submit panel | PR page | row button or send bar | bar chip → popover |
| New commits need re-review | amber chip, timeline dots, popover notice | amber tab dot, end node, page banner | amber row, "Updated" notice | amber "2 new" in the bar |
| Choose update vs new PR | cards at Submit, history in the panel | cards at Submit, outcome and history on the PR page | split button in the send bar (menu with a line each) | cards at Submit, chip follows the outcome |
| See iterations / earlier PRs | History list in the panel | History on the PR page | one line in the row subtitle | Iteration row in the popover |
| Find PR sessions in the list | chip + pills | PR column + pills | #n link + pills | round icon + pills |
| At 800px | Submit panel and list chip visible; chip in drawer | icon-only tab keeps number and state; page is one column | send bar carries it on Submit; Files only in drawer | chip shrinks to icon and number, stays in the bar |
| Effort | M | L (route, page, tab, rail block) | S | M |
| Shell fit | good: facts live in identity | good for the journey; sixth tab is heavy | best: no new surface | breaks "no status in the bar" (header B decision 1) |

## Recommendation

Ship **C now, then grow into A**. C needs no new page or route: the Pull request row (rail) and the send bar (Submit) cover create, link and re-review where the user already is after approving, and it works at 800px on the page that matters. When checks, reviewers and the GitHub-comments feature need a home, add A's chip popover on top of the same row: the row becomes the popover's trigger, nothing is thrown away. B is the most complete but the sixth tab and page are the biggest build for a surface visited once per session; D is cheap but spends bar width and reverses the "bar has no status" decision.

Smaller-first slice: (1) `manifest.pr`, `STATUS_TONE.pr`, the "Pull request" row in `RailReview`, `#n ↗` in the list row; (2) the Submit send-bar split button with the three choices (Update PR / Open new PR / Approve only) and the `integration` field on the send decision, handling dirty, behind, merged/closed and gh-not-signed-in; (3) creating/updated/merged/closed/external states, filters; (4) A's popover and History. Step 2 carries the new requirement because the choice is the core action; the display states can follow.

## Relation to "GitHub comments addressed"

The other agent's feature needs the PR identity (repo, number) to fetch review comments, so it should read `manifest.pr` rather than keep its own. Its entry point belongs on the PR detail surface: the "Comments · 3 on GitHub · 2 unresolved [Address]" row in the popover/panel (A, B, D), or in C a second line in the row, "2 to address ↗" that opens the feature. No second PR chip. A PR in `merged` state hides "Address". Its list indicator, if any, is the same chip with a count, not a new badge.

## Data the contract would need (no implementation)

```ts
manifest.prs: PullRequest[]            // oldest first; the current one is the last open one, else the last
PullRequest = { number, url, state: 'open'|'closed'|'merged', draft: boolean, title, baseRef, headRef,
  headSha /* PR head */, openedAt, openedBy: 'agent'|'github' /* 'github' = detected */,
  kind: 'new'|'detected', runId: string|null,
  iterations: { n, kind: 'update'|'new', pushedAt, headSha, runId }[] }   // 'update' = pushed to the same branch
review.sent = { at, decision, integration: 'push'|'new-pr'|'none', newBranch?: string }   // approve only
```
A merged or closed PR stays in the list as history; "Open new PR" appends one. Every `update` appends an iteration; re-review is derived (branch HEAD ≠ last reviewed head).
Written by the integration run (`push` or `open-pr`; the skill parses `gh pr create` output) and refreshed by detection: `gh pr view --json number,url,state,isDraft,title,headRefOid,mergedAt,statusCheckRollup,reviewDecision,comments` for the session branch (`gh pr list --head <branch>` when none is recorded). Live values (checks, reviews, comment counts) are fetched on demand and not stored. `updated` is derived: branch HEAD ≠ `headSha`, or the existing file-fingerprint "updated". The runs use new kinds `push` and `open-pr`; the body of a new PR is `pr-description.md`, the commit message for a push is its title plus the run summary. Hidden when `repo.remote` is not github.com, the session has several repos, or `gh` is missing. Errors come from the failed run's message.

## Open questions (default answer)

1. Is the PR created by Claude Code only, or can the app run `gh` itself? Default: a run (consistent with Submit, and it shows in Runs history).
2. Draft by default? Default: unchecked, remembered.
3. Who pushes the branch? Default: the run pushes first, the panel says "1 commit not pushed yet".
4. Detect PRs opened outside? Default: yes, on session load and on focus, tagged "detected".
5. Poll for state changes? Default: refresh on focus and a manual refresh, no timer.
6. After merge, auto-archive? Default: offer "Archive session", never automatic.
7. Closed without merge: offer "Create a new PR"? Default: yes.
8. Multi-repo sessions? Default: hidden (PRs are per repo).
9. Does an approved-but-no-PR session count as "needs attention" in the list? Default: yes, pill "Needs PR".
10. Is the choice shown when no PR and no remote exist? Default: no (hidden with the PR UI).
11. Default choice with a PR open? Default: Update PR; with none: Open new PR; remembered per session? Default: no, always the computed default.
12. Commit message for a push? Default: pr-description.md title, then the run summary; editable in the card.
13. Branch name for a new PR? Default: `<branch>-2` (increments), editable; a PR for it is created from HEAD, never from the old PR's branch tip if that is merged.
14. After "Open new PR", does the review reset? Default: yes, a new iteration of the session starts from the new base (existing `init` behaviour), history keeps the old PR.
15. Show the PR in the bar at all? Default: no (keeps header B decision 1); revisit only if D is chosen.

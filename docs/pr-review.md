# PR review

PR review is the third session tab, at `/pr`. It reuses the Development session list, search, status filters, list/grid layouts, archive with Undo, archived list, Restore and confirmed Delete. PR sessions use the same `/s/:id/files` shell, with the tab labeled Review, full changed-file tree, commit scopes, Swipe/Scroll/Grid, file verdicts, draft-with-verdict behavior, Undo and manual line/range comments.

`scout install --repo <path>` installs `scout-pr-review` for Claude (`.claude/skills`) and Codex (`.agents/skills`). Ask for a PR review in that session, optionally naming an ordered skill chain. Without one it uses `default-code-review`, installed next to it, which looks for real regressions; `scout-pr-review` then reproduces the actionable findings with `/reproduce`. The dashboard only consumes the report; it does not choose or run skills.

## Summary page

A PR review opens on Summary. At the top a card sums the PR up in a few plain bullets, with badges for the kind of
change (feature, fix, refactor, chore, docs, tests) and the areas it touches (security, frontend, backend, database,
infra, build, dependencies). The badges are one shared set so other modules can show the same ones. The card also
lists author, branches, commit count, size, labels and the linked Jira tickets. Below it come the PR description
and the changed files (each opens that file on the Review page), in scroll or grid, each card collapsible. A ticket
saved by `/jira-snapshot` shows in full; a ticket link only accepts http(s) addresses.

`scout pr-report facts <PR>` gathers the facts from GitHub (title, description, author, branches, labels,
commits, ticket keys from the title, branch and description); the skill adds the bullets and badges and stores them in the
report's optional overview. A report without one shows a short note instead of the card.

## Agent/adapter interface

1. Check out the PR head cleanly in a dedicated checkout when necessary. Do not change the user's dirty checkout.
2. `scout init --kind pr-review --repo <checkout> --base <target-ref> --title <title>` creates/reuses a PR session independently of Development sessions on that branch. Archived sessions are never reused.
3. `scout pr-report template <id> --pr <url> --number <number> --repository <owner/repo>` prints revisions and the complete changed-file/fingerprint list.
4. `scout pr-report schema` prints the JSON schema. Any review skill can produce it; record its name/version and finding sources. Deduplication belongs to the session's review chain.
5. Write a report and real evidence outside the checkout. Evidence paths are relative to the report JSON. Schema validation enforces step links, revision, verification limits and screenshot/video or non-visual evidence requirements. Videos are WebM or MP4 up to 200 MB; other evidence up to 20 MB.
6. `scout pr-report validate <id> <report.json>` checks against git. `scout pr-report import <id> <report.json>` validates, copies and hashes evidence, stores an immutable report version, then replaces the active report atomically. Invalid import leaves the last report intact.

`scout pr-report show <id>` returns the current source report and human review state, including private reviewer notes, for a follow-up session-side pass.

The active report is `<session>/pr-review.json`. Immutable sources/media live under `review/pr-reports/<digest>/`. Source reports are separate from human `review.json` state; `prProposals` adds independent generated-comment decisions, wording and private reviewer notes using the existing conflict-aware autosave and flush. Existing file verdict and comment shapes stay compatible.

## Human review

All changed files remain reviewable, including those without suggestions. Approve/Reject/Comment in the file footer operate on the file. Proposed comments appear at old/new line ranges; their explicit actions affect only that proposal. Editing wording clears its approval. Comment on suggestion adds a private agent note, excluded from the PR summary. Reproduction and step-linked screenshot/video/test/log evidence appear below the diff, one row per item in step order; Focus steps through it full screen (images in the zoom viewer, videos in the player, logs as text). A scope or preview that cannot place a suggestion shows it separately rather than on a guessed line.

Refreshes preserve human state. Proposal approval is pinned to finding data, evidence hashes, reviewer versions, file fingerprint and base/head. Changed report contents require reapproval; a changed live diff makes the report stale and excludes all generated approvals until refreshed. Invalid/missing media cannot be exported as verified evidence. Existing file fingerprint rules invalidate file verdicts independently.

Submit makes ready-to-copy comments its main Review summary section, with a link to the PR and a file/line-range link plus Copy comment for every approved proposal and added open human comment. There is no large Markdown preview or duplicate Approved comments section. Each copy flushes autosave, checks current report/review/tree revisions, writes a unique immutable snapshot under `review/pr-exports/`, then copies only the selected comment wording. Clipboard failure leaves the visible comment selectable. File decisions and pending counts, approved wording, open human comments, reproduction, limitations and evidence attachment filenames are included. Pending/rejected/stale proposals, reviewer notes and unadded drafts are excluded. Local media is explicitly an attachment to add manually; no image upload is implied.

There are no GitHub writes in export, and the existing send endpoint refuses PR review sessions. Copying does not mark feedback sent to an agent or alter verdicts. Previously exported snapshots remain on disk. Existing GitHub inbound threads and Development/Test run send flows keep their behavior.

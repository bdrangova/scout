# Scout's journal

A human-readable journal of the decisions and implementation choices behind a code-review session's changes, written by the agent (Scout) while it works and topped up by `/scout-development-review`. The reviewer reads it per file, inline on the diff, and as a chronological page; replying to a note creates a normal comment.

Decisions (user, 2026-10-27): written as the agent works (`ai-review journal add`) plus a gap-filling pass at publish; shown as a per-file summary, inline line notes and a Journal page; reply on a note → anchored comment; typed entries.

## Storage

`sessions/<id>/review/journal.json`, agent-owned, written only by the `ai-review journal` CLI (atomic tmp + rename, like `resolutions.json`). The dashboard never writes it.

## schemas/journal.ts

```ts
JOURNAL_ID_RE = /^j[1-9]\d*$/
JournalKind = 'summary' | 'decision' | 'implementation' | 'tradeoff' | 'caveat'
JournalAnchor = LineAnchor & { snippet: string /* trimmed text of the anchor's first line when written, 1..300 chars */ }
JournalAlternative = { option: string, whyNot: string }
JournalEntry = {
  id /* j<n>, never reused */, kind, title /* one line, ≤ 120 */, body /* markdown */,
  file: string | null            // repo path; null = session-level entry (shown only on the Journal page)
  anchor?: JournalAnchor         // only with a file; absent = file-level note
  alternatives?: JournalAlternative[]   // meaningful for decision / tradeoff
  related?: string[]             // other repo paths this entry touches
  createdAt, updatedAt: string | null,
  supersededBy?: string          // id of the entry that replaces this one; superseded entries stay on the Journal page, struck through, and are hidden in the diff
}
Journal = { schemaVersion: 2, sessionId, updatedAt, nextId, entries: JournalEntry[] /* append order = chronological */ }
```

Rules: at most one live (not superseded) `summary` per file — `journal add --kind summary` for a file that has one supersedes it. `summary` never has an anchor.

### Anchor relocation (pure helper, `shared/src/review/journal-anchor.ts`, browser-safe)

Line numbers drift as the agent keeps editing. `relocateJournalAnchor(anchor, filePatch)` → `{ anchor: LineAnchor, stale: false } | { anchor: null, stale: true }`:
1. Use `parsePatchLines(filePatch)`. If the line at `anchor.side/line` exists in the patch and its trimmed text equals `snippet`, keep it.
2. Else find lines on the same side whose trimmed text equals `snippet`; pick the nearest to the old line number; shift `endLine` by the same delta.
3. Else stale: the UI shows the note at file level with a "moved or removed" hint.

## API (server)

- `GET /sessions/:id/journal` → `JournalResponse = { journal: Journal | null }` (raw; relocation happens in the web, which already has each file's patch).
- Watcher: `review/journal.json` change → SSE `journal.updated { sessionId }` (same pattern as `resolutions.updated`). Web invalidates the journal query.
- `SessionSummary` / `SessionDetail` gain `journalCount: number` (live, non-superseded entries) for the nav badge.

## Comment link

`Comment` gains optional `about?: string` (a journal id). The web sets it when the reviewer replies to a note; the target is the note's file with its relocated anchor (or file-level when stale/unanchored; overall when the entry is session-level). The send renderer (`review/sent` markdown) prints, for such a comment, a quoted line `> Re Scout note j3 (decision): <title>` above the body. `/scout-apply-review` uses it: when a reply changes the decision, it records a new journal entry that supersedes the old one.

## CLI

```
ai-review journal add [<id>] [--repo <path>] --kind <kind> --title <text> [--body <md> | --body-file <path>]
                      [--file <repo path>] [--line <n>[-<m>]] [--side new|old] [--alt "<option>::<why not>"]... [--related a,b]
                      [--supersedes <jN>] [--json]
ai-review journal add [<id>] [--repo <path>] --from <file.json>        # array of the same fields, one call for many entries
ai-review journal list [<id>] [--repo <path>] [--file <path>] [--json]
ai-review journal supersede <id> <jN> --by <jM>
```
- Session resolution: explicit `<id>`, else the live session for `--repo` (default cwd) + its current branch (same lookup `ai-review status` uses). If none exists, `add` creates one exactly as `ai-review init --repo <repo>` would with the title = branch name, so the agent can journal before `/scout-development-review` runs.
- `--line` requires `--file`; the CLI reads the snippet itself: for `side new` from the working-tree file, for `old` from `git show <baseSha>:<path>` (merge base). Error if the line is out of range.
- Prints the new ids (or JSON).

## Skills

- New `cli/templates/skills/journal/SKILL.md` (installed to `.claude/skills/journal/` and `.agents/skills/journal/`): when and how to journal. Description triggers on making a non-obvious implementation choice, picking between approaches, working around a constraint, or the user saying "journal this" / `/journal`. Guidance: write for a reviewer who did not see the conversation; say *why*, not *what the diff already shows*; one entry per decision; anchor to the line where the decision is visible; include rejected alternatives; 2–6 sentences; never paste code blocks longer than 5 lines; never secrets. `/journal` with no args = backfill: walk the session's changed files and add a `summary` for each file without one plus entries for decisions made in this conversation that are not logged yet.
- `scout-development-review`: new step after Extras — "Journal": run `ai-review journal list --json`, add a `summary` for every changed file without a live one (skip collapsed/generated files), and log conversation decisions not yet journaled. Refresh mode: only files in the changed set; re-summarise (supersede) a file whose summary no longer matches.
- `scout-apply-review`: when a comment has `about`, after addressing it add an entry that supersedes the referenced note if the decision changed (else an `implementation` entry anchored where the fix landed).
- The repo `CLAUDE.md` snippet installed by `ai-review install` (if any) or the journal skill description is what makes the agent journal during work; no hook.

## Web

- **Per-file summary** — `FileReviewCard`: under the header, a collapsible "Scout's notes" strip (Scout avatar from `components/brand`) showing the file's live `summary` body and a count of other file-level/stale notes ("+2 notes"), expanded by default when present, collapsed state remembered per session in localStorage. Same strip in grid tile tooltips is out of scope.
- **Inline** — anchored live entries become diff annotations next to line comments and PR annotations (`lineAnnotations` with a `journal` metadata kind; new `JournalAnnotation.tsx` styled distinctly from comments: Scout glyph, kind chip, title, collapsible markdown body, alternatives as a small "Considered" list, "Reply" button). Annotations render collapsed to title by default when a file has more than 3.
- **Reply** — opens the existing comment box anchored to the same lines, body empty, a "Replying to Scout · <title>" quote chip; saving creates a comment with `about`.
- **Journal page** — new section `journal` (add to `SECTIONS` between `extras` and `evidence`; nav badge = `journalCount`; hidden when 0). Chronological list grouped by day, filter chips by kind and a file filter; each entry shows kind, title, body, alternatives, file + line link (jumps to the file in the Files section, scrolled to the anchor), and superseded entries struck through with a link to the replacement. Session-level entries appear only here.
- Keyboard: `J` toggles inline notes visibility in the diff (persisted).
- Follow `web/src/DESIGN.md` (retro tokens, light + dark).

## Out of scope

Editing notes from the dashboard; notes on test runs / PR-review sessions (code-review sessions only); grid tile summaries.

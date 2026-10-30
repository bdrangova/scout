---
name: journal
description: Write Scout's journal, the notes a reviewer reads next to the diff to learn why the code is the way it is. Use while you work whenever you make a non-obvious implementation choice, pick between approaches, work around a constraint, or accept a tradeoff, and when the user says "journal this" or runs /journal. With no arguments, /journal backfills the journal for the current branch.
argument-hint: "[what to journal, e.g. 'why the cache is keyed by tenant'] [--session <id>]"
allowed-tools: Bash(ai-review *) Bash(git diff *) Bash(git status *) Read Glob
---
# Journal

Arguments: $ARGUMENTS

Journal entries are for a reviewer who did not see this conversation. They appear on the diff next to the code, per file and on a Journal page, and the reviewer can reply to one, which becomes a normal comment. Entries live in the session folder only; nothing in the repository changes.

## When to journal
- Right after a non-obvious choice: you picked one approach over another, worked around a constraint (API, library, data, performance), accepted a tradeoff, or left a known gap on purpose.
- When the user says "journal this" or gives `/journal <text>`.
- Do not journal what the diff already says (renames, obvious wiring, formatting) or every edit. A good session has a handful of entries, not one per file.

## How to write
Load `/write-for-reviewers` (Skill tool) before writing and follow it.
- Say why, not what. The reviewer sees what changed; they need the reason, the constraint behind it and what you rejected.
- Write it for a person, not a compiler. Describe what the code does for users or data and why, in plain words. "Each customer gets its own saved settings, so one customer's changes never show up for another" beats "cache keyed by tenantId to avoid cross-tenant Map collisions".
- Title and first sentences carry no code: no function, variable, prop, type or class names, no jargon without a plain explanation. Filenames are fine when they help locate things.
- One entry per decision. Two decisions are two entries.
- 2 to 6 sentences in the plain part.
- Some things are only true in technical terms and the reviewer needs them exactly (a race condition, an API limit, an ordering rule, a query that must stay as it is). Do not blur these. Put them after the plain part, in a last paragraph that starts with `**Technical detail:**`, so the reader sees it is the technical part and can skip or study it. Names of code are fine there. At most 5 lines of code, never a longer block. Most entries need no technical detail.
- Never put secrets, tokens, customer data or internal URLs in an entry.
- Anchor the entry to the line where the decision is visible (`--file` + `--line`). A note about the whole file has `--file` only; a note about the whole change has neither.
- List rejected alternatives with `--alt "option::why not"` (repeat it). This is what reviewers value most for `decision` and `tradeoff`.

Kinds: `decision` (chose A over B), `implementation` (how something non-obvious works), `tradeoff` (what was given up and why), `caveat` (known limit, follow-up, risk), `summary` (what this file's change is, one per file).

## Add an entry
```
ai-review journal add --kind decision --title "Each customer keeps its own saved settings" \
  --body "Customers can set different defaults, and a shared copy showed one customer's choices to another. …

**Technical detail:** the cache key is the tenant id, so …" --file src/cache.ts --line 42 \
  --alt "one shared copy for everyone::one customer's settings leak into another's" [--related src/tenant.ts] [--supersedes j3]
```
- It finds this branch's review session, or creates it, so you can journal before `/publish-review`. Pass `--repo <path>` outside the repo and a session id as the first argument to target one.
- `--line` takes `42` or `42-48`; `--side old` anchors to the base version of the file. The line must exist.
- Many at once: write a JSON array of `{ kind, title, body, file, line, side, alt, related, supersedes }` and run `ai-review journal add --from <file>`.
- A `summary` for a file that already has one replaces it.
- To replace an entry whose decision changed: add the new one with `--supersedes jN`, or `ai-review journal supersede <id> jN --by jM`. Never edit the file by hand.
- `ai-review journal list [--file <path>] [--json]` shows what is there; check it before adding, so you do not repeat an entry.

## `/journal` with no arguments: backfill
1. `ai-review journal list --json` for what exists.
2. `git status --short` and `git diff --stat $(git merge-base <base> HEAD)` (base from `ai-review status`) for the changed files.
3. Add a `summary` (title: the file's job in this change; body: 2 to 4 sentences) for each changed file without a live one. Skip lockfiles, generated and collapsed files.
4. Add entries for decisions from this conversation that are not logged yet, anchored where visible. Read the code (Read, Glob) to find the right line.
5. Report the ids added and the session id.

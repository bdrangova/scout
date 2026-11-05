---
name: pr-description
description: Write or update the PR description of a Scout session (pr-description.md in the session folder), following the repository's PR template when it has one. Called by scout-development-review and scout-apply-review; also use it when the user runs /pr-description or asks to update the PR description.
argument-hint: "[--session <id>] [--refresh]"
allowed-tools: Bash(scout status *) Bash(scout path *) Bash(scout publish-log *) Bash(git diff *) Bash(git log *) Bash(git status *) Read Write Edit Glob Skill
---
# PR description

Arguments: $ARGUMENTS

## Rules
- The file is `<session dir>/pr-description.md` (`scout path <id>`; without `--session`, `scout status --repo "$PWD"` finds this branch's session). Write nothing else, never into the repository.
- `/scout-apply-review` opens the PR from this same file, and the user may have edited it: never throw their wording away.
- Load `/write-for-reviewers` (Skill tool) before writing and follow it.

## Steps
1. **Template.** Look for the repo's PR template with Glob/Read: `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/pull_request_template.md`, `pull_request_template.md`, or a `.github/PULL_REQUEST_TEMPLATE/` folder (several templates: pick the default or most general one and say which).
2. **Write** (no file yet, or not `--refresh`). With a template, follow it as closely as possible: same headings, order, wording and checkbox style, each section filled from the change. A section you cannot fill keeps the template's own placeholder wording or a short "N/A". Add sections the template has no place for (Not captured, test notes) only at the end. Without a template write: Summary, What changed (by area), How to test, Risks/follow-ups, Not captured. Read the change with `git diff` against the session base and the session's evidence and journal.
3. **Refresh** (`--refresh`, or the file exists and the caller says only part of the change moved). Edit the file in place with Edit and touch only the sections the changed files affect (what changed, how to test, risks, not captured). Keep the other sections word for word, including the user's edits.
4. **Report** one line: written or updated, the template used (or none), and the sections changed.

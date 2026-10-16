---
name: apply-review
description: Apply reviewer feedback from the review-dash dashboard (rejected files, file, evidence, spec, extra and overall comments) by changing the working tree and recording a resolution for every comment. Use when the user says "apply the review", "address the review feedback", runs /apply-review, or when a hook reports open review comments for this repo.
argument-hint: "<sessionId>"
allowed-tools: Bash(ai-review *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git rev-parse *) Bash(git add *) Bash(git commit *) Bash(git push *) Bash(gh pr create *) Bash(gh pr view *) Bash(npm test*) Bash(npm run *) Bash(npx vitest *) Bash(npx prettier *) Bash(npx eslint *) Bash(npx oxlint *) Read Edit Write Grep Glob
---
# Apply review feedback: $ARGUMENTS

## Feedback to address
!`ai-review feedback $ARGUMENTS --format markdown`

## Session
!`ai-review status $ARGUMENTS --format brief`

## Rules
- Every comment id (`c<n>`) in the feedback needs a response. Never silently skip one.
- Never commit or stage, except in the PR step below. Do not touch files outside the reviewed change unless a comment requires it.
- The dashboard reads the working tree live: a file you change shows as updated the moment you save it, and the reviewer sees your resolutions as you record them. There is nothing to publish or resend.
- Keep notes concrete: what you changed, where, and how you verified it.
- If `AI_REVIEW_HEADLESS=1` is set, never wait for user input; when a comment is ambiguous, reply with `--status open` and a specific question instead of guessing.

## Steps
1. Read the feedback top to bottom and build a checklist of comment ids: the overall comments, each rejected file, each file comment, each evidence comment (with its timestamp), each spec comment and each extra comment. A line comment reads `- [c<n>] path:LINE > …` (`path:START-END` for a range; `(old)` means the line number is on the before side of the diff) and is followed by a fenced excerpt of the diff lines around it, so you can see the code it is about; the full line numbers are those of the file at review time. The exact diff the reviewer looked at is the `.patch` named in the feedback header (relative to `ai-review path <sessionId>`).
2. For each comment, open the file(s) it concerns and make the change, or work out why it should not change. A rejected file's comment is the required change. For evidence comments, fix the behaviour and re-capture the screenshot or recording into `ai-review path <sessionId> evidence` (keep the file name so the caption still applies). For overall comments, apply the cross-cutting change everywhere it applies.
3. Run the repository's tests and linters for what you touched (for example `npx vitest run <paths>`, `npx prettier --check`, `npx eslint <paths>`). Fix the failures you introduced.
4. Record a resolution for every comment, one line each:
   `ai-review resolve <sessionId> --comment c<n> --status resolved --note "<what changed, where, how verified>" --files <path,path>`
   For a line comment, cite the line in the note (`path:LINE`, as the feedback names it, plus the new line number if it moved).
   To reply without resolving (a question, a won't-fix with reasons) use `--status open --note "…"`.
   Alternatively write a JSON array `[{ "comment": "c1", "status": "resolved", "note": "…", "files": ["…"] }, …]` and run `ai-review resolve <sessionId> --from <file>`.
5. PR step, only when the feedback header says `Decision: **APPROVE**` and every comment is now resolved. If any comment stays open, do not open a PR and say why. Other decisions never commit, push or open a PR.
   - `git status`: if the reviewed changes are uncommitted, stage only the files of the session tree (never `git add -A`) and commit with a concise message in the repo's convention (see `git log`). Never `--no-verify`, amend or force-push; let pre-commit and review gates run and fix what they report, or stop and report.
   - Push the current branch if it has no upstream or is ahead: `git push -u origin <branch>`, never force.
   - If `gh pr view` shows a PR for the branch, report its URL. Otherwise `gh pr create --base <session base branch, without the origin/ prefix> --head <branch> --title "<ticket key> <manifest title>" --body-file "$(ai-review path <sessionId>)/pr-description.md"` if that file exists; without one, write a short body from the commits.
   - If `gh` is missing or not authenticated, or the push is rejected: stop and report exactly what failed and the commands to run. Do not work around it.
6. Finish with a table of comment id · status · note, the PR URL when one was opened or found, then the dashboard URL from the session line above.

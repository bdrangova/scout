---
name: open-pr
description: Commit a Scout session's reviewed files, push the branch and open (or find) its GitHub pull request with the session's PR description. Called by scout-apply-review when a review is approved; also use it when the user runs /open-pr.
argument-hint: "--session <id> [--commit-only|--no-pr]"
allowed-tools: Bash(scout status *) Bash(scout path *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git rev-parse *) Bash(git add *) Bash(git commit *) Bash(git push *) Bash(gh pr create *) Bash(gh pr view *) Read
---
# Open the PR

Arguments: $ARGUMENTS

## Rules
- Stage only the files of the session's change, never `git add -A`.
- Never `--no-verify`, amend or force-push. Let pre-commit and review gates run; fix what they report, or stop and report.
- If `gh` is missing or not authenticated, or the push is rejected: stop and report exactly what failed and the commands the user can run. Do not work around it.
- `--commit-only` stops after the commit; `--no-pr` stops after the push.

## Steps
1. **Commit.** `git status`: if the session's changes are uncommitted, stage those files and commit with a concise message in the repo's convention (see `git log`).
2. **Push** the current branch if it has no upstream or is ahead: `git push -u origin <branch>`, never force.
3. **PR.** If `gh pr view` shows a PR for the branch, report its URL. Otherwise `gh pr create --base <session base branch, without the origin/ prefix> --head <branch> --title "<ticket key> <session title>" --body-file "$(scout path <id>)/pr-description.md"` when that file exists; without one, write a short body from the commits.
4. **Report** the commit, the push and the PR URL, or what stopped it.

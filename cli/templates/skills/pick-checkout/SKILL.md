---
name: pick-checkout
description: Decide where a review or a test runs - a new worktree of the branch, or this checkout as it is - and create the worktree through the repository's own worktree skill when there is one. Loaded by scout-pr-review and scout-feature-test before any other work; also use it when the user runs /pick-checkout.
argument-hint: "<branch to work on> [--why <what will run there>] [--auto]"
---
# Pick the checkout

Arguments: $ARGUMENTS

## Rules
- Never reset, stash or clean the user's work to make a checkout usable.
- Never make an ad-hoc clone or a temporary copy, and never use `EnterWorktree` or the desktop app's own worktree feature: Scout lists worktrees from the folders the user set, and links sessions to them.
- With `--auto` or `AI_REVIEW_HEADLESS=1`, don't ask: use this checkout when it qualifies (step 1), otherwise create the worktree.

## Steps
1. **Does this checkout qualify?** It does when it is on the branch to work on, has no uncommitted changes (`git status --short`), and its app is not busy with other work (`ai-review app-status --json` when the caller needs the app).
2. **Ask** (AskUserQuestion), naming the branch:
   - **New worktree**: recommended when this checkout does not qualify. A worktree of the branch with its own ports, app and data.
   - **This checkout**: only offered when it qualifies.
3. **New worktree.** `ai-review env` names the repository's own worktree skill under `skills.worktree` when a registered pack provides one. Then load it (Skill tool) and follow its rules: its flow for an existing branch when the branch exists, for new work otherwise, then its app and data steps when the caller needs them. Without one, ask the user for the parent folder (suggest one of Scout's worktree folders) and run `git worktree add <folder>/<branch-name> <branch>`.
4. **Report** last, one line: `Checkout: <absolute path> (this checkout|new worktree)`. The caller works on that path. When the caller says the work must run from the worktree's own session (its ports and app belong to it), tell the user to open a new Claude Code session with that folder as its working directory and run the caller's command there, then stop.

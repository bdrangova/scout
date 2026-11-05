---
name: qbd-worktree
description: Start, list or remove my qbdvision worktrees end to end — new work or an existing branch, right Node, my one dev stack, app up, seeded data, and the Scout session. Use when I ask to "start a worktree", "work on QI-xxx in a worktree", "check out <branch> in a worktree", "list my worktrees" or "remove the worktree for <branch>".
---

# qbd-worktree

My layer over the repo's `run-qbd` skill. It adds what run-qbd doesn't know about my setup:

- Node from `.nvmrc` on every step (the `wt` background bootstrap uses the nvm default).
- One dev stack: every worktree points at `dev<envprefix>`, not `dev<slot>` (only `devbojana` exists).
- Existing branches (`checkout`), not just new ones.
- Scout: session on demand, archived before the worktree is removed.

```bash
QWT="$(git rev-parse --path-format=absolute --git-common-dir | xargs dirname)/.claude/skills/qbd-worktree/scripts/qbd_worktree.sh"
```

Every command prints `[qbd-wt]` / `[run-qbd]` lines; relay them. Exit 2 = ask me the question on the last line; exit 3 = give me the command on the last line and wait. Run long steps (`onestack`, `up`, `seed`) in the background and post new lines every 20–30 s.

Never use the Claude desktop app's own worktree feature or `EnterWorktree` to create one — only these commands (`wt` underneath).

## Start

1. Pick the worktree:
   - New work: `bash "$QWT" new <ticket or words>` (branch name comes from `wt new`; confirm it with me if `wt` asks).
   - Existing branch (local or `origin/`): `bash "$QWT" checkout <branch>`.
   Done when it prints `WORKTREE=<path>`.
2. `bash "$QWT" onestack <path>` — waits for the background bootstrap, repoints to my dev stack, reruns install/db/cognito/build on the right Node. Stops on the first failing step with its log.
   It also writes the worktree's Playwright `.env` (`playwright-env`), so `npx playwright test` in `src/test/playwright` hits this worktree. Gradle's `testPlaywright` doesn't need it.
3. `bash "$QWT" up <path>` — starts the dev servers; show me the `QbDVision runs in` block.
4. Data: unless I named it, ask golden (Rockets R US, recommended, ~3 min) / one feature's seed scenario / none. Then `bash "$QWT" seed <path> golden` or `seed <path> feature <feature> [scenario]`. Never seed any other way (MySQL and cognito-local users must match).
5. Scout: only if I ask, or I'm about to review here. `bash "$QWT" scout <path>`. `/scout-development-review` opens it by itself anyway.
6. Tell me how to work in it: open a new Claude Code session with the worktree folder as its working directory. Memory and `.claude` are shared with the main checkout.

Ports, DB and cognito container for any checkout: `ai-review env` (or `bash .claude/skills/_shared/checkout_runtime.sh` from inside it). Never assume 8080/3000/3306/9230.

## List

`bash "$QWT" list` — each worktree with branch, path, web/api/MySQL ports and Scout session.

## Remove

Confirm the branch with me first. Then `bash "$QWT" remove <branch>`: archives its Scout session (undo printed), then plain `wt remove <branch>`, which refuses a dirty worktree and keeps an unmerged branch. Never add `--force` or `-D`. Scout checkpoints and the plans folder stay on disk.

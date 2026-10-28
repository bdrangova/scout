---
name: run-app
description: Make sure this checkout's app is running so a reproduction, a fix or evidence can be checked against it. Reuses a dev server that already serves this checkout, otherwise asks before starting one (stopping the servers that hold its ports), and decides how the check is recorded (Playwright video, screenshots or none). Called by the review skills (apply-review, apply-test-review, address-pr-comments, publish-review, publish-pr-review) whenever a check needs the running app; also use it when the user runs /run-app.
argument-hint: "[what needs checking] [--record video|screenshots|none] [--auto]"
allowed-tools: Bash(ai-review env*) Bash(lsof *) Bash(ps *) Bash(git rev-parse *) Bash(git worktree list*) Read Glob Grep AskUserQuestion
---
# Run the app

Arguments: $ARGUMENTS

## Rules
- "The dev server was not running" is never a reason to skip a reproduction or a check. This skill exists so the caller never has to.
- Never stop a process without the user's yes in this run. Starting and stopping servers goes through the normal permission prompts.
- With `--auto` in the arguments or `AI_REVIEW_HEADLESS=1` set, never wait for input: start only on free ports and never stop another process.
- Leave the server running when you finish; the caller and the user keep using it.
- Never stop a process that serves another checkout of the same repository (the main worktree or another linked worktree, see `git worktree list`), even with a yes: that is someone's running app. Its port is simply taken.
- Never assume a port. Ports come from the checkout runtime (step 1) or, without one, from the project's own files; say which.
- Every reproduction or check against the app is recorded (see "Recording"), so the reviewer sees it instead of taking it on trust.

## Steps
1. **Checkout facts.** Run `ai-review env` (JSON). It says whether this is a linked worktree (`linkedWorktree`, `mainCheckout`) and, when the repository has a runtime command, this checkout's `runtime`: `apps` (name, url, port), `start` (the command that brings it up), `databases`, `services`.
   - `runtime` present: take the URLs, ports and start command from it and nothing else.
   - `runtimeError`: report it in one line and fall back to the next point.
   - No runtime: find how to start it in this order: `.claude/launch.json` (each configuration's command, args and port), the `dev`/`start` scripts of `package.json` (and the workspace ones), then the README, `Makefile`, `docker-compose.yml`. Note every port and the URL to open. In a linked worktree these files are often shared with the main worktree, so their ports may belong to it: say so in the report, and tell the user once that `ai-review env --set-runtime` removes the guess.
   Several apps: pick the one the caller's check is about.
2. **Already up?** For each port: `lsof -nP -iTCP:<port> -sTCP:LISTEN`. For a listener, find its working directory (`lsof -a -p <pid> -d cwd -Fn`) and command (`ps -o command= -p <pid>`).
   - It serves this checkout (its cwd is inside `git rev-parse --show-toplevel`) and the URL answers (`curl -sS -o /dev/null -w '%{http_code}' <url>`): reuse it, go to step 5.
   - It is another checkout or another app: it does not count, the port is taken. With a runtime, a port taken by another checkout means the two collide: report it, never stop it.
3. **Ask.** Skip with `--auto`/`AI_REVIEW_HEADLESS=1`. Otherwise ask once with AskUserQuestion: "Start the dev server for <checkout>?" naming each process you would stop (pid, command, cwd; only processes allowed by the rules). When the recording mode is unsure (step 5), ask it in the same AskUserQuestion call. Options: "Start it, stop those (Recommended)", "Start on other ports" (only when the project takes a port setting), "Don't start". Headless: use free ports if the project takes a port setting, otherwise stop here with "not started".
4. **Start.** Stop the agreed processes (`kill <pid>`, then `kill -9` only if it is still listening after a few seconds). Use `runtime.start` when there is one (from the checkout, in the background). Otherwise, in the Claude desktop app, prefer its preview tool with the `.claude/launch.json` name (only when its port is this checkout's); otherwise run the command in the background. Wait until the URL answers (up to about 2 minutes, reading the server output for errors). On a failure, read the error, fix what is clearly setup (missing install, wrong port flag) after asking, and retry once.
5. **Recording mode.** `--record` in the arguments wins. Otherwise use judgement: `video` for a flow, an interaction, timing or an animation; `screenshots` for a state or a layout (before and after when it is a fix); `none` only for a non-visual check (API, data, logs), where the caller attaches the command output instead. When unsure and not headless, ask (with step 3's question when you ask one, else on its own); headless, take the judgement.
6. **Report** to the caller in two lines, last in your answer:
   `App: <url> (reused|started[, stopped <pid> <command>]; ports from runtime|guessed; <checkout>)` or `App: not running: <reason>`
   `Record: video|screenshots|none (<why>)`
   On "not running", the caller records the check as not done (with the reason) and never as passed.

## Recording (for the caller)
- Screenshots: `mcp__playwright__browser_take_screenshot` with an absolute `filename`. Video: a Playwright Test spec with `use: { video: 'on', screenshot: 'on' }` and `outputDir` set to the target folder (`npx playwright test <spec>`), or the Playwright MCP recording tools when they are available.
- Save into the folder the calling skill names (a session's `ai-review path <id> evidence` by default) with descriptive names (`trial-bar-admin-before.png`), add an entry with a `caption` and `description` to that folder's `index.json` when it has one, and cite the files in the note or report.

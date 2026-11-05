---
name: run-app
description: Make sure this checkout's app is running so a reproduction, a fix or evidence can be checked against it. Reuses a dev server that already serves this checkout, otherwise asks before starting one (stopping the servers that hold its ports), and decides how the check is recorded (Playwright video, screenshots or none). Called by the review skills (scout-apply-review, scout-apply-test-review, scout-pr-comments, scout-development-review, scout-pr-review) whenever a check needs the running app; also use it when the user runs /run-app.
argument-hint: "[what needs checking] [--record video|screenshots|none] [--auto]"
allowed-tools: Bash(scout env*) Bash(scout app-status*) Bash(lsof *) Bash(ps *) Bash(curl *) Bash(kill *) Bash(git rev-parse *) Bash(git worktree list*) Read Glob Grep AskUserQuestion
---
# Run the app

Arguments: $ARGUMENTS

## Rules
- "The dev server was not running" is never a reason to skip a reproduction or a check. This skill exists so the caller never has to.
- Never stop a process without the user's yes in this run. Starting and stopping servers goes through the normal permission prompts.
- With `--auto` in the arguments or `SCOUT_HEADLESS=1` set, never wait for input: start only on free ports and never stop another process.
- Leave the server running when you finish; the caller and the user keep using it.
- Never stop a process that serves another checkout of the same repository (the main worktree or another linked worktree, see `git worktree list`), even with a yes: that is someone's running app. Its port is simply taken.
- Never assume a port. Ports come from the checkout runtime (step 1) or, without one, from the project's own files; say which.
- Every reproduction or check against the app is recorded (see "Recording"), so the reviewer sees it instead of taking it on trust.

## Steps
1. **Ports and listeners.** Run `scout app-status --json`. It takes the ports from the checkout runtime (`scout env`), else `.claude/launch.json`, and for each port reports who listens (pid, command, cwd), whether that is this checkout or another worktree, and whether the URL answers. It also gives the start command when it knows one.
   - `source: null` (no runtime, no launch.json): find the ports and start command in the `dev`/`start` scripts of `package.json` (and the workspace ones), then the README, `Makefile`, `docker-compose.yml`, and rerun with `--port <n>` for each. In a linked worktree (`scout env`: `linkedWorktree`) these files are often shared with the main worktree, so the ports may be its: say so, and tell the user once that `scout env --set-runtime` removes the guess.
   - `scout env` reports a `runtimeError`: report it in one line and continue as above.
   Several apps: pick the one the caller's check is about.
2. **Already up?** A listener with `thisCheckout: true` and an answering URL is reused: go to step 5. A listener from another worktree (`otherWorktree`) or another program means the port is taken; with a runtime that is a collision to report, never something to stop.
3. **Ask.** Skip with `--auto`/`SCOUT_HEADLESS=1`. Otherwise ask once with AskUserQuestion: "Start the dev server for <checkout>?" naming each process you would stop (pid, command, cwd; only processes allowed by the rules). When the recording mode is unsure (step 5), ask it in the same AskUserQuestion call. Options: "Start it, stop those (Recommended)", "Start on other ports" (only when the project takes a port setting), "Don't start". Headless: use free ports if the project takes a port setting, otherwise stop here with "not started".
4. **Start.** Stop the agreed processes (`kill <pid>`, then `kill -9` only if it is still listening after a few seconds). Use `runtime.start` when there is one (from the checkout, in the background). Otherwise, in the Claude desktop app, prefer its preview tool with the `.claude/launch.json` name (only when its port is this checkout's); otherwise run the command in the background. Wait until the URL answers (up to about 2 minutes, reading the server output for errors). On a failure, read the error, fix what is clearly setup (missing install, wrong port flag) after asking, and retry once.
5. **Recording mode.** `--record` in the arguments wins. Otherwise use judgement: `video` for a flow, an interaction, timing or an animation; `screenshots` for a state or a layout (before and after when it is a fix); `none` only for a non-visual check (API, data, logs), where the caller attaches the command output instead. When unsure and not headless, ask (with step 3's question when you ask one, else on its own); headless, take the judgement.
6. **Report** to the caller in two lines, last in your answer:
   `App: <url> (reused|started[, stopped <pid> <command>]; ports from runtime|guessed; <checkout>)` or `App: not running: <reason>`
   `Record: video|screenshots|none (<why>)`
   On "not running", the caller records the check as not done (with the reason) and never as passed.

## Recording (for the caller)
- Screenshots: `mcp__playwright__browser_take_screenshot` with an absolute `filename`. Video: a Playwright Test spec with `use: { video: 'on', screenshot: 'on' }` and `outputDir` set to the target folder (`npx playwright test <spec>`), or the Playwright MCP recording tools as `/browser-recording` describes (browser size, one video per check, verified file, MP4 at the end). Highlights and screenshot marking follow `/verdict-highlights`.
- Save where the calling skill says, with descriptive names (`trial-bar-admin-before.png`). For a session that is `scout artifact add <id> evidence <file> --caption … --description …` (it copies the file and its index entry). Cite the files in the note or report.

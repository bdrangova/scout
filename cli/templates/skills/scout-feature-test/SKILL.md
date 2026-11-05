---
name: scout-feature-test
description: Test a feature in the browser end to end and publish the run to the Scout dashboard (/t/<id>) - picks the checkout, opens a test-run session (the run lives in Scout's session folder), brings in the test plan, prepares and checkpoints the data, runs every test step and edge case as its own recorded scenario with verdict-coloured evidence, converts the videos and publishes plan, data setup and results. Use when the user runs /scout-feature-test, asks to test a feature in the browser, or scout-apply-test-review needs a scenario re-run.
argument-hint: "<feature or topics to test> [--plan <test-plan.md>] [--session <id>] [--only S3,S5] [--record video|screenshots] [--auto]"
allowed-tools: Bash(scout *) Bash(git status *) Bash(git rev-parse *) Bash(git worktree *) Bash(ls *) Bash(npx playwright *) Read Write Edit Glob Grep Skill AskUserQuestion mcp__playwright__*
---
# Feature test

Arguments: $ARGUMENTS

Every test step and every edge case is a **scenario** that is run, checked and recorded while it happens: approach, action and result on screen, on video and in screenshots. A step is not done until its outcome was on screen in the recording and in a screenshot. A run with a missing or broken video is a failed run: fix the recording and run the scenario again.

The run lives in the Scout session (`scout path <id> run`), never in the repository:
```
run/
  test-run.json         Scout's index (written only by the publish skills)
  steps.md              scenario index, data-setup notes, one section per scenario, summary
  plan/test-plan.md     copy of the test plan
  bugs/<slug>/          bugs found or referenced
  logs/                 state dumps, flag state, notes
  data-setup/{videos,screenshots}/
  scenarios/s<N>-<slug>/{videos,screenshots}/
```

## Rules
- Load `/review-choices` (Skill tool) for step 0 and auto mode.
- Never commit, stage or change application code. Write only into the run folder and your scratch folder.
- Report what happened, never more: a scenario you could not run is blocked, an unclear outcome is uncertain.
- Never invent or log a password; the repository's test-data skill says where credentials come from.

## Steps
0. **Choices** (`/review-choices`). Work out first: the scenarios (from the plan, else from the request: one per test step and per edge case), the plan file, the data you need and its setup key, the recording mode, whether to publish. The preview lists them; on "Let me choose" ask about the plan file, scenarios to leave out and the data.
1. **Checkout.** `/pick-checkout <branch to test> --why "feature test"`. A new worktree must run from its own session: `/pick-checkout` tells the user to open one there and run `/scout-feature-test` again, and you stop.
2. **App.** `/run-app` (with `--record` when given). Not running: stop and say why.
3. **Session.** New run: `scout init --kind test-run --repo "$(git rev-parse --show-toplevel)" --title "<feature: short title>" --agent-session "${CLAUDE_SESSION_ID}" --format json` (add `--feature`/`--area` when the plan's folder names them). With `--session <id>` (a re-run), reuse that run instead. Note `id`, `url` (the dashboard is `/t/<id>`) and the run folder.
4. **Plan.** The plan is `--plan`, the plan you worked from in this conversation, or a `test-plan.md` the user names. Copy it in with `scout run-file add <id> plan <file>`. Without one, write a short `test-plan.md` in your scratch folder from the request (Summary, then a scenario table: id, title, steps with action and expected) and add that. Then `/scout-test-plan <id>` so the dashboard shows the scenarios as planned. Start `steps.md` with a "Scenario index" table: id · title · result (filled in as you go).
5. **Recording check.** `/browser-recording`: browser size, encoder and a test recording, before any test work.
6. **Data.** `/prepare-test-data --session <id> [--setup-key <key>]`. Then `/scout-data-setup <id>`.
7. **Scenarios.** For each scenario (only `--only` ones on a re-run), `/run-scenario --session <id> S<N> <title> --checks "<what to verify>" --restore <checkpoint key>`. Update the scenario index row after each one. A failed scenario does not stop the run.
8. **Bugs.** For each failure that is a bug, write `<run>/bugs/<slug>/<slug>.md` (title, steps to reproduce, expected, actual, the scenario id, the evidence paths) following `/write-for-reviewers`. A bug folder that already exists in the repository and that this run confirms: `scout run-file add <id> bug <folder>`.
9. **Wrap-up.**
   - `scout video check <run>/scenarios <run>/data-setup` and fix or re-run any scenario whose video is missing.
   - `scout video mp4 <run>`; report a video that could not convert.
   - Finish `steps.md`: feature tested, date, test-data summary, the filled scenario index (🟢/🔴/🔵), bugs with steps to reproduce, and what could not be provisioned or checked.
10. **Publish.** `/scout-test-run <id>`.
11. **Report** the dashboard URL `/t/<id>`, every scenario as 🟢, 🔴 or 🔵 with the reason for each 🔴 and 🔵, the bugs, and anything you could not check.

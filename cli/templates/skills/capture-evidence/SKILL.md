---
name: capture-evidence
description: Capture screenshots or a video of a user-visible change from the running app and add them to a Scout session as evidence with a caption and description, noting which repository files each capture covers. Called by scout-development-review and scout-apply-review; also use it when the user runs /capture-evidence. For reproducing a reported problem use /reproduce instead.
argument-hint: "<what to capture> --session <id> [--as <existing name>] [--record video|screenshots]"
allowed-tools: Bash(scout artifact *) Bash(scout path *) Bash(npx playwright *) Read Write Glob Skill mcp__playwright__*
---
# Capture evidence

Arguments: $ARGUMENTS

## Rules
- Start the app with `/run-app` (Skill tool) and record as its `Record:` line says. Never skip a capture because the dev server was not running.
- Capture into your scratch folder, never into the repository. Add files only with `scout artifact add|remove`, never by hand.
- Captions and descriptions follow `/write-for-reviewers`. Load `/verdict-highlights` (Skill tool) and, for video, `/browser-recording`, and follow them.

## Steps
1. **Capture.** Screenshots with `mcp__playwright__browser_take_screenshot` (absolute `filename`), or a Playwright Test spec with `use: { screenshot: 'on', video: 'on' }` and `outputDir` set to the scratch folder (`npx playwright test <spec>`). Name files descriptively (`trial-bar-admin.png`).
2. **Add.** `scout artifact add <id> evidence <file> --caption "<one sentence>" --description "<two or three sentences: what is shown, which state, what to look at>" --order <n>`. To replace a capture, pass `--as <its current name>`: the same name keeps the reviewer's comments attached; update the caption and description when they no longer match. Remove one with `scout artifact remove <id> evidence <name>`.
3. **Coverage.** For each capture, note the repository files it covers (the components, pages, styles and data behind what it shows) and return them as `{ "<evidence name>": ["<repo path>", …] }`, so the caller can log them.
4. **Report** the files added, replaced or removed and anything you could not capture, with the reason.

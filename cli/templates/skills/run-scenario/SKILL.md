---
name: run-scenario
description: Run one feature-test scenario in the browser and record it end to end - its own folder, video and screenshots, the action and the check on camera, a verdict (pass, fail, uncertain), its entry in steps.md, and a one-line message to the user straight away. Called by scout-feature-test for every test step and edge case.
argument-hint: "--session <id> S<N> <title> --checks <what to verify> [--restore <checkpoint key>]"
user-invocable: false
---
# Run one scenario

Arguments: $ARGUMENTS

Load `/browser-recording` and `/verdict-highlights` (Skill tool) first and follow them. The run folder is `$(ai-review path <id> run)`; this scenario's folder is `<run>/scenarios/s<N>-<slug>/` with `videos/` and `screenshots/` (create them first).

## Rules
- One assertion per scenario. A failed or impossible scenario is still a scenario: record the attempt, screenshot the failure, mark it.
- Verify with `browser_snapshot` between actions; never assume a click or a navigation worked. Retry a decisive action once if it did not take.
- Never write down a step you did not perform in the browser.
- Use uncertain, not pass, when the outcome is ambiguous; never round it up.
- Use the repository's own test notes when it has them (for qbdvision, `qbd-test-data`: pop-ups to dismiss after each sign-in, how to act on canvas diagrams).

## Steps
1. **Start clean.** `--restore <key>`: `/snapshot-db restore <key> --session <id>` when the scenario changes data. Then resize and navigate to the app.
2. **Record.** Start the video `<scenario>/videos/test-<N>-<slug>-1.webm` with chapter `S<N>: <title>` and what is checked as its description.
3. **Approach on camera**: open, expand and scroll so the starting state is visible.
4. **Act**, one browser action at a time, each target highlighted in amber first.
5. **Context shot** when the action is set up: `screenshots/s<N>-NN-a-context.png`.
6. **Trigger and check on camera.** Do the decisive action, `browser_snapshot`, confirm the outcome while it is on screen. Highlight every checked element in its verdict colour, one after another.
7. **Result shot** with the highlights: `screenshots/s<N>-NN-b-result.png`. Extra meaningful states get `s<N>-NN-c-<label>.png`. When the proof is only outside the UI (database state), capture the closest UI evidence and write the database result into `steps.md`.
8. **Write it down now**, never batched at the end: append to `<run>/steps.md`:
   ```markdown
   ## S<N>: <short title>
   - **Action:** <what you did, in the app's words>
   - **Expected:** <what should happen>
   - **Observed:** <what happened>
   - **Result:** 🟢 PASS | 🔴 FAIL (<what went wrong>) | 🔵 UNCERTAIN (<what is unclear, who should decide>)
   - **Video:** scenarios/s<N>-<slug>/videos/test-<N>-<slug>-1.mp4
   - **Screenshots:** scenarios/s<N>-<slug>/screenshots/
   ```
9. **Close.** Final chapter card `🟢 S<N> PASS`, `🔴 S<N> FAIL: <why>` or `🔵 S<N> UNCERTAIN: <what>`, stop and check the video.
10. **Tell the user now**, one short message before the next scenario: `🟢 S<N> <title> — passed`, `🔴 S<N> <title> — failed: <expected vs observed, likely cause>` or `🔵 S<N> <title> — uncertain: <what is unclear>`, plus the scenario folder.

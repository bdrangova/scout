---
name: browser-recording
description: Record browser work with the Playwright MCP so a reviewer can watch it - check recording works before the real run, set the browser size, record one video per scenario with on-screen action callouts and chapter cards, verify each file, and convert the videos to MP4 at the end. Loaded by run-scenario, scout-feature-test, reproduce and capture-evidence whenever they record video.
user-invocable: false
---
# Recording the browser

## Before the first recording (every run)
1. **Browser size.** `browser_resize` to `1920x1200` and check `window.innerWidth` is 1920. Do it again after any restart or new tab. The video size must equal this.
2. **Encoder.** `npx playwright install ffmpeg`.
3. **Test recording.** `browser_start_video` to a throwaway file in your scratch folder, one trivial action (`browser_navigate` to the app), `browser_stop_video`, then `ai-review video check <file>`. It must pass. If `browser_start_video` does not exist, the Playwright MCP runs without the `devtools` capability: tell the user to restart it with `--caps=devtools` (`ai-review install` registers it that way). Do not start real work with broken recording. Delete the test file.

## One recording
1. `browser_start_video` with an absolute `filename` where the caller says, and `size: { width: 1920, height: 1200 }` (without it the video is downscaled and blurry).
2. `browser_video_show_actions` (`cursor: "pointer"`): a callout names each action, so the video shows the steps. Call it again after every `browser_start_video`.
3. `browser_video_chapter` with the title the caller gives (for a scenario `S<N>: <title>`), and the description of what is checked.
4. Do the work. Show the approach on camera: the starting state is visible before the action.
5. End with a closing chapter card when the caller gives one (a verdict, `duration: 5000`), then `browser_stop_video` (required: it writes the file).
6. `ai-review video check <file>` right away. A missing or tiny file is a failed recording: say so and record again. Never claim a video exists without this check.

One video per scenario, never one recording for a whole run, never carried over into the next scenario.

## At the end
`ai-review video mp4 <folder>` converts every `.webm` under it to an MP4 that QuickTime plays and deletes each `.webm` whose MP4 converted. It needs a system `ffmpeg` (`brew install ffmpeg`). Report a video it could not convert, and keep its `.webm`. The MP4 is the deliverable.

---
name: verdict-highlights
description: How Scout evidence shows what is being done and what is being checked - amber boxes on the element about to be used, green, red or blue boxes with a short label on every checked element, readable screenshots, and marking a screenshot after the fact while keeping the original. Loaded by run-scenario, reproduce and capture-evidence before they take screenshots or record.
user-invocable: false
---
# Verdict highlights

The viewer must see what is being done and what is being checked, on video and in screenshots.

| Kind | `browser_highlight` `style` | For |
|---|---|---|
| Action (amber) | `border: 3px solid #f59e0b; border-radius: 4px; box-sizing: border-box;` | the element about to be clicked, typed into or selected |
| Pass (green) | `border: 3px solid #16a34a; border-radius: 4px; box-sizing: border-box;` | a checked element that matches the expectation |
| Fail (red) | `border: 3px solid #e5262b; border-radius: 4px; box-sizing: border-box;` | a checked element that contradicts it (bug, confirmed gap) |
| Uncertain (blue) | `border: 3px solid #1d6ff2; border-radius: 4px; box-sizing: border-box;` | a checked element whose verdict is unclear: the expectation is ambiguous, needs product input, or cannot be fully verified in the UI |

## Rules
- Highlight each target in amber just before acting on it.
- Checks are every element an assertion reads (a status badge, a history entry, a menu item present or absent, an error banner). Decide the verdict first, then highlight in its colour; one screenshot can mix colours. A check with no verdict colour on screen does not count as shown.
- Keep each highlight visible about 1.5 to 2 seconds (`browser_wait_for` time) so it reads on video, then `browser_hide_highlight`.
- An element outside the DOM (a canvas): inject a temporary absolutely-positioned `div` with the same style through `browser_run_code_unsafe`, and remove it afterwards.

## Screenshots
- Taken with the highlights visible, and with a short label in the same colour next to each box: what it shows and expected against actual ("PASS: link gone", "FAIL: still linked", "UNCERTAIN: label differs from form, confirm with product"). A screenshot without box and label is not evidence.
- Viewport shots at the run's browser size, never full-page (those shrink to unreadable). Scroll the checked element into view first; box and label fully visible.
- At least a context shot (the action set up: menu open, form filled) and a result shot (the outcome still on screen). Do not dismiss dialogs or banners before the shot.
- **Marking afterwards** (the shot came from `page.screenshot`, or a live highlight was impossible): take coordinates from `locator.boundingBox()` and draw with Pillow: `ImageDraw.rectangle((x0-4,y0-4,x1+4,y1+4), outline=<colour>, width=4)` (green `(22,163,74)`, red `(229,38,43)`, blue `(29,111,242)`) plus a white label on the same colour (`ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)`) next to the box, not over other content. Look at the marked image once to check the boxes land on the right element.
- Keep the unmarked original in a `raw/` folder beside the marked file; the marked file keeps the normal name.
- Feature-flag checks: repeat the same shots with the flag off, same boxes and wording, so on and off compare side by side.

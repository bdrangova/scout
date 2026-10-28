# UX review: Scout (retro-redesign)

Method: Playwright on the fixture stack at 1440x900 and 800px, light and dark, first-time and keyboard-only, all twelve sessions. Screenshots (`ux-*.png`) are in the scratchpad `shots/` folder.

## Issues

| ID | Sev | Screen | Problem (evidence) | Fix and rationale |
|---|---|---|---|---|
| U1 | high | Submit | Submit sends at once. On `trial` with no decision, 11 files unreviewed and one comment, one click launched an agent run, no confirmation (`submit-undecided`). | Pre-select the decision from verdicts (any rejected = Request changes). Disable Submit until one exists. Add a summary line: "Send 1 comment + Request changes to current session; 11 unreviewed." |
| U2 | high | Submit, list | A failed run is buried. failed-run opens in normal compose state; the failure is a row at the page bottom (`submit-failed-tall`), and the header and list say "Sent". | Error Notice at the top of Submit with the message and Retry. Add a "Run failed" status (err tone) to list and status bar. |
| U3 | high | Status bar, list | Done is never named. 12/12 still reads "In progress · 12 of 12" (`allv-light`, `empty-complete`, `list-tall`). | Add "Ready to submit" (ok tone, links to Submit) when reviewed = total. |
| U4 | high | Everywhere | Icon-only controls unclear without hover: list column headers and filter pills; Scroll/Swipe/Grid toggle; header Archive; status-bar stats (copy icon = files, double tick = reviewed); card Reject and Comment buttons; file-status tags (pencil = modified, + = added, refresh = updated; `hover-pencil`); eye; tree trailing dots; timeline nodes; Spec source icons (`rich-spec-light`); Evidence hint cluster; Submit chevron. | Add text at >=1024px: "Scroll/Swipe/Grid", "Reject X", "Comment C", "Modified/Added/Updated", "26 files", "2/26 reviewed", header labels. Keep icons alone only for universal glyphs. |
| U5 | med | Grid, tree, card | Colour collisions. File type (green JSON, orange YAML, yellow JS, blue TS) shares hues with status (green Added, amber Modified), verdict (green Approved) and info (blue Renamed): an approved JSON tile has three greens (`allv-grid`). Red/yellow/pink card "traffic lights" read as state. Progress is coral when low and looks like an error. | Make file type a neutral extension chip, not a hue. Drop the window dots. Reserve green/red/amber for verdict and status. Progress neutral until complete, then green. |
| U6 | med | Grid, dark | Contrast. "Commented" `text-st-m` is 2.36:1 on paper. Dark `--line` (alpha .28) borders are about 2:1. | Use ink text with an amber icon, or a darker amber token (>=4.5:1). Raise dark line alpha. |
| U7 | med | Session pages | Focus order contradicts visual order. The first Tab lands on the timeline; about 12 stops precede Spec/Files/Submit. No skip link. | Reorder the DOM (header, sidebar, main) or add skip links. |
| U8 | med | Deck | Single-key verdicts have no undo or clear feedback. My typing into an unfocused diff fired H, S and R and rejected a file (`line-saved`). The card just advances. | Undo toast ("Approved ci.yml · Undo"). |
| U9 | med | Submit | Send target unexplained: the chevron lists "Current session / New session" with no description; the button says "Submit". | Label "Submit to current session ▾" and describe each option. |
| U10 | med | Evidence | At 1440x900 the thumbnail strip and "1 / 7" counter are below the fold (`rich-evidence-light` vs `-tall`). | Fit the viewer to the viewport. Put "1 / 7" in the header. |
| U11 | med | 800px | Header, status bar and timeline use ~255px before the card (`var-deck-800`). On Submit the comments fall below the PR description (`submit-allv-800`). List ticket chips clip (`list-800`). | Collapse a <=2-node timeline to one line. Put Open comments first on narrow screens. "+N" for extra tickets. |
| U12 | med | Header | Archive is one click beside the theme toggle and navigates away silently (`archive-dialog`). | Toast with Undo, or move to an overflow menu. |
| U13 | low | Archived, empty | Archived URL shows a raw "session … not found" (`sess-archived`). Zero-file session says "Awaiting review 0/0" and allows Submit (`sess-none`). | "This session is archived" with Unarchive. "Nothing to review", Submit disabled. |
| U14 | low | Vocabulary | "Awaiting review", "In progress", "Updated" (undefined; `reviewed-deck`), "Sent" are close in tone. A comment alone counts as reviewed. Grid "Viewed" has no filter. | Add a legend; say "Updated since sent". |
| U15 | low | Spec, diff, list | Mermaid zoom controls overlap labels (`rich-spec-light`). The line "+" is hover-only with a ~20px target; line numbers do nothing. `?` is dead on the list. Five rows share one title. | Move the controls. Make the gutter clickable. Enable help globally. |
| U16 | low | Motion, targets | `motion-reduce` covers only spinners and pings. Segmented items are 33x26, tree and timeline controls 28px. | Gate hover/press transitions. |

## What works well
- Power flow is excellent: 12 files approved in 12 key presses (~6s), position restored on return, inline line-comment composer ("Comment on line 17").
- Grid status tabs with counts, file-type menu (swatch, extension, count) and tree filter ("4 of 26", clear).
- The delete-permanently dialog names the item, states what is removed and uses the red action.
- Verdicts are not colour-only (stamps, icons, tile text); the Open comments summary ("1 approved · 1 rejected · 10 not reviewed") is useful.
- Dark mode is cohesive.

## Top 5 by impact / effort
1. **U1** decision auto-suggest plus send summary (high impact, small).
2. **U2 + U3** truthful status: failed-run banner, "Run failed", "Ready to submit" (high, small).
3. **U4** text labels in place of icons on the main controls (high, medium).
4. **U8** undo toast for verdicts (medium, small).
5. **U5 + U6** neutral file-type chips, darker amber text, stronger dark line (medium, medium).

## Decided
- Working and failed runs are chips beside the review status ("Agent working", "Run failed"), not session states: a sent-back session being worked on shows `Changes sent` + `Agent working`, a failed run `Changes sent` + `Run failed` (follow-up to U2).
- No PR chip in the rail or the mobile drawer; the PR tab in the bar is the only entry.
- Submit warns about comments typed in a composer and not added (a warning, the send stays enabled).

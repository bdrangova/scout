# Session header: four options

Mocks: `design/retro/mocks/header-options.html` (light and dark, 1440x900 and 800px; serve the folder). Numbers are measured in the mocks. Today the card starts at **205px** (72 header + 54 status + 79 timeline) at 1440x900 and **225px** at 800; the card is 600px tall.

## Where each concern belongs

| Concern | Need | Home |
|---|---|---|
| Identity (tickets, title, repo, branches) | read once, glanced at | one line, detail on demand |
| Navigation | constant | always visible |
| Review state | glanced at every card | small, always visible |
| Scope (full diff / commit) | rarely changed; decides what the tree and cards contain | with the file tree |
| View (Swipe/Grid) | occasional | near the cards |
| Decision / Submit | ends every session | always reachable, showing its state |

## Options

**A. Two rows.** Status bar and timeline merge into one 46px row (state, scope chips, mode); identity stays two-line (64px). Chrome 110px: **+95px**. Nothing hidden, flows unchanged. Cost: crowded row, commit messages only on hover, about 200px of chrome at 800.

**B. Thin bar + session rail.** The sidebar becomes a rail: identity, review state (verdict-split bar), scope as a vertical git graph, then the tree. Top bar is nav + view (52px, **+153px**). Best for context and progress. Cost: the tree viewport drops from about 680px to 380px; the rail only makes sense if it persists on Spec/Extras/Evidence; at 800 it all hides in the drawer (progress as a badge on its button).

**C. One bar.** A single 56px bar: first ticket (+N), truncated title (click opens an identity popover), tabs, progress pill, mode, overflow. Scope becomes a menu at the top of the sidebar. **+149px**. Cost: cramped (the theme toggle had to collapse), progress is a small pill, nothing new for the decision.

**D. Thin bar + decision dock.** C's bar without the pill, plus a 52px bottom dock: verdict-split progress bar (green/red/amber), counts, the status notice (ready, failed, working), the suggested decision (any reject means Request changes, per U1) and a permanent Review & submit. Chrome 52px + 52px dock; the card gains **+127px** (the dock replaces the 50px pager line). At 800: 94px top, dock stays.

## Flows

| Flow | A | B | C | D |
|---|---|---|---|---|
| Review loop | better | better | better | better |
| Know where you are | same | better | worse | better |
| Send the decision | same | same | same | much better |
| Check scope/commit | same | same | worse (click) | worse (click) |
| Recheck title/branches | same | better | worse (click) | worse (click) |
| Tree browsing | same | worse | same | same |
| Effort | small | large | medium | medium |

## Recommendation: D, in two steps

1. Thin bar, sidebar scope menu, identity popover (C's structure, no pill).
2. The dock.

The loop ends by sending a decision to the agent, and today that outcome is invisible until the Submit page; the dock keeps it in view without nagging. Identity and scope suit a click (set once, rarely re-read), and scope belongs in the sidebar because it changes the tree's contents. B spends sidebar height, the scarcest space in the Files loop. A is the fallback if identity must stay visible.

Design-language notes: the dock button is a default raised button while the card's Approve is the one primary on screen, and becomes `primary` only at "Ready to submit" (no card left). Review & submit opens the Submit page; nothing is sent from the dock. The Submit page's sticky bar occupies the same position.

## Open questions

1. Do you re-read ticket and branches during a review, or only at the start? (Often: prefer A or B.)
2. How often do you change scope? Daily: keep it visible (A or B).
3. Should the decision be visible before you finish? Should the dock suggest one or only show state?
4. Should Spec/Extras/Evidence pages show progress too (dock everywhere; B needs rail content there)?
5. Is Archive inside a ⋯ menu acceptable (U12)?
6. Does "comment only" count as reviewed in the verdict bar, as today?

The fixtures have no commits; the three in the mocks are invented to stress the scope control.

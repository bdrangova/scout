# Header option B on every page

Mock: `design/retro/mocks/header-b-pages.html` (serve the folder; light and dark at 1440x900, key pages at 800px). Content is from the fixtures; the four VAR-201 commits (one is a merge) are invented, as before.

## Decisions

1. **Bar, 52px, on every session page:** the sidebar toggle (leftmost, see 7), Sessions (with label), the arrow tabs with counts, Swipe/Grid (Files only), Shortcuts, theme, overflow (Archive only). No identity, no status. Submit shows the open-comment count, turns green with a check when ready, red when the last run failed.
2. **Rail, 296px, on all five session pages** (hideable with the bar toggle, see 7). Same top two groups everywhere, then a section block. Spec: sources with their headings and comment counts. Extras: the list. Evidence: thumbnails (so the viewer now fits the viewport, U10). Files: filter and tree. Submit: what will be sent (counts by kind, files with comments) and run history.
3. **Two densities, one chevron, remembered separately for Files and the other pages.** Roomy: identity (tickets, title, repo, branches) plus the full review block. Compact: identity on one line, review as bar + counts, notice and suggested decision. Files defaults to compact.
4. **Tree viewport at 1440x900: 636px compact, 457px roomy** (measured in the mock; 437px in the long-title stress case). At an 800px-tall window, about 536px compact.
5. **Commit timeline is exactly today's component** (`CommitTimeline` / `CommitNode`: Full diff stack-icon node, pushed and not-pushed cloud icons, pink merge ring, dashed Uncommitted circle, dashed amber connectors, two-line labels, 120px columns), but **flush on the page background above the cards: no band, no background, no border**, aligned with the card column. It is 79px tall (today's nodes are 59px plus 8px above and 12px of breathing room below). Chrome above the cards: 52px bar + 79px timeline = **131px** (today 205). Card 683px tall (today 600; the 46px slim strip of the previous round gave 716). The rail has no git graph.
6. **Review-complete** blurs only the content column; the rail stays live and says the same thing.
7. **Sidebar toggle: always in the bar, leftmost, on every session page and at every width** (panel-left icon, "Hide sidebar" / "Show sidebar", hint **B**). At 1024px and up it collapses and expands the rail: collapsed, the content column takes the full width and the Files cards widen (980px to 1180px at 1440). Below 1024px the same button opens the rail as a left drawer. Whenever the rail is closed the button wears the review progress ("9/26") as a badge. Its state is remembered. The tree header no longer has its own hide icon. Below 1024px, Theme and Shortcuts also move into the overflow menu; Submit shows Open comments first.
8. **Sessions list:** no rail; the bar keeps its height and colour, with the wordmark in place of Sessions and the tabs. Error pages (archived, repo missing): the bar shows Sessions and the session id; nothing else exists to show.
9. The Spec page drops its own sources chip row; the rail does that job.

## As shipped

- Rail identity: the density chevron is the first item of the identity row (roomy and compact). Roomy shows every ticket on one row next to it; when they do not fit the row scrolls sideways (wheel, trackpad, touch, keyboard; no scrollbar) and the clipped chip fades out. Compact shows the title on one line.
- The Files section header has the same chevron at its front; the fold is remembered in `localStorage` (`useTreeCollapsed`).
- Cards in the page bodies have no shadow (Panel, ContentCard, FileReviewCard, tiles, notices, list rows). The hard shadow stays on raised buttons and floating overlays only.
- Submit's Decision options respond to the panel's own width (container query): full-width rows when narrow, three columns from a 672px panel.
- The suggested decision appears only when every file is approved (Approve) or one is rejected (Request changes); otherwise "none yet". Submit pre-selects it.
- The Previous runs panel shows in the Submit page body when the rail is closed (the rail's Runs block covers it otherwise).
- Not-indexed rows are not implemented.

## Open questions

1. Is one remembered density per group (Files vs others) right, or one global switch?
2. ~~Should the rail be hideable on Files for full-width cards?~~ Answered: yes, with the bar toggle (decision 7), on every page.
3. Should the compact block keep the counts? The mock does; dropping them saves 20px.
4. Is the suggested decision useful before the first verdict, and on every page, or only on Files and Submit?
5. Submit tab count and colours (green ready, red failed): wanted, or too loud?
6. The Spec rail nests headings under each source. Keep, or sources only?
7. With many commits, the timeline scrolls sideways as it does today (the mock fits six nodes at 1440 and 800). Keep, or collapse into "+N"?
8. Repo missing: show the manifest title in the bar instead of the id?
9. On Submit, does "will be sent" duplicate Open comments, or is a jump list enough?
10. Archive moves into the overflow menu, with an Undo toast (U12). Acceptable?

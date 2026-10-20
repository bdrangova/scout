# Shell findings (bar, rail, timeline move)

## Files card is 677px tall at 1440x900, the mock says 683px
- Repro: Files, any fixture, 1440x900: `article` height 677 (bar 52 + timeline 78).
- Suspected cause: the timeline strip is 78px (the mock's 79px) and the deck's own padding/footers in `components/diff/CardDeck.tsx` were left untouched; the extra 6px is in the deck, not in the shell.
- Severity: low.

## Compact rail leaves the tree 627px tall, the mock measures 636px
- Repro: Files, compact, 1440x900: `[role=tree]` is 627px (roomy: 456 vs 457, long title: 436 vs 437).
- Suspected cause: `FileTreeHeader` / `FileTreeFilter` spacing (existing) plus the compact review block, 2px taller than the mock's (the status legend button and the 1.5px borders).
- Severity: low.

## Bar is tight at 375px
- Repro: any session page at 375px: fits only because Sessions moves into the overflow menu below 520px and the tabs lose their words; the Swipe/Grid pair and the menu button touch the tabs.
- Suspected cause: nothing to drop; a phone layout was not designed (the mock stops at 800px).
- Severity: low.

## `TicketChip` `size="header"` and `TicketStrip` `size` are unused now
- Repro: grep for `size="header"`: nothing uses it since `SessionHeader` was removed.
- Suspected cause: outside the shell scope (`components/session`); delete in the QA phase.
- Severity: cosmetic.

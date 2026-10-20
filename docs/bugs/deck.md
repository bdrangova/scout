# Bugs found while redesigning the Files deck (chunk "deck")

## React warns that an effect's dependency list changed size
- Repro: open a session's Files page in swipe mode (e.g. `/s/<session>/files/src/components/TrialBar.tsx?mode=swipe`) and watch the console: "The final argument passed to useEffect changed size between renders. The order and size of this array must remain constant. Previous: [path, obj, obj, obj, obj] Incoming: [path, obj, obj, obj, obj, obj]".
- Where: not in `components/diff/*`, `components/common/*` or `pages/FilesPage.tsx` (none of their effects build the array with a spread). The shape (a path followed by objects) points at a hook in `web/src/lib/hooks.ts` or `web/src/lib/useAutosave.ts` that spreads a caller's list into its deps. Harmless today but it means that effect may miss updates; whoever owns `lib/` should find the spread and fix the array.
- Severity: low (console noise; possible stale effect).

## No fixture session exercises all seven file types
- The deck tints the card header and the two peeks behind it by file type (`ft-*`). The fixture sessions only contain react / other / image / config-ish files, so the palette for `style`, `test`, `doc`, `script` cannot be checked against a real diff; the task mentioned a "types-variety" fixture that has not landed in `fixtures/store/sessions`. Whoever owns `fixtures/` should add one (seven files, one per type, some renamed/deleted) and the deck screenshots should be redone against it.
- Severity: low (verification gap, not a runtime bug).

## FilesPage scroll-mode test is flaky under full-suite load
- **Repro:** `npm test -w web` occasionally fails `FilesPage > renders every card in scroll mode, persists the mode and makes a clicked card current` (~4s); passes alone every time.
- **Suspected cause:** virtualizer/scroll settle timing under CPU load; the test probably needs a `waitFor` instead of a fixed expectation.
- **Severity:** low.

# Blueprint

A UML-style diagram of a session's change that the reviewer walks through: packages (folders) first, then file boxes listing the declarations the diff touched, with "extends" and "leans on" arrows. Scout computes all of it from the code and the diff: no agent, no skill. Reviewing can happen right on top of the diagram (the cards) or on the Files page; Blueprint is the map to walk through first.

Decisions (user, 2026-11-13):
- No agent judgement: packages are plain folders (no named groups).
- Free-form canvas: pan, zoom, drag boxes; the arrangement is saved per session and per diagram.
- Tab order: Spec, Extras, Evidence, Blueprint, Files, Submit. The Journal page moved inside Extras (`/s/:id/extras?tab=journal`); `/s/:id/journal` redirects.
- Clicking a file box opens the review cards over the diagram, on a dark scrim, with everything the Files page's Swipe mode has (see Interactions). The Files page itself knows nothing of Blueprint: there is no Blueprint-limited Files view and no way-back line there, and a leftover `?bp=` in an old link is ignored.
- Boxes carry their review state as a wash over the whole box. A file: green = approved, red = rejected, grey = open comments but no verdict. A package or group gets no wash until every file in it has a verdict; then red when any file is rejected, else green (2026-11-13: comments alone no longer colour a package, and the dashed border on commented boxes is gone). Open comments also show as a count chip on the box.
- The rail outline of packages folds per package and all at once, filters by name, and follows the rail-wide "only commented" switch (packages holding files with open comments). Fold state is not saved.
- Development and PR-review sessions; not test runs. JS / JSX / TS / TSX get members and arrows; other files are plain boxes.
- Prototype this came from: `design/review-explore/` (Blueprint view).

## Interactions

Decisions (user, 2026-11-13). Three things on the Blueprint page, in folder and group views alike:

- **Cards over the diagram**: a plain click on a file box (its header, or a declaration row, which opens at that line) opens the same deck the Files page shows in Swipe mode, straight on a flat dark scrim over the diagram, with no window or frame around the cards (no shadow, no blur). A card opened from its box shows alone, without the stack of next cards behind it (arrows still move through the diagram's files); the picked files of select mode open as a stack: the current card with the next ones behind it, drag or buttons or A / X to approve or reject, arrows and arrow keys to move, C to comment, unified / split, Scout's notes, line comments, and the position "3 / 12". It is the real review state, so the decisions are the Files page's own. The deck holds the clicked diagram's files in reading order, opened on the clicked one. A slim line on top names the diagram (or "N selected files"), shows the position and has the close button. Deciding a card moves on to the next one and does not close; after the last one the deck stays on it. Close with a click on the scrim, Esc, or the corner button; the diagram is exactly as it was (same pan and zoom, select mode and picks) and the boxes show their new washes. While the cards are open the canvas does not pan or zoom and ignores its keys (Esc, F, S); the card keys work, and typing in a comment box does not trigger them. The URL carries `?file=<path>` (opening adds a history entry, moving between cards replaces it, closing removes it, Back closes) so a reload reopens the same card; an unknown file or unreadable picks just drop the parameters. Package and group boxes still open their diagram. Ctrl / Cmd + click does nothing special (the old single-card quick preview is gone).
- **Select mode**: a "Select" button in the toolbar, or the `S` key, or Shift + click on a box. Esc leaves it (Esc closes the cards first, then leaves select mode, then goes up a level). In select mode boxes are not draggable and a click anywhere on a box picks or unpicks it instead of opening anything; panning and zooming still work. A package or group box picks all the files inside it and shows a minus when only some are picked. Picked boxes get a thick outline and a filled check badge on the top-left corner, the others are dimmed and show an empty checkbox, so it is obvious what can be picked. The picks are kept while you move between diagrams, so files can be collected across packages, and forgotten when select mode ends. They are not in the URL.
- **Action bar**: only in select mode, pinned to the top centre of the canvas (the canvas can run below the fold). "N selected" (files, not boxes), then View all, Approve all, Select all (every file of the diagram on screen, added to the picks), Deselect all and Done. View all, Approve all and Deselect all are off at zero.
  - *View all* opens the cards over the diagram for exactly the picked files, in the diagram's reading order for the ones on this diagram and then the rest by path. The URL adds `&sel=<key>` next to `?file=`; the list itself is saved in sessionStorage under `scout:bp-sel:<sessionId>:<key>`. If the key cannot be read (a new tab, cleared storage) or none of its files are in the change any more, the cards are not opened and the parameters are dropped. Select mode and the picks are still there when the cards close.
  - *Approve all* approves every picked file that is not approved yet (rejected ones become approved) with no confirmation, then clears the picks and says "Approved N files" with an Undo for about four seconds; Undo puts every file back to the verdict it had. Select mode stays on.
- **Choosing the arrows** (user, 2026-11-16): the legend's "extends" and "leans on" entries are switches. Switching one off hides that kind of arrow and nothing else: the boxes keep their places (the automatic layout still reads every link), and hovering a box only lights up the arrows still shown. An arrow between two packages counts as "extends" when any link behind it is an inheritance link, so it goes with that switch. The choice is remembered per session in the browser (localStorage, both kinds on by default), not in the saved layout.
- **Hiding boxes** (user, 2026-11-16, for big boards mixing groups and many loose files): switches in the legend row, looking like the arrow switches (an icon and a word, struck through when off), so the toolbar never changes size. *Approved* hides every box that is fully approved (a package only once all its files are). *Files* hides the loose file boxes and leaves the packages or groups; offered only where a diagram has both. *Only unlinked* (user, same day: "if it's clicked show only unlinked") is a filter rather than a show/hide entry: on, it leaves only the boxes no arrow touches, of either kind and whatever the arrow switches say; offered only where the diagram has arrows and some box without any. Hidden boxes keep their place, so the rest of the board does not move and showing them again restores it exactly; their arrows are hidden with them; Fit frames what is left; "Select all" picks only what is shown; the number hidden is the tooltip of that part of the legend. The box a diagram is drawn around is never hidden. The cards opened from a box still step through every file of the diagram, hidden or not (otherwise approving a card with "Approved" on would pull it out from under the reviewer). Remembered per session in the browser, nothing hidden by default.

## Contract (`shared/src/schemas/blueprint.ts`, `shared/src/blueprint/ids.ts`)

- `Blueprint { fingerprint, files: BlueprintFile[] }`, one `BlueprintFile { path, kind, analyzed, members[], imports[], extends[] }` per file of the full working tree. `imports` / `extends` only name other changed files.
- `BlueprintLayout` = `review/blueprint.json` (`BLUEPRINT_LAYOUT_FILE`), dashboard-owned: `diagrams[diagramId] = { positions[boxKey] = {x,y}, viewport? }`.
- Ids: diagram `pkg:<dir>` (`pkg:` = whole change) or `around:<path>`; box `dir:<dir>` or `file:<path>` (`blueprintDiagramId`, `parseBlueprintDiagramId`, `blueprintBoxKey`, `parseBlueprintBoxKey`).
- Event `blueprint-layout.updated { sessionId }` when the layout file changes on disk (not for the server's own writes).

## API

| Route | Response |
|---|---|
| `GET /api/sessions/:id/blueprint` | `BlueprintResponse` (`{ blueprint: null }` for a test run). Cached per session by `WorkingTree.fingerprint`. |
| `GET /api/sessions/:id/blueprint/layout` | `BlueprintLayoutResponse` |
| `PUT /api/sessions/:id/blueprint/layout` | body `PutBlueprintLayoutRequest { diagram, layout \| null }`: replaces that one diagram (null removes it); `PutBlueprintLayoutResponse { updatedAt }`. No conflict errors: last write per diagram wins. |

## Pure helpers (`shared/src/blueprint/`, browser-safe, re-exported from `shared/src/index.ts`)

```ts
// tree.ts
interface BlueprintPackage { dir: string; name: string; packages: BlueprintPackage[]; files: string[]; allFiles: string[] }
buildBlueprintTree(paths: string[]): BlueprintPackage            // root has dir ''
findBlueprintPackage(root: BlueprintPackage, dir: string): BlueprintPackage | null

// model.ts
interface BlueprintBox { key: string; ref: BlueprintBoxRef; name: string; files: string[]; layer: number;
  usedByOutside: number; extendedByOutside: number; usesOutside: number }
interface BlueprintArrow { from: string; to: string; count: number; extends: boolean }   // from = the dependent box, to = what it leans on
interface BlueprintDiagram { id: string; ref: BlueprintDiagramRef; title: string; boxes: BlueprintBox[]; arrows: BlueprintArrow[]; center: string | null }
buildBlueprintDiagram(blueprint: Blueprint, root: BlueprintPackage, ref: BlueprintDiagramRef): BlueprintDiagram | null
blueprintDiagramFiles(diagram: BlueprintDiagram): string[]

// layout.ts
layoutBlueprint(diagram: BlueprintDiagram, sizes: Record<string, { w: number; h: number }>,
  options: { maxRowWidth: number; gapX?: number; gapY?: number }): Record<string, BlueprintPoint>
```

Rules:
- **Tree**: folders of the changed paths. A folder with one sub-package and at most 2 files of its own merges with it (`name` becomes `a/b`, `dir` the deeper one; its own files stay as direct files). A folder holding 2 files or fewer in total dissolves into its parent. A folder holding 14 files or fewer in total is flat (every file direct, no sub-packages). `dir` is always the real folder path; `name` is relative to the parent package. The root skips leading single-folder chains the same way (its `dir` stays `''`).
- **Diagram for a package**: one box per sub-package and per direct file. Arrows aggregate file-level imports between two different boxes (`count` = number of file-level links, `extends` if any of them is an inheritance link). Links to changed files outside the diagram are only counted on the box (`usedByOutside`, `extendedByOutside`, `usesOutside`).
- **Diagram around a file**: boxes = the files it imports, the file itself (`center`), and the files that import it (those that extend it first, then by path). Only arrows touching the centre.
- **Layers**: `layer` 0 = leans on no other box in the diagram, otherwise 1 + the deepest layer it leans on (cycles broken by ignoring the edge that closes them); `-1` = no arrows at all in this diagram. Around a file: imports 0, centre 1, importers 2.
- **Reading order** (`boxes` order, and `blueprintDiagramFiles`): by layer ascending (unlinked last), within a layer by position under what it leans on, then by path. `blueprintDiagramFiles` returns the direct file boxes' paths in that order; when the diagram has no file boxes, every file inside its boxes, box by box.
- **Layout**: one row band per layer, foundations on top, each band wrapped to `maxRowWidth` and centred; unlinked boxes in a wrapped grid below. Deterministic for the same input.

## Server analysis (`server/src/blueprint/`)

- Parser: the `typescript` compiler API, syntax only (`ts.createSourceFile`), for `.js .jsx .ts .tsx .mjs .cjs .mts .cts`.
- Imports: static `import … from`, `export … from`, `require('…')`, `import('…')` with a string literal. Relative specifiers resolve against the file; other specifiers through the `compilerOptions.paths` / `baseUrl` of the nearest `tsconfig.json` or `jsconfig.json` above the file (then every other such config in the repo, as a fallback for test folders). Candidates: exact, then `.ts .tsx .js .jsx .mjs .cjs`, then a `.js` specifier with `.ts` / `.tsx` / `.jsx`, then `/index.*`. Only hits on other changed files are kept. Deleted files have no imports.
- Extends: `class X extends Y` (also `Mod.Y`) where `Y` is bound by an import that resolved to a changed file.
- Members: top-level functions, classes, class members, arrow-function consts, types, interfaces and enums, with their line ranges on the new side and on the base side. Present only on the new side = added; only on the base side = removed; on both and overlapping an added or deleted patch line = changed. A class counts as changed only when a changed line falls outside its members.
- Kind: from the path (`.feature` scenario; test folders and `.test.` / `.spec.` test; stylesheets style; json / yaml / sh config; `_page` / `/pages/` page; `use_*` / `useX` / `/hooks/` hook; `types` types; helper / utils / constants / mapping; `.tsx` / `.jsx` component; else module).

## Logical groups (optional, agent judgement)

Decisions (user, 2026-11-13): folders stay the free default. On demand, from the Blueprint page, the reviewer asks the session's agent to group the change one of three ways: `feature` (what the change does), `layer` (foundations first, then what builds on them, pages, tests), `priority` (fixed top groups "Read carefully", "Repeated pattern", "Mechanical or generated"; the agent sub-groups inside). One type per request. The agent decides whether a group gets sub-groups (at most 3 levels). No editing of groups in the dashboard. Development and PR-review sessions (2026-11-13: PR reviews added; both main skills take `--groups <type[,type]>` to group right after publishing). Files changed after a grouping land in an "Ungrouped" box and the view says it is out of date, with a way to ask again. Story mode is still out.

Scout starts no agent: like Submit, the page copies a slash command (`/scout-blueprint-groups <sessionId> <type>`) for the reviewer to run in the session. The skill has the agent read `scout groups context` and save with `scout groups set`.

- Contract: `shared/src/schemas/blueprint-groups.ts`. File `review/groups.json` (`BLUEPRINT_GROUPS_FILE`), agent-owned: `BlueprintGroups { schemaVersion: 1, sessionId, updatedAt, groupings: { feature?, layer?, priority? } }`, each `BlueprintGrouping { createdAt, groups: BlueprintGroup[] }`, `BlueprintGroup { id (slug), name, purpose, files[], groups? }`.
- Helpers (`shared/src/blueprint/groups.ts`): `buildBlueprintGroupTree(type, grouping, paths)` turns a grouping into the same `BlueprintPackage` tree folders use, with made-up folder paths under `@<type>` (`@feature/top-bar`), so diagrams, saved positions (`pkg:@feature/top-bar`), the rail outline and the Files page scope (`?bp=`) all work unchanged; it also returns `ungrouped`, `gone`, `stale`. `checkBlueprintGroups(type, groups, paths)` is the validation `scout groups set` applies. `blueprintGroupingOfDir(dir)` tells a group path from a real folder. A package may carry `purpose`.
- API: `GET /api/sessions/:id/blueprint/groups` -> `BlueprintGroupsResponse` (`{ groups: null }` when absent or invalid, and for a test run). Event `blueprint-groups.updated { sessionId }` when the file changes.
- CLI: `scout groups context [<id>] [--repo <path>]` prints what the agent needs (changed files with sizes and status, Scout's one-line journal summary per file, existing groupings); `scout groups set <type> [<id>] [--repo <path>] --from <file.json>` validates (`BlueprintGroupsInputSchema`, `checkBlueprintGroups` against the session's changed files; every changed file must be in a group) and replaces that one grouping, atomically.
- Web: the Blueprint toolbar has a view switch Folders | Feature | Layer | Priority (`?view=`; absent = folders). A view without a grouping shows how to ask for it (the command, copied). A stale grouping shows a notice with the same command.


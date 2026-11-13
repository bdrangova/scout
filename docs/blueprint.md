# Blueprint

A UML-style diagram of a session's change that the reviewer walks through: packages (folders) first, then file boxes listing the declarations the diff touched, with "extends" and "leans on" arrows. Scout computes all of it from the code and the diff: no agent, no skill. Reviewing itself still happens on the Files page; Blueprint is the map that takes you there.

Decisions (user, 2026-11-13):
- No agent judgement: packages are plain folders (no named groups).
- Free-form canvas: pan, zoom, drag boxes; the arrangement is saved per session and per diagram.
- Tab order: Spec, Extras, Evidence, Blueprint, Files, Submit. The Journal page moved inside Extras (`/s/:id/extras?tab=journal`); `/s/:id/journal` redirects.
- Clicking a file box opens the Files page limited to that diagram's files (`?bp=<diagram id>`), with a way back.
- A Blueprint stop (the Files page with `?bp=`) is focus mode: no commit timeline, no filter bar (filters left on are ignored), one line above the card (back to the diagram, its name, position, "Show all files"). The Blueprint tab stays lit there and leads back to the diagram; the Files tab leaves the stop.
- The rail outline of packages folds per package and all at once, filters by name, and follows the rail-wide "only commented" switch (packages holding files with open comments). Fold state is not saved.
- Development and PR-review sessions; not test runs. JS / JSX / TS / TSX get members and arrows; other files are plain boxes.
- Prototype this came from: `design/review-explore/` (Blueprint view).

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

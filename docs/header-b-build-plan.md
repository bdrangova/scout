# Build plan: header Option B

Spec: `docs/header-b-pages.md` (decisions 1-9) and the mock `design/retro/mocks/header-b-pages.html`. Branch: `retro-redesign` (no new branch). Open questions use the mock's answers.

## Phases

1. **Shell** (one agent, serial; everything else depends on it)
   - `SessionBar` (52px) replaces `SessionHeader` + `SessionStatusBar`: sidebar toggle (leftmost, badge with progress when closed, hint B), Sessions, arrow tabs with counts (Submit: open comments, green ready, red failed), Swipe/Grid on Files only, Shortcuts, theme, overflow menu (Archive with Undo toast).
   - `SessionRail` (296px, sticky): identity + review block in roomy and compact densities (remembered separately for Files vs other pages), then a section-block slot. The Files block is the existing tree. Under 1024px the rail is a left drawer.
   - `CommitTimeline` moves out of FilesPage into the content column, flush on the page background (no band), aligned with the card column.
   - Rework `--shell-h`/`useShellHeight`, `useSidebarOpen` (shared toggle, `B` hotkey), `SessionLayout`; drop the tree header's hide icon, the Spec chip row stays until phase 2.
   - Delete replaced code (SessionHeader, SessionStatusBar, SidebarToggle); keep SessionStatusNotice inside the rail.
2. **Rail blocks** (three agents in parallel, disjoint files)
   - A: Spec sources + headings with comment counts; Extras list. Remove the Spec chip row.
   - B: Evidence thumbnails in the rail; viewer fits the viewport, "n / N" in the content header (U10).
   - C: Submit block: what will be sent (counts by kind, files with comments) and run history; Open comments first below 1024px.
3. **QA** (one agent): update unit + e2e tests, screenshots of every page light/dark at 1440 and 800 across fixtures, update `web/src/DESIGN.md`, log bugs in `docs/bugs/`.

## Rules for every agent
Sonnet. Follow `web/src/DESIGN.md` and the mock. Only touch the files your phase names. No commits (the lead commits per phase). Report under 300 words.

# Bugs found while building the Files grid / Review complete (chunk "grid")

## `shadow-none` never beats `shadow-raised` on a Button
- Repro: render `<Button variant="ghost">` (or any Button with `className="shadow-none"`) and inspect it: computed `box-shadow` is still `2px 2px 0 var(--sh)`. Visible as a faint raised square around the icon-only ghost "Back to files" button on the Review-complete panel before the workaround.
- Cause: `cn()` (`web/src/lib/utils.ts`) extends tailwind-merge for `border-fine`/`bg-grid` but not for the custom shadows (`shadow-kbd|icon|raised|panel|card`), so `shadow-raised` and `shadow-none` are both kept and the stylesheet order wins. Fix: add `'shadow': ['shadow-kbd', 'shadow-icon', 'shadow-raised', 'shadow-panel', 'shadow-card']` to the `classGroups` extension (and then drop the `shadow-none!` workarounds in `components/files/*`).
- Severity: low (visual), affects every ghost/link Button.

## KitPage renders `MenuLabel` outside a `MenuGroup`
- Repro: open `/__kit`, open the "Types" menu in "Fields, Menu, Dialog": base-ui throws `MenuGroupContext is missing` (seen in the FileGrid tests before wrapping the label in `MenuGroup`).
- Cause: `web/src/pages/KitPage.tsx` ~line 260 uses `<MenuLabel>` directly under `MenuContent`; base-ui's `GroupLabel` needs `Menu.Group`. Either wrap it in `MenuGroup` there or make `MenuLabel` in `ui/menu.tsx` a plain `div` when no group is wanted.
- Severity: low (kit gallery only).

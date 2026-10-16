# Implementation plan: trial bar (QI-15472)

## Approach

Render the trial bar from `app.ts` next to the existing notice component instead of adding a new
layout layer. The trial state comes from the `/me` response, so no new endpoint is needed; the
warning threshold and the upgrade URL live in `config.ts` so support can tune them.

## Steps

1. Add `trial` (days left, plan) to the app state and read it during bootstrap.
2. Create `components/TrialBar.tsx` with the neutral and amber variants, plus `styles/trial-bar.css`.
3. Rename `Banner` to `Notice`: the old name clashes with the marketing banner and the trial bar.
4. Remove `legacy/OldBanner.ts`; it has had no callers since the navigation rewrite.
5. Wire the upgrade button to the billing flow and confirm the chosen plan inline.
6. Cover the day formatting and the amber threshold with unit tests.

## Out of scope

- Server-side trial extension.
- Emails about the trial ending.

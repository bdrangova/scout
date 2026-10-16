# QI-15472: Trial bar

Adds a persistent trial bar above the header for free-plan users, with an amber variant when
three or fewer days remain and a direct path into the upgrade flow.

## Changes

- `TrialBar.tsx` + `trial-bar.css`: the bar, its neutral/amber variants and the dismiss control.
- `app.ts`: reads the trial state during bootstrap, renders the bar, exposes `dismissTrialBar()`.
- `config.ts`: `trial.warnAtDays` and `trial.upgradeUrl`.
- `Banner` renamed to `Notice`; `legacy/OldBanner.ts` removed (no callers).
- `big.generated.ts` regenerated from the flag registry; `package-lock.json` updated.

## Testing

- Unit tests for day formatting and the amber threshold.
- Manual: screenshot of the bar on the dashboard and a recording of the upgrade flow (see evidence).

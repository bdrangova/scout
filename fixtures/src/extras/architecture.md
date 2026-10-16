# Trial bar architecture

The trial bar is rendered by `app.ts` from the `/me` payload; no new endpoint is involved.
The amber threshold and the upgrade URL are configuration, not component state.

```mermaid
flowchart LR
  API["/me endpoint"] -->|plan, trialDaysLeft| App[app.ts state]
  Config[config.ts<br/>warnAtDays, upgradeUrl] --> App
  App --> Header[Header.tsx]
  App --> TrialBar[TrialBar.tsx]
  App --> Notice["Notice.tsx<br/>(was Banner)"]
  TrialBar -->|Upgrade click| Billing[/billing/upgrade/]
  TrialBar -->|dismiss| Session[sessionStorage]
```

## Notes

- `TrialBar.tsx` owns only presentation; `dismissTrialBar()` in `app.ts` persists the dismissal.
- `legacy/OldBanner.ts` was deleted; its last caller went away with the navigation rewrite.
- `big.generated.ts` is a regenerated flag registry and should be skimmed, not reviewed line by line.

# Server / shared bugs found during the retro redesign

Found by the fixtures agent while building edge-case sessions. Not fixed here; each is a task for its own session.

## 1. `GET /sessions/:id/runs` reconciles stale runs, list route does not
- **Repro:** open the `trial-bar-active-run-ac71` fixture session, visit the Submit tab. The run flips `running` → `failed`.
- **Cause:** `runs` route runs `reconcileStale`, which marks any `running` run from another process failed. The sessions list route doesn't reconcile, so list and detail can disagree about the active run.
- **Severity:** medium (confusing state, only when the owning process is gone).

## 2. `progress` counts commented files as reviewed
- **Repro:** `trial-bar-all-verdicts-a11e` reports 12/12 while 3 files have verdict `none` (comments only).
- **Cause:** matches the UI "commented counts as reviewed" rule but differs from the contract wording in `shared/README.md` ("reviewed = effective verdict ≠ none").
- **Fix:** decide which is right, then align contract text or the server.
- **Severity:** low.

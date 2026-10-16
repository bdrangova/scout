# QI-15472: Trial bar

- **Status:** In Review
- **Assignee:** Alex Rivera
- **Type:** Story
- **Priority:** Medium
- **Link:** https://example.atlassian.net/browse/QI-15472

## Description

Users on a free trial have no visible reminder of how many days are left, so many are surprised when
the workspace becomes read-only. Add a persistent trial bar above the application header that shows the
remaining days, turns amber when the trial is about to expire, and links straight to the upgrade flow.
The bar must not appear for paid plans and must be dismissible for the rest of the browser session.

## Acceptance criteria

1. On the free plan a trial bar shows "Your trial ends in N days" (or "today" when N = 0) above the header.
2. The bar turns amber when 3 or fewer days remain and stays neutral otherwise.
3. Clicking "Upgrade" opens the upgrade flow; the chosen plan is confirmed without a full page reload.
4. The bar is hidden for paid plans and stays dismissed for the rest of the session after the user closes it.

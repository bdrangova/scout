# Test Task: Live Playwright checks for proposing Withdrawn and Rejected records — 2026-10-21

**Verifies:** [01-withdrawn-repropose.md](01-withdrawn-rejected-repropose.md) (no Jira ticket yet)
**PR:** —

## Summary

- These are Claude's own checks, run through the Playwright MCP against the local app (8080/3000). They are not a committed spec; the committed coverage is [02-cucumber-test-task.md](02-cucumber-test-task.md).
- Two runs:
  - **Baseline** on the current code, before the change, to confirm what is blocked today.
  - **After** the change, on the branch, with the state management propose flag on and off.
- Data is created fresh in a new local project ("Withdrawn Re-propose QA") as Demo Co (`test@example.com`). It is set up through the app's own REST calls (`addOrEdit`, propose, withdraw, approve) from the logged-in page, and the UI only drives the check itself.
- Evidence: a narrated screen recording per run, with a chapter per check, as `.mp4` in `screenshots/withdrawn-repropose/`. API results are recorded as text. Screenshots only when a single frame says enough.

## Setup

- **Users:**
  - Proposer: `test@example.com`.
  - Approver: a second confirmed Administrator in Demo Co. Create one if none exists.
  - Passwords: `password_helper.js`.
- **Flags:** `launchdarkly-dev` skill, toggling `StateManagementServiceProposeForApproval`.
- **Records:**

  | Name | Model | State to reach |
  |---|---|---|
  | S1 | Supplier | Withdrawn (proposed → withdrawn) |
  | CM1, CM2 | Control Method | Withdrawn |
  | CM3 | Control Method | Draft |
  | UO1 + PP1, PP2 | Unit Operation + Process Parameters | proposed for archive, then withdrawn, so PP1/PP2 are Withdrawn (Cascaded) |
  | RMP1 | RMP | Withdrawn |
  | S2 | Supplier | approved 1.0 → proposed for archive → withdrawn |
  | S3 | Supplier | proposed for archive → approved (archived) → proposed for restore → withdrawn |
  | CM4 | Control Method | proposed → withdrawn twice on the same version |
  | CM5 | Control Method | proposed to Yash + Jamie → Yash rejects (Jamie still pending) |
  | CM6 | Control Method | proposed to Yash → Yash rejects (all responded) |
  | UO2 + PP3, PP4 | Unit Operation + Process Parameters | proposed for archive → rejected, so PP3/PP4 are Rejected (Cascaded) |
  | S4 | Supplier | approved 1.0 → proposed for archive → rejected |
  | S5 | Supplier | archived → proposed for restore → rejected |

  Rejections are done in a second browser context logged in as `test+priya@example.com`, through the UI (Approve / Reject → Reject). Rejecting over REST needs a payload the seeders don't build.

## Checks

Before each check, record `version` and `currentState` from `GET editables/{Model}/{id}?includeHistory=true`. Each "works" check passes only if the version is unchanged afterwards and the state is `Proposed`.

| # | Check | Baseline expectation | After expectation |
|---|---|---|---|
| 1 | S1 view page: Propose button | hidden | visible; proposes; same version |
| 2 | S1 withdraw again → Propose | — | visible again (second cycle) |
| 3 | PP1 (Withdrawn (Cascaded)) view: Propose | hidden | visible; proposes; PP2 and UO1 unchanged |
| 4 | Control Methods table: select CM1 + CM2 → bulk Propose | disabled | enabled; wizard shows exactly 2 |
| 5 | Same table: select CM3 only | enabled (draft) | enabled |
| 6 | RMP1 → Propose popup → send, flag ON | button hidden; direct API call throws "No workflow configuration found" | succeeds |
| 7 | RMP1-style flow, flag OFF | hidden | succeeds |
| 8 | S3 (archived withdrawn): Propose / Edit | both hidden | both hidden; direct API propose rejected; still archived |
| 9 | S2 (withdrawn on approved 1.0): Propose | hidden | hidden or disabled per decision; API propose rejected on both flag states; no new approval request |
| 10 | Dashboard Drafts Pending: CM4 rows | likely 2 rows; propose may already work | 1 row; proposes |
| 11 | Regression: S1-style record, Edit → change → Propose | works, new version | works, new version |

### Rejected checks (added 2026-10-21)

| # | Check | Baseline expectation | After expectation |
|---|---|---|---|
| R1 | CM6 (rejected, all responded), proposer's view | no Propose, only View/Edit Last Draft | Propose visible; proposes; same version |
| R2 | CM5 (rejected, Jamie pending), proposer's view | no Propose | per decision: Propose visible and the old request closed, or hidden until Jamie responds |
| R3 | CM5 as Jamie, after R2 re-propose | — | old request no longer accepts a response; the new request does |
| R4 | Control Methods table: CM6 selected → bulk Propose | disabled | enabled |
| R5 | REST single-record propose of CM5 / CM6 | 400 "You cannot propose a Rejected record." | 200 (CM6); CM5 per decision |
| R6 | PP3 (Rejected (Cascaded)) view: Propose | hidden | visible; proposes; PP4 and UO2 unchanged |
| R7 | S5 (rejected restore, archived) / S4 (rejected archive on approved 1.0) | hidden | still hidden; API propose rejected |
| R8 | Drafts Pending: CM6 | not listed | depends on the open question; if yes, listed once and proposes |

Each check gets a screenshot of the title bar plus the action buttons, along with the API state and version before and after. Console and network errors are noted.

## Findings

### Baseline — 2026-10-21, `master` (foliant), Demo Co, project PRJ-18 "Withdrawn Re-propose QA 60430"

Seeded via REST + the `withdrawRecord` test hook: S1 (Supplier 18), CM1-CM4 (ControlMethod 46-49). The checks below are numbered as in the Checks table.

| # | Result | Evidence |
|---|---|---|
| 1 | **CONFIRMED.** On the withdrawn S1 view page, the only action is "Edit Last Draft"; there is no `#proposeButtonTop`. | ![](screenshots/withdrawn-repropose/1-baseline-supplier-withdrawn.jpg) |
| 4 | **CONFIRMED.** On the Control Methods table, with only a withdrawn row (CM2) selected, bulk Propose is disabled. With a Draft row (CM3) selected, it is enabled. | ![](screenshots/withdrawn-repropose/4-baseline-table-withdrawn-selected.jpg) |
| 10 | **CONFIRMED, both parts.** (a) Duplicate rows: CM4 (proposed and withdrawn twice on version 0.1) appears **twice** in Drafts Pending (`CM-49` ×2). (b) **It already works:** selecting withdrawn CM1 in Drafts Pending → Propose → wizard → submit took it Withdrawn → **Proposed on the same version** (0.1, version id 46, no new version). History shows the single 0.1 entry with the latest "Proposed" transition. | ![](screenshots/withdrawn-repropose/10-baseline-drafts-pending.jpg) ![](screenshots/withdrawn-repropose/10-baseline-cm1-history.jpg) |
| server | **CONFIRMED.** A single-record REST `PUT editables/ControlMethod/addOrEdit` with `approvalInfo` on withdrawn CM4 returned 200 and moved it to Proposed on the same version (49). The server does not block Withdrawn → Proposed on this path. | — |

- **Flag state (inferred):** the single-record REST propose from Withdrawn succeeded. With `StateManagementServiceProposeForApproval` on, `workflow_config` would have thrown, so the propose flag was most likely **off** locally. Confirm with `launchdarkly-dev` before the "after" run.
- **Not run in the baseline:**
  - 2, 3, 5: cascaded children, the second cycle through the UI, and the Draft check (5) were not exercised.
  - 6, 7: RMP.
  - 8, 9: the archived and approved-version guards (they need an approver to log in and e-sign).
  - 11: edit regression.
  - These are all for the "after" run.
- **Seeding gotcha:** proposing a Supplier needs `servicesOrProducts` (required for proposal).

### Baseline, Rejected and recording — 2026-10-21, same project PRJ-18

- **Recording:** [baseline-master.mp4](screenshots/withdrawn-repropose/baseline-master.mp4) (2:32). Chapters:
  1. Withdrawn Supplier: no Propose.
  2. Table: bulk Propose disabled for withdrawn CM2 and rejected CM6, enabled for Draft CM3.
  3. Rejected CM6, all responded.
  4. Rejected CM5, approver still pending.
  5. Drafts Pending: CM4 twice; CM5/CM6 not listed.
  6. Drafts Pending → propose withdrawn CM2 → Proposed on 0.1.
- Seeded: CM5 (ControlMethod 50, approvers Yash + Jamie) and CM6 (51, Yash only). Both were rejected by Yash through the UI.

| # | Result |
|---|---|
| R1 | **CONFIRMED.** CM6, proposer's view: "Latest (Rejected)", only View Last Draft and Edit Last Draft, no Propose. (chapter 3) |
| R2 | **CONFIRMED.** CM5, proposer's view: identical to CM6. The proposer can't tell the request is still open; Jamie's avatar shows no response yet. (chapter 4) |
| R4 | **CONFIRMED.** With CM6 selected, bulk Propose is disabled. (chapter 2) |
| R5 | **CONFIRMED.** REST propose on CM6 and CM5 → 400 "You cannot propose a Rejected record."; state and version unchanged (legacy `validation_helper.js`). |
| R8 | **CONFIRMED.** CM5 and CM6 are not in Drafts Pending. (chapter 5) |
| 10 | Re-confirmed on video: withdrawn CM2 proposed from Drafts Pending → Proposed, still 0.1. CM2 is now Proposed; CM2-based checks need a fresh record next run. (chapter 6) |

- Not run: R3, R6, R7 (after the change).

### Global Pending Drafts, clean company — 2026-10-21

- **Company:** "Withdrawn QA 02301" (id 362). Proposer: Wanda Withdraw. Approver: Arlo Approver. Both are Administrators, with credentials in the session's scratchpad (`new_company.json`), not here. One project, PRJ-1 "Pending Drafts QA" (Default 4x4 RMP), with no sample projects.
- **Seeded:** CM-1 and CM-2 Withdrawn, CM-3 Rejected (by Arlo), CM-4 Draft, all on 0.1.
- **Recording:** [global-pending-drafts-clean-company.mp4](screenshots/withdrawn-repropose/global-pending-drafts-clean-company.mp4)
- **Result:**
  - Home → Pending Drafts → `/projects/bulkProposal.html?requestedByHomePage=true` lists **CM-1 and CM-2 (Withdrawn)** and CM-4 (Draft).
  - **CM-3 (Rejected) is not listed.** It matches R8 and the `getDraftsPending` filter.
  - The rest of the list is the project's own auto-created drafts (GA, TPP, GI, PR, PRJ) and Arlo's ITP.
- **Signup gotcha:** local signup left the user at `DB_CREATING` after the migrations finished (the ITP/sample-import step didn't complete). Setting `Users.status='CONFIRMED'` unblocked login.

### Ticket gap demos (QI-16304 epic review) — 2026-10-22, clean company "Withdrawn QA 02301"

Added Jules Second (a third Administrator). Seeded CM-5 to CM-7 and cycled CM-1 through two more propose → withdraw rounds.

| Demo | Result | Recording |
|---|---|---|
| D1, duplicates | **Project dashboard** Drafts Pending lists CM-1 **3×**, one row per approval request on 0.1. Each request has `withdrawn=1`, so the SQL fix could filter on it. Home count (30) and the global page (CM-1 ×1) are correct, because the global query joins with `UNION`, which dedupes. | [D1](screenshots/withdrawn-repropose/gap-D1-drafts-pending-duplicates.mp4) |
| D2, Rejected missing | CM-3 (all answered): only View/Edit Last Draft; 0 rows in Drafts Pending; table selection → Bulk Propose disabled. | [D2](screenshots/withdrawn-repropose/gap-D2-rejected-not-in-drafts-pending.mp4) |
| D3, no hint | CM-5 (Jules pending) and CM-3 look identical to the proposer (View/Edit Last Draft only). Jules still gets Approve / Reject on CM-5. | [D3](screenshots/withdrawn-repropose/gap-D3-pending-rejected-no-hint.mp4) |
| D4, approve then reject | **Gap closed.** History reads `[Rejected, Proposed(request), Draft]` with no Routing transition. Both responses (approve, reject) sit on the Proposed transition, so `hasPendingApproverResponses` returns false. Oddity: the Rejected transition's `createdByUserId` is Arlo, although Jules rejected. | [D4](screenshots/withdrawn-repropose/gap-D4-approve-then-reject.mp4) |
| D5, archived | **Gap closed.** CM-7 is Withdrawn, latest version 1.0, `LastVersionId = LastApprovedVersionId = 8`, `deletedAt` set, and no actions today. Both ticket guards block it. | [D5](screenshots/withdrawn-repropose/gap-D5-archived-restore-withdrawn.mp4) |

- Local Cognito rejected both test passwords a day later. Setting them again with `AdminSetUserPassword` fixed it.

### After the change

- (pending)

## Follow-up

- Write any gap found here back into the Cucumber task as an extra step.

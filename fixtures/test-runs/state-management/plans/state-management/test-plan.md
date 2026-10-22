# QI-15267: Test plan (Approve for Archive works end to end), re-run

Status: **executed 2026-10-12, results in `steps.md` (no regressions; S9 clean rerun passes, the first S9 run was a false alarm from forced data).** Data came from `data-setup-plan.md` (snapshot `pristine`). The first run is in `../../old-testing/`.

## Summary
- 12 scenarios: ticket steps 1-6 (S1-S6), ticket edge cases (S7-S12). Each restores `pristine`, has its own video and a before/after DB diff.
- Flag `stateManagementServiceApproveForArchive` ON, verified via `sdk/latest-all` before each session. `Reject` ON.
- Approve on the **record page** as the real approver unless a row says otherwise.
- Pass = expected state change, nothing else changed, no partial mutation on failure, and the legacy behaviour is matched.
- Flag-OFF comparison **only** when a scenario fails or looks odd, in `scenarios/flag-off/`.
- Known bugs are re-checked, not re-filed.

## Per-scenario procedure
1. `db-snapshots/restore.sh pristine`, then `logs/dump-state.sh` → `logs/state-sN-before.txt`.
2. Start Playwright video. Log in (credentials from the localhost helper, never printed; tick the e-sign box before filling the password).
3. Screenshot the target record page before. Run the action. Screenshot dialogs (masked password), result and History.
4. Dump state → `state-sN-after.txt`; save a changed-rows diff. Screenshot the DB checks (`evidence.sh` / `render-diff.py` from the QI-15279 run).
5. Mark ✅/❌ in `steps.md`. Failures get a bug doc in `../../bugs/<slug>/`. No Jira comments or tickets unless asked.

## Scenarios

| # | Ticket ref | Record / actor | Action | Expected | Extra checks |
|---|---|---|---|---|---|
| S1 | Step 1 | UO-1 / Yash | Approve | UO Archived; Step "Archived (Cascaded)"; both gone from active lists | Ryan's notification "approved for archive"; exactly 1 response; History |
| S2 | Step 2 | UO-3 / Yash, then Kons | Approve as Yash, then as Kons | After Yash: Routing; after Kons: Archived with children | Kons's dialog (Routing: email field); response count 1 → 2 |
| S3 | Step 3 | UO-2 / Kons demoted to Standard User (dept Other) | Approve from the record page; if the UI blocks it, send the approve over the websocket from the page (sanitized) | "Unauthorized action. You don't have permission to perform this action." Status unchanged | Stan opens a record (UI-level companion check); no response row written |
| S4 | Step 4 | UO-1 / Yash | Wrong password | "Password is incorrect." Nothing changes | Wrong signing pin → "Signing pin is incorrect." if a pin user exists; credentials checked before permission (wrong password as Kons-demoted should say password, not permission) |
| S5a | Step 5 | MTL-1 / Yash | Approve | MT-a, MT-b, MT-c unlinked: library link cleared, "Project Only" | Archived link (MT-c) included; page of MT-a shows "Use material from library" |
| S5b | Step 5 | MTL-2, MTL-3, MTL-4 / Yash (restore between) | Approve | Blocked with validation error naming the MT; record stays Proposed for Archive | Library and MT rows identical before/after; one run per immutable state |
| S6a | Step 6 | UO-1 / Yash | Add the `ProcessParameters` trigger (`step-06-trigger.sql`, copied from the old run), approve | Error; UO-1 and children unchanged | Parent **and link** tables identical, response count unchanged; drop trigger, retry succeeds |
| S6b | Step 6 | MTL-1 / Yash | Add a trigger that fails on the update of MT-b's library fields, approve | Error; MT-a still linked too (earlier unlink rolled back) | Material library fields identical before/after; drop trigger, retry succeeds |
| S7 | Edge | UO-1 / Yash, two tabs | Approve in tab 2, then again from stale tab 1 | Second attempt refused; 1 response | Error wording ("Only proposed records…") noted |
| S8 | Edge | UO-3 / Yash rejects, then Kons | Reject, then Kons tries to approve | UO-3 Rejected, not archived; other approver's pending item resolved | **Known bug** (approve after reject accepted): confirm still happens, same with flag OFF |
| S9 | Edge | FQA-S / Yash | Approve | FQA-S archived; IQA-S's Linked FQA spec cleared | Spec link gone on IQA-S's own page, not just the FQA's; `IQAToFQALibraries` row status |
| S10 | Edge | IQA-A / Yash | Approve (Warnings Detected → Continue) | SA-1 no longer lists IQA-A; new Sample version | `SampleToIQAs` row soft-deleted; direct archive, not cascade |
| S11 | Edge | IQA-R / Yash | Approve | Risk link gone on PP-R's page; PP-R keeps its other link | **Known bug** (Criticality "Not Assessed"): confirm and note; not re-filed |
| S12 | Edge | SUP, CM, TPP, DOC / Yash | Approve each from its record page | Each Archived cleanly | One restore for all four; DB state per type |

Optional, same restore: UO-5 with children, to re-check the two known cascade bugs (Sample link, stale "Proposed for Archive (Cascaded)" rows).

## Known bugs to watch (from the first run)
- Sample stays linked after a cascaded archive; flag ON only.
- Cascaded children keep a live "Proposed for Archive (Cascaded)" row; flag ON only.
- Approve after reject is accepted; both flows.
- Criticality becomes "Not Assessed" on related records; both flows.

## Out of scope
- Flag-OFF full comparison (needs an exclusive window on a shared environment; local override is fine for failures only).
- Propose for Archive, bulk approve and model cleanup (QI-15255, QI-15281, QI-15279).
- Shared-environment blast radius of Library step 5 (local DB, not applicable).

## Output
- `steps.md` in this folder: env, data table, deviations, snapshots, scenarios, summary (mirrors QI-15274).
- `scenarios/sN/` with before/after dumps and the diff; screenshots and videos per scenario.

## Why this approach
- Ticket text is the yardstick, so scenarios map 1:1 to its steps and edge cases.
- Restoring before every scenario removes the cross-scenario dependency that complicated the first run.
- S3 uses a demoted approver because Standard Users cannot be picked as approvers; a 403 on the page only proves routing.
- S6b adds link-table rollback evidence, which the first run lacked.
- Alternative passed over: throwing in `HandleCalculatedParameterDependentsPlugin` as the ticket suggests. It needs a code edit and revert, while a DB trigger forces the same rollback and leaves no code to revert.

## Open questions
1. Signing-pin user: does one exist or can one be configured for Archivers R US?
2. Can Pending/Obsolete Materials be built locally?
3. Standard User UI vs. websocket for S3: decided at run time.

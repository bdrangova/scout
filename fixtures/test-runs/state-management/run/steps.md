# DEMO-15267: Approve for Archive end to end, re-run (2026-10-12)

Status: **scenarios S1-S12 run (2026-10-12), flag-OFF comparisons done where results looked odd. no regressions (S9 first looked like one, a false alarm from forced data; clean rerun passes). DB restored to `pristine`, flag back ON.**

## Environment
- Company Demo Co (`client_local_DemoCo`), dev stack from `foliant` (Node 22), backend :3000, Vite :8080.
- Flags (LD dev server, via `sdk/latest-all`): `ApproveForArchive`, `ProposeForArchive`, `Reject`, `Withdraw` ON; `stateManagementService`, `ProposeForApproval` OFF. Same as `logs/flag-state-before.txt`.
- Users: Omar 1349 (proposer), Priya 1350 / Dana 1351 (approvers, Administrators), Sam 1352 (Standard User, dept Other).

## Data (ids are DB ids; plan role in brackets)

| Record | Id | State in `pristine` | Approver(s) |
|---|---|---|---|
| Lean UO-1 / UO-2 / UO-3 | UO 31 / 32 / 33 (1 Step each: 5 / 6 / 7, "Proposed for Archive (Cascaded)") | Proposed for Archive | Priya / Dana / Priya+Dana |
| Lean UO-H (host, not archived) | UO 34 | Approved | n/a |
| MTL-1 | LibraryMaterial 3 | Proposed for Archive | Priya |
| MT-a / MT-b / MT-c (MTL-1) | Material 15 Synced Draft / 21 Linked Approved / 22 Linked then Archived | as listed | n/a |
| MTL-2, MT-d | LibraryMaterial 4, Material 23 | Proposed for Archive, Proposed | Priya |
| MTL-3, MT-e | LibraryMaterial 5, Material 24 | Proposed for Archive, Routing (Priya+Dana, none responded) | Priya |
| MTL-4, MT-f | LibraryMaterial 6, Material 25 | Approved (not proposed for archive), Proposed | n/a |
| Extra Synced drafts on MTL-1..4 | Materials 16-20 | Draft | n/a |
| IQA-S + Linked FQA spec | IQA 19 -> FQA 21 (`IQAToFQALibraries` row 1) | both Proposed for Archive | Priya |
| IQA-R | IQA 25 | Proposed for Archive | Priya |
| IQA-A + SA-1 | IQA 26, Sample 2 (`SampleToIQAs` row 2) | IQA Proposed for Archive, Sample Draft | Priya |
| SUP | Supplier 10 (new) | Proposed for Archive | Priya |
| CM | ControlMethod 6 (new) | Proposed for Archive | Priya |
| DOC | Document 2 (DOC-R-1) | **Proposed, not archivable (see gap 1)** | n/a |

Baseline: `logs/state-pristine.txt` (via `logs/dump-state.sh`). Restore: `db-snapshots/restore.sh pristine`; new snapshots: `db-snapshots/snapshot.sh <prefix>`. Restore round trip verified (dump identical).

## Deviations from `data-setup-plan.md`
1. **SQL plumbing** (`logs/db-plumbing.sql`): supplier qualification dates pushed forward ("Expired Qualification" blocks propose); `IQAToFQALibraries` Linked spec inserted (IQA 19 has no Drug Product/Substance, which the link handler requires); spec status restored to 'Linked' after the IQA-19 archive proposal reset it (gap/finding 4).
2. **SUP / CM**: Supplier A and CDMO, and CM-4/CM-5, are referenced by process records and cannot be proposed for archive. A new unused Supplier 10 and Control Method 6 were created in the UI, proposed, approved by Priya, then proposed for archive.
3. **TPP dropped from S12**: TPP sections have no standalone archive path (only a parent reference for FQA archive).
4. Lean MT-c was archived in the UI and the archive approved (record 22, soft-deleted, "Project Only" but keeps `libraryMaterialId`).
5. Old projects 1 and 2 still hold pending approvals for Priya (~39 rows in bulk approval). Use record pages in scenarios.
6. Rich project was approved in bulk after a stack restart (see gap 1); 23 of 24 records approved, Document excluded.

## Gaps and findings
1. **Document approval blocked (needs a decision).** `muhammara` (PDF stamping) has no native binding for Node 22 in `foliant`; `foliant2` has one built for Node 20. npm's allowScripts policy blocks the install script, and I did not override it. S12's Document row can't run until it is built (`npm install-scripts approve muhammara` + `npm rebuild muhammara`) or it is accepted as a gap.
2. **Pending/Obsolete Materials unreachable.** Tried a bulk approve of MT-25 with the failing Document: both rolled back cleanly and stayed Proposed. S5b covers Proposed and Routing; MTL-4 stays Approved with MT-25 Proposed (duplicate of MTL-2).
3. **Possible rollback inconsistency (legacy bulk approve).** The first failed Rich bulk approve (25 failed) left 7 IQAs "Pending" (cleared by re-approving). The later two-record failure rolled back cleanly. Worth a look when S6 runs.
4. **Archive proposal rewrites the FQA spec link.** Proposing IQA-19 for archive (flag ON) set `IQAToFQALibraries.status` and the linked-version row to NULL (`updatedAt` matches the proposal). Verify in S9 whether the spec still shows as linked; not filed.
5. Signing-pin user: not found; S4 pin variant stays a gap.
6. S11 data note: IQA 25's PPs (62-68) link only to IQA 25, so "PP keeps its other link" can't be checked on it. IQA 26's PPs (69-76) also link to IQA 27/28, so S11 can run on IQA 26 (restore between S10 and S11) or accept single-link on IQA 25.

## Snapshots (`db-snapshots/`)
`safety-before` (before any change), `rich-imported`, `lean-built`, `pre-pending-attempt`, **`pristine`**.

## Scenarios
Run in 5 batches, one restore each (A UO flow, B permission, C reject/rollback, D library, E project records, F clean S11). Evidence in `scenarios/<batch>/` (screenshots, `state-*.txt` dumps, `db-diff.png`); one continuous video `scenarios/A/video-batch-A.webm`. Flag-OFF comparison runs in `scenarios/flag-off/`. Backend console tap: `scenarios/backend-tap-from-batch-B.log`.

| # | Result | Observed |
|---|---|---|
| S1 UO-1 / Priya | ✅ | UO Archived (new version 1.1), Step "Archived (Cascaded)", gone from the Process Explorer tree. 1 new response. Omar got "Approval response" email (tap log). Extra open archive request + "Proposed for Archive" transition on the new version: **identical with flag OFF**. |
| S2 UO-3 Priya, then Dana | ✅ | After Priya: Routing (Step "Routing (Cascaded)"), 1 response. After Dana: Archived + Steps archived. Dana dialog had the email field. Responses 1 to 2 (Priya's stays on v1.0, Dana's on v1.1). |
| S3 demoted Dana | ✅ parity, wording differs | Record page: 403 "Access denied.", no Approve button. Over the websocket: wrong password "Invalid password" (400, checked first), correct password "Access denied." (403). DB unchanged. **Identical with flag OFF.** Ticket's "Unauthorized action. You don't have permission..." text is never produced on this path. Sam can't log in locally (Auth service rejects the helper password), demoted Dana covers the Standard User case. |
| S4 wrong password | ✅ | UI: "Password is incorrect.", dump identical. Server (websocket, S3): "Invalid password". Pin variant: no user has a signing pin, gap. |
| S5a MTL-1 | ✅ | Run as the retry of S6b. MTL-1 Archived; Materials 15, 16, 17 (Synced) and 21 (Linked) now Project Only, library link cleared, new versions; archived MT-22 unchanged. MT-15 page offers "Use material from library". |
| S5b MTL-2, MTL-3 | ✅ | Blocked: "You cannot modify MT-23/MT-24 ... because it is in pending, proposed, or obsolete state." Dump identical. MTL-4 had no archive proposal, Pending/Obsolete stays a gap. |
| S6a UO-1 trigger | ✅ | Trigger on `Steps` (UO-1 has no PPs in the lean project). "Unexpected error: DEMO-15267 forced failure (test trigger)". Dump, version/request/transition/response counts identical. Retry after drop: Archived. |
| S6b MTL-1 trigger | ✅ | Trigger fails when MT-21 is unlinked. Error shown, dump identical incl. MT-15's library fields (earlier unlink rolled back). Retry after drop succeeded (= S5a). |
| S7 stale tab | ✅ | Run on UO-2 as Dana (UO-1 was used by S1). Second attempt: "Only proposed records can be approved." 1 response, 1 version added. |
| S8 reject then approve | ✅ known bug re-confirmed | Priya reject: UO-3 and Step "Rejected". Dana still gets an enabled Approve button, his approval is accepted and recorded (response approve=1) while the UO stays Rejected. **Flag OFF re-run: identical** (UO-3 Rejected, Dana's approval recorded, state stays Rejected; `scenarios/flag-off/`). |
| S9 FQA-24 (clean rerun) | ✅ | Approved IQA-27 with a Linked spec to Approved FQA-24; Omar proposed FQA-24 for archive, Priya approved. Flag ON and OFF identical: FQA Archived, `IQAToFQALibraries` status NULL, IQA-27 re-versioned (v96 Draft), link block gone on its page. Evidence `scenarios/S9-clean/` (red-box markup, raw in `raw/`, DB in `on-db.txt` / `off-db.txt`). **First attempt (FQA-21 / IQA-19) was a false alarm:** IQA-19 was itself Proposed for Archive, and its spec link status had been forced back to 'Linked' by my SQL (`db-plumbing.sql`). Propose-for-archive nulls that status by design (`NullIQAAssociationsOnArchivePlugin`), and `UnlinkFQASpecsOnArchivePlugin` skips IQAs in a proposed state (`SKIP_UNLINK_STATES`), so flag ON left the forced 'Linked' row. Evidence kept in `scenarios/S9-forced-link/`. |
| S9b IQA Proposed for Archive when its FQA is approved | ❌ differs from legacy (bug, see `../../bugs/approve-for-archive-fqa-spec-not-unlinked-from-proposed-iqa/`) | Natural data: link status NULL (as propose leaves it, no forced 'Linked'). **Flag ON:** FQA-21 Archived, IQA-19 untouched (v83, link NULL), Approve enabled; Priya's own approval then archives IQA-19 (v95, link rows NULL). **Flag OFF (legacy):** FQA-21 Archived but IQA-19 gets a new v1.1 ("FQA-21 - Assay unlinked as part of the archival of the related record"); the page opens on v1.0 where Approve is greyed out; with 1.1 selected Approve is enabled (re-run 2026-10-12, `off-2a`/`off-2b`). The plugin's skip is intentional in the code, but it drops the legacy 1.1 version/history entry (parity gap);  Evidence `scenarios/S9-iqa-proposed/` (raw in `raw/`, dumps `state-s9n-*.txt`). Not run: IQA-19 approval with flag OFF. |
| S9c IQA Proposed / Routing when its FQA is approved (FQA-24, IQA-29 / IQA-28; IQA-27 Approved control) | ❌ differs from legacy (extends the bug, see `../../bugs/approve-for-archive-fqa-spec-not-unlinked-from-proposed-iqa/`) | Reached through the UI: IQA-29 Proposed (Priya), IQA-28 Routing (Priya approved, Dana pending); link rows to FQA-24 inserted by SQL (`db-plumbing.sql`). Dana approved the FQA-24 archive, then Dana/Priya approved the two IQAs. **Flag ON:** FQA Archived, IQA-27 gets the "unlinked" version (Draft v97), IQA-28 / IQA-29 untouched. After their own approvals (IQA-28 v2.0, IQA-29 v1.0) both are Approved and their spec link is still 'Linked' to the archived FQA-24 (DB, and the "Linked to Final Quality Attribute ... FQA-24" strip on the page); nothing clears it. **Flag OFF:** IQA-27 same as ON; IQA-29 gets a new Proposed version "FQA-24 ... unlinked as part of the archival of the related record", IQA-28 (Routing) is reset to Proposed with a new approval request (Priya's approval has to be given again); links NULL; after approvals both Approved, no link strip. Evidence `scenarios/S9-iqa-states/` (marked screenshots, `raw/`, `state-*.txt`). |
| S9d IQA Pending / Proposed for Restore when its FQA is approved (IQA-20 / IQA-36) | ⚠️ partly tested, states forced | Not reachable through the UI here: IQA-20's dependency IQA-25 is Proposed for Archive ("Record Status" blocks the proposal), archiving IQA-36 is the canvas flow. States set by SQL (`db-plumbing.sql`), no valid approval-request transition. **Flag ON:** both skipped, untouched, link stays 'Linked' (the skip is by state, so valid for these states). **Flag OFF:** FQA-24 approval fails with "Unexpected error: Cannot read properties of null (reading 'approvalRequest')" (`editables_helper.js` `executeActionAndSaveRecord` via `unlinkFQASpecsWhenArchiving`, `scenarios/S9-iqa-states/backend-tap-off-full.log`); with IQA-20/36 unlinked again it works (S9c). Most likely an artifact of the forced data, not a finding. Legacy behaviour for real Pending / Proposed for Restore IQAs is unverified. |
| S10 IQA-26 | ✅ (no warnings dialog) | IQA Archived, `SampleToIQAs` row soft-deleted, Sample gets new version 0.2, PP links to IQA-26 soft-deleted while PPs keep IQA-27/28. Side effect, same in both flows: related IQA-25 gets a new version with a copied archive request, and its page opens on the old version where Approve is greyed (not re-checked with the latest version selected). |
| S11 IQA-25 | ✅ known bug | Run on a clean restore (S10 breaks it). IQA Archived, links of PP-62..68 soft-deleted, PP-62 Criticality 5 / 5% to "Not Assessed" (flag OFF identical, full dump identical). Side effect, both flows: related IQA-19 re-versioned (page opens on the old version, Approve greyed; not re-checked on the latest version). |
| S12 SUP, CM | ✅ | Supplier 10 and Control Method 6 Archived. Document: gap (muhammara). TPP dropped. |

## Results
- **S9:** no regression. The first run used an IQA that was Proposed for Archive with a hand-forced 'Linked' spec; the clean rerun (Approved IQA) is identical with flag ON and OFF.
- **S9c (new):** with flag ON an IQA that is Proposed / Routing is skipped and, after its own approval, stays Approved with a spec link to the archived FQA; legacy re-versions and unlinks it. Same cause as S9b (`SKIP_UNLINK_STATES`), worse consequence than S9b: the assumption that the IQA's own approval cleans the link does not hold. Proposed for Archive (S9b), Proposed, Routing covered; Pending / Proposed for Restore only skip-side (forced).
- **Parity, existing bugs:** S8 approve-after-reject, S11 Criticality "Not Assessed". The "disabled Approve" I noted on re-versioned related IQAs (S10/S11) was probably the page opening on the older version, where Approve is greyed out; not verified, see S9b.
- **Wording difference (S3):** ticket text "Unauthorized action..." never appears, both flows return "Access denied." (403).
- **Gaps:** Document row (S12), Pending/Obsolete Material (S5b), signing pin (S4), Sam login, Omar's email in S1 was seen in the tap log of the parity run only.
- Flag-OFF comparisons done for S1, S3, S8, S9, S10, S11 (all identical).

## Plumbing for the scenarios
`logs/step-06a-trigger.sql` (Steps), `logs/step-06b-trigger.sql` (Materials), `logs/run-sql.sh`, `logs/render-batch.sh`, `logs/flag-changes.txt`, Dana demotion SQL in `logs/db-plumbing.sql` (common DB, reverted). Websocket replay of the approve frame was done from the page (token and password never printed).

# DEMO-15267: Data setup plan (Approve for Archive, end to end), re-run

Status: **Executed 2026-10-12, see `steps.md` for real ids and deviations (supplier/CM replaced, TPP dropped, Pending/Obsolete and Document gaps).** Original draft below. The first run (2026-10-05) is in `../../old-testing/`; its data setup doc was lost, so this one is written to be reproducible.

## Summary
- **Company:** Demo Co (`client_local_DemoCo`). Users from `1-setup-A.feature:10-13`: Omar (proposer), Priya and Dana (approvers), all Administrators; Sam (Standard User, dept Other).
- **Two projects, both new:**
  - **Lean** (built in the UI): 3 UOs with exactly one Step each, plus a host UO for Library-linked Materials. Keeps cascades small and approvals fast.
  - **Rich** (`ACETabletsWithSteps.xlsx` via `archive_approve_pipeline_setup.feature`): IQA/FQA/PP/Supplier/CM/TPP for the cleanup families.
- **Extras built in the UI:** Library Materials with linked project Materials in every state, a Document, a Sample linked to an IQA, an IQA with a Linked FQA spec.
- **Flags:** `ApproveForArchive`, `ProposeForArchive`, `Reject`, `Withdraw` ON; `stateManagementService`, `ProposeForApproval` OFF. Verify via `sdk/latest-all`.
- **Everything proposed for archive before the snapshot**, then `pristine`. Each scenario restores `pristine` first, so one record can serve several scenarios.
- Folder layout mirrors DEMO-15279: `db-snapshots/`, `logs/`, `data-setup/{screenshots,videos}`, `scenarios/`, `steps.md`.

## Data table (proposer Omar; all end as Proposed for Archive unless stated)

### Lean project "DEMO-15267 Lean"

| Record | Content | Approvers | Used by |
|---|---|---|---|
| UO-1 | 1 Step | Priya | S1 approve + notification, S3 wrong password, S6 rollback, S8 double approve |
| UO-2 | 1 Step | Dana | S4 Standard User (Dana demoted at run time) |
| UO-3 | 1 Step | Priya + Dana | S2 Routing walk, S7 reject |
| UO-H | host UO, **not** archived | n/a | host for the Materials below |

### Library Materials (host UO-H; library records must be Approved before project Materials can link)

| Library Material | Linked project Materials | Approvers | Expected on approve |
|---|---|---|---|
| MTL-1 | MT-a Synced, Draft · MT-b Linked, Approved · MT-c Linked, then archived earlier | Priya | MT-a/b/c unlinked to "Project Only" (MT-c is soft-deleted, `paranoid: false`) |
| MTL-2 | MT-d Proposed | Priya | Blocked, nothing changes |
| MTL-3 | MT-e Routing (two approvers, one responded) | Priya | Blocked |
| MTL-4 | MT-f Pending, or Obsolete if reachable | Priya | Blocked (see risks) |

### Rich project "DEMO-15267 Rich" (import)

| Record | Content | Purpose | Approvers |
|---|---|---|---|
| IQA-S | IQA with **Linked FQA spec** to an FQA | FQA spec cleanup family | Priya |
| FQA-S | the FQA IQA-S links to | archive target for the spec link | Priya |
| IQA-A | IQA with Sample SA-1 linked as assay/reportable (SA-1 in an unarchived host UO) | Sample cleanup, **direct** archive (not cascade) | Priya |
| IQA-R | IQA linked from PP-R; PP-R also keeps a link to another IQA | Risk link cleanup | Priya |
| SUP, CM, TPP, DOC | one each, Approved | Archive per type | Priya |
| UO-5 with children (existing import) | cascade | optional re-check of the known cascade bugs | Priya |

## Steps
1. Create run folder + subfolders. Copy `restore.sh` from `../../old-testing/demo-15267-approve-archive-20261005-2111/db-snapshots/`.
2. **Safety dumps:** `client_local_DemoCo` and the Omar/Priya/Dana/Sam rows of the `core-local` Users table (roles live there, not in the client DB). The DEMO-15281 run used the same company, so the current DB probably holds its state.
3. **Base DB:** check the old `pristine-client_local_DemoCo.sql` for approval requests and projects. If it is only the post-import state, restore it. Otherwise drop the company and run `archive_approve_pipeline_setup.feature` (build-tool).
4. Check flags via `sdk/latest-all` → `logs/flag-state-before.txt`. Read-only DB check → `logs/db-state-before.txt`.
5. As Omar (Playwright, recorded video), build the Lean project: UO-1/2/3 with one Step each, UO-H.
6. Library: create MTL-1..4 and a qualified supplier, approve them (bulk propose, Priya approves). Create the project Materials from `/library/projectMaterials/create.html?projectId=<id>` (Sync ON = Synced, OFF = Linked), host UO-H. Move each MT to its target state:
   - MT-a: leave Draft.
   - MT-b: propose, Priya approves.
   - MT-c: propose, approve, then archive and approve the archive.
   - MT-d: propose, leave pending.
   - MT-e: propose with Priya + Dana, Priya responds.
   - MT-f: try Pending/Obsolete.
7. Rich project: run the setup feature. Fix blockers (expired supplier qualifications, `componentQualified`, empty risk-link justifications) only through a documented `logs/db-plumbing.sql`.
8. Build the gaps in the UI: Document, Sample SA-1 → IQA-A, Linked FQA spec on IQA-S, IQA-R/PP-R links.
9. Bulk propose and approve the records that must be Approved first (library, IQA-S/FQA-S, IQA-A, IQA-R, SUP, CM, TPP, DOC).
10. Propose for Archive with the approvers in the tables (Process Explorer tree → right-click → Archive; record/list "…" → Archive for library and other types).
11. Run `logs/dump-state.sh` for baseline: parent states per type, approval requests/responses, and link tables (`SampleToIQAs`, `ProcessParameterToIQAs`, `IQAToIQAs`, `IQAToFQAs`, `IQAToFQALibraries`, Material library fields).
12. Snapshot as `pristine`. Never overwrite; later snapshots as `after-<scenario>-*`.

## Risks
- **Pending/Obsolete Materials** may have no UI path locally. If so, S5 covers Proposed and Routing only, and Pending/Obsolete stay a documented gap (unit-test covered).
- **Linked FQA spec** may not be creatable in the UI. Fallback: a documented `INSERT` into `IQAToFQALibraries` with status Linked.
- **Supplier qualification** blocks Library/Material creation and proposal (expired dates, "Qualified = Yes"). Fix per `nav-link-project-material-from-library`.
- **Standard User approving:** the archive approver picker hides Standard Users, so Dana is demoted *after* proposing. Project access may need a `UserToProjects` row (see DEMO-15281 plan).
- **Signing pin:** no known Demo Co user with a pin. Check the company/user setting during setup; if absent, the pin variant of S3 stays a gap.
- **Never open a Process Explorer table view** (console flood crashes the browser); use the tree.
- Proposing an IQA/PP/MA needs at least one risk link with a justification.

## Why this approach
- A restorable, documented `pristine` fixes the first run's two weaknesses: lost setup doc and scenarios sharing one DB.
- Lean UOs make approvals fast and DB diffs readable; the rich import is only for cleanup families that need real links.
- Per-scenario restore means one record can serve several scenarios, so the data table stays small.
- Alternatives passed over:
  - Reuse old `pristine-v2`: undocumented plumbing, and it lacks the gaps found in the review.
  - A new `@localOnly` setup feature for everything: reproducible, but needs a build-tool run and the same UI work for Library, Sample and FQA spec data.

## Decisions to confirm
1. Base DB per step 3 (restore old `pristine` vs. drop and re-import).
2. Lean project built in the UI rather than a new spreadsheet.
3. Pending/Obsolete and signing-pin variants are best effort.

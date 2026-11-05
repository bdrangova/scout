# Propose Withdrawn and Rejected records without editing first

## Summary

- Withdrawn, Withdrawn (Cascaded), Rejected and Rejected (Cascaded) records can be proposed directly from the editor, quick panel and table toolbar. No edit, no new version.
- Server: an explicit proposable-states set (Draft + those four) and `workflow_config` entries. Remove Rejected / Rejected (Cascaded) from both "cannot propose" lists.
- Rejected only becomes proposable once the rejection is final. Re-proposing while other approvers still have a pending response must close the old approval request first (decision below).
- Two guards apply to all four states: archived records and records still on their approved version stay non-proposable without an edit.
- Drafts Pending: no duplicate rows. Whether to list Rejected records there is an open question.

## Description

After a proposal is withdrawn or rejected, users must click Edit, which creates a new draft version, then Propose. When the data hasn't changed, the extra version is noise in history and an extra step.

**Baseline on `master` (2026-10-21, [03-playwright-verification.md](03-playwright-verification.md), recording `baseline-master.mp4`):**

| | Withdrawn | Rejected |
|---|---|---|
| Record page | Only "Edit Last Draft" | Only "View / Edit Last Draft" (also when another approver is still pending) |
| Table toolbar bulk Propose | Disabled | Disabled |
| Drafts Pending | Listed; proposing from there **already works**, on the same version. Duplicate rows after two withdrawals. | Not listed |
| Single-record REST propose | **Succeeds**, same version (state management flag most likely off) | **400** "You cannot propose a Rejected record." |

So Withdrawn is mostly a client-side change. Rejected also needs server changes and has open-approval-request semantics that Withdrawn doesn't have.

## Decisions needed

- **Rejected with approvers still pending:** recommended: allow, and the new proposal closes the old approval request (marked withdrawn with an automatic comment). Alternative: block until everyone has responded.
- **Record still on its approved version:** block (recommended, matches legacy), or allow a no-op re-propose?
- **Cascaded children (Withdrawn / Rejected):** proposable on their own (this ticket's assumption, per Bojana), or only together with their parent?

## Open questions

- **Include Rejected records in Drafts Pending?** Today the list only shows records whose version has no approval request yet, or that are Withdrawn. Rejected records are never listed.

## Phase 1: Server

### Acceptance Criteria

- Proposing a Withdrawn, Withdrawn (Cascaded), Rejected or Rejected (Cascaded) record succeeds:
  - with `StateManagementServiceProposeForApproval` on and off;
  - for single-record (RMP) and bulk proposals.
- The record keeps its version; history shows a new Proposed transition on that version.
- **Rejected with an open approval request** (some approvers haven't responded): handled per the decision below. Either it is blocked with a clear error, or the old approval request is closed (marked withdrawn, with an automatic comment) in the same transaction before the new one is created. Late responses to the old request are then refused.
- Proposing an archived record in any of the four states without edits fails with a clear error on both paths. These come from a withdrawn or rejected **restore** proposal.
- Proposing a record in any of the four states that is still on its approved version (`LastApprovedVersionId === LastVersionId`) without edits fails on both paths with the existing "At least one field needs to be modified…" message. These come from a withdrawn or rejected **archive** proposal.
- Drafts Pending shows each record once, however many approval requests its version has. Whether Rejected records are listed depends on the open question below.

### Technical Notes

- **Proposable states set:**
  - New `stateManagement/configuration/propose_for_approval_states.js`, modelled on `propose_for_archive_states.js`.
  - `workflow_config.js`: add `[ACTIONS.PROPOSE]: WORKFLOW_PROPOSE` under `WITHDRAWN`, `WITHDRAWN_CASCADED`, `REJECTED_CASCADED` and `REJECTED`. `REJECTED` already holds `PROPOSE_FOR_ARCHIVE`, `APPROVE_FOR_ARCHIVE` and `REJECT`; keep those.
  - Optional `ValidateStateForProposePlugin` in `workflow_propose.js`, placed like `ValidateStateForProposeArchivePlugin` (`workflow_propose_archive.js:44-47`). It holds the guards, so `MULTIPLE` (bulk) is covered too.
- **Rejected is blocked today** in two lists:
  - `validate_instance_version_plugin.js:164-178` (`invalidStatesForPropose`).
  - Legacy `utils/helpers/validation_helper.js:309-337` (lines 311-312). This is where the baseline's "You cannot propose a Rejected record." comes from.
  - Remove both states from both lists.
- **A Rejected approval request stays open:**
  - Other approvers can still respond: `validation_helper.js:370-382` accepts approve/reject on `REJECTED` / `REJECTED_CASCADED`, and `workflow_config` keeps `APPROVE_FOR_ARCHIVE` / `REJECT` on `REJECTED`.
  - A rejection can be flipped back to Routing (`version_hooks.js` `shouldCreateNewVersionTransition`, Rejected↔Routing).
  - The client already treats Rejected as final only when `allUsersHaveResponded || isUserOriginator` (`approval_container.jsx:1669-1670`).
  - Re-proposing on the same version while the old request is open would leave two live approval requests on one version. Closing the old one can reuse `update_approval_request_plugin.js`, the same `withdrawn = true` marking that withdraw uses.
- **Versioning:** Rejected → Proposed is a state-only change. The hook creates a new transition on the same version (`version_hooks.js:261-297`; `shouldCreateNewVersionTransition` only special-cases Routing↔Rejected and Archived/Restored).
- **Cascaded states:**
  - Rejected (Cascaded) comes from rejecting a parent's archive/restore proposal (`cascade_rejection_to_children_plugin.js`). Like Withdrawn (Cascaded), these children never had their own approval request, and they may be archived.
  - `validation_helper.js:1437` refuses to restore a `REJECTED_CASCADED` record.
- **Legacy path:** add the guards next to `validation_helper.js:309-337`. The archived check in `editables_add_or_edit_request_handler.js:817-822` only runs when the record was modified.
- **Drafts Pending:** `getDraftsPending` (`utils/helpers/approval_helper.js:612-630`) LEFT JOINs approval requests on `VersionId`. Use `NOT EXISTS` / the latest transition to drop duplicates. Adding `Rejected` / `Rejected (Cascaded)` to the state filter depends on the open question below. Today rejected records never appear there, because they always have an approval request and aren't in the filter (baseline R8).
- **Same version, several transitions** (Proposed → Withdrawn/Rejected → Proposed):
  - Approval-request lookups use the latest transition (`editables_approval_loader.js:207-223`, `editables_withdraw_request_handler.js:136-144`).
  - Check the withdraw/reject email recipients (`email_sender.js:761-775`) and the history tooltips.

### Test Notes

- **Unit:**
  - `workflow_config.test.js`: all four new entries.
  - The validator plugin: guards × four states, plus the open-approval-request rule for Rejected.
  - `validate_instance_version_plugin.test.js`: Rejected is no longer in the invalid list.
  - The legacy `validation_helper` guards.
  - `getDraftsPending` SQL: no duplicates, Rejected included.
- **Integration:**
  - Extend `withdraw_workflow_integration.test.js` with withdraw → propose on the same version.
  - Add reject → propose, both with all responses in and with one pending.

## Phase 2: Client

### Acceptance Criteria

- The proposer sees an enabled Propose button in the editor and quick panel on the latest version, outside edit mode, for:
  - Withdrawn and Withdrawn (Cascaded) records;
  - Rejected and Rejected (Cascaded) records, subject to the open-request decision.
- An approver who hasn't responded to a Rejected record still sees Approve / Reject, as today.
- The table toolbar's bulk Propose counts all four states as proposable.
- Propose stays hidden or disabled for the two guarded cases, with a tooltip.
- Edit still works. The edit-then-propose flow is unchanged.

### Technical Notes

- `client/editor/approval/approval_container.jsx`:
  - `canUserPropose` (line 1630) accepts the proposable states.
  - `isModifiable` (1659-1671) no longer excludes the two Withdrawn states or `REJECTED_CASCADED`. For `REJECTED`, it is no longer false for the originator, so the originator gets Propose.
  - `isDraft` (1680) and the Propose vs Approve/Reject branch (1212-1246) need care for Rejected: the originator gets Propose, and pending approvers keep Approve/Reject.
  - Update the "Only the current draft can be proposed" tooltip (1227).
- `client/utils/render_options.js:188-207` duplicates this logic. Change both, ideally through one shared helper in `common_utils.js` that the server set also uses.
- `configurableTables/tables/widgets/topBar/toolBar/edit/edit_table_tool_bar.jsx:45-50`: filter on the proposable states instead of `"Draft"`.
- The bulk wizard already accepts all four states (`CommonUtils.isDraft`), so no change there; today the server rejects the two Rejected states after the wizard. The older `bulk_proposal_page.jsx:168-174` only accepts Draft and the two Withdrawn states, so add the two Rejected states if that page is still reachable.
- RMP uses `ApprovalRequestPopup` → `handleSendApprovalRequest`, the single-record path that hits `workflow_config` with `currentState`.

### Test Notes

- Client unit: the proposable/modifiable helpers for every state, plus Rejected × (originator, pending approver, responded approver).
- E2E: Cucumber, see [02-cucumber-test-task.md](02-cucumber-test-task.md). Live checks before the PR: [03-playwright-verification.md](03-playwright-verification.md).
- Existing E2E that edit first after a withdraw or reject (`suppliers.feature:183-215`, `control_methods.feature` ~161 and ~236, `suppliers.spec.ts`, `control_methods.spec.ts`) keep passing; the edit path is unchanged.
- `archive_4.feature:211-226` (archived withdrawn record, no Edit) must still pass and should also assert no Propose.


## Why this approach

- Why change it? Withdraw/Reject → Edit → Propose adds a version with no data change.
- Why do both states need server work? Withdrawn is only blocked on the single-record path when the state management flag is on. Rejected is blocked on both server paths.
- Why an explicit state set? The rule is spread across `workflow_config`, two validator lists, two client copies and the table toolbar. One set prevents drift, like propose-for-archive.
- Why special handling for Rejected? Its approval request can still collect responses, so a same-version re-propose must not leave two live requests.
- Root: treat a withdrawal or a final rejection as "back to proposable", without inventing a version.

Alternatives passed over:
- **Client-only change:** Rejected stays blocked on the server, the single-record path breaks for Withdrawn when the flag is on, and the guards are missing.
- **Auto-create a new version on propose:** keeps today's version noise, which is the problem being solved.
- **Only expose it through Drafts Pending:** users can't find it from the record they just withdrew or saw rejected.

## Relationships

- Related: state management service propose/withdraw/reject migration (`StateManagementServiceProposeForApproval`, `StateManagementServiceWithdraw`, `StateManagementServiceReject` flags).
- Pre-existing bug found nearby (separate ticket): `editables/editables_helper.js:2431` uses `=` instead of `===` in a filter, which matches everything and mutates transition ids.

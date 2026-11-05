# Test Task: Propose Withdrawn and Rejected records without editing (Cucumber) — 2026-10-21

**Verifies:** [01-withdrawn-repropose.md](01-withdrawn-rejected-repropose.md) (no Jira ticket yet)
**PR:** —

## Summary

- This is the committed E2E coverage.
  - **Withdrawn:** extends 5 existing features at the point where they already withdraw, plus 1 new scenario for Drafts Pending.
  - **Rejected:** extends 2 existing features at the point where they already reject, plus 1 new scenario for a rejection with an approver still pending.
  - No new seeding.
- Reuses existing steps:
  - `I verify that the "Propose" button is visible|invisible|disabled`
  - `I click the propose button expecting to be taken to the bulk propose wizard…`
  - the withdraw and reject steps
  - `I verify history version "x" is in state "…"`
- New steps are likely needed only for "same version" history checks and for counting Drafts Pending rows.

## Context

Withdrawn, Withdrawn (Cascaded), Rejected and Rejected (Cascaded) records become proposable without an edit, except archived ones and ones still on their approved version. A Rejected record with an approver still pending follows the ticket's decision. See the ticket.

## Justification

The rule is spread across four client gates and two server paths. The features below already build each state (withdrawn draft, cascaded withdrawal, withdrawn restore, withdrawn RMP, rejected draft, cascaded rejection), so asserting at those points is cheap and keeps the suite in sync with the change.

## Existing Coverage

- **Unit:** none either way. New `workflow_config` and validator specs come with the ticket.
- **e2e:** every withdraw or reject scenario currently continues with Edit → Propose. Nothing asserts Propose is hidden right after a withdraw, so no existing step should break. Re-check `quick_panel_2.feature:17-172` (editability of withdrawn records) during the run.

## Setup

- Each feature's own Background and users. Nothing new.
- Locally: one scenario per run, `SKIP_SETUP=true`.
- Flags: run 3 (RMP) and 5 (approved version) with `StateManagementServiceProposeForApproval` both on and off. Locally, use the `launchdarkly-dev` skill.

## Automated

### 1. `suppliers.feature`: "Propose, Withdraw, Propose again…" (~line 183)

- After `shows up in the static panel in state "Withdrawn"`, add `Then I verify that the "Propose" button is visible`.
- Add a direct re-propose before the existing Edit block:
  - Propose → wizard → approver, description → Submit → Confirm.
  - Verify state "Proposed" and that history has no new version.
  - Withdraw again.
- The existing edit → propose flow then continues unchanged, which keeps regression coverage of the edit path.

### 2. `control_methods.feature`: "Propose, Withdraw, Propose again" (~line 161)

- Same as 1, done from the Control Methods table to exercise the **toolbar bulk Propose**:
  - Select the withdrawn row → verify the bulk Propose button is enabled → propose.
  - Verify "Proposed" on the same version.

### 3. `rmp/rmp_2.feature`: "I can add/propose/withdraw/approve/archive/restore an RMP" (~line 335)

- After the existing withdraw:
  - `I verify that the "Propose" button is visible`.
  - `I click the propose button` → approvers → send.
  - Verify "Proposed" on the same version.
- This is the single-record `ApprovalRequestPopup` path that throws today when the state management propose flag is on.

### 4. `archive/archive_6.feature`: cascaded withdrawal (~line 152-194)

- After `Bowl temperature` is verified as `Withdrawn (Cascaded)`:
  - Open it in view → `I verify that the "Propose" button is visible`.
  - Propose → wizard → Submit.
  - Verify history version "0.1" is in state "Proposed".
- Verify `Fat mixing time` is still `Withdrawn (Cascaded)` and the Unit Operation is still `Withdrawn`.

### 5. Guards

- **Archived withdrawn record:** in `archive/archive_4.feature:211-226`, after `I verify that the "Edit" button is invisible`, add `And I verify that the "Propose" button is invisible`.
- **Withdrawn on an approved version:** in `archive/archive_6.feature` (or a short new scenario next to it):
  - Approve a record, propose it for archive, then withdraw.
  - Verify Propose is invisible or disabled, per the ticket's decision.
  - Edit → change a field → Propose works.

### 6. New scenario: `bulkApprovePropose/bulk_proposal_1.feature`, Drafts Pending dedupe

- Propose → withdraw → propose → withdraw the same draft.
- Project dashboard: the record appears once in Drafts Pending.
- Select it → bulk Propose → submit → "Proposed".

### 7. Rejected

#### 7a. `control_methods.feature`: reject, then fix and re-propose (~line 236)

- After `the latest version is "0.2" in state "Rejected"`, the scenario logs out and logs back in as the proposer.
- Before the existing `click the edit button on the action menu`, add:
  - `Then I verify that the "Propose" button is visible` on the view page.
  - A direct re-propose → verify "Proposed" with the latest version still "0.2".
  - The approver rejects again, so the existing edit → fix → propose flow continues unchanged.
- Also select the rejected row in the table and verify the bulk Propose button is enabled.

#### 7b. `archive/archive_7.feature`: cascaded rejection (~line 166-193)

- After a child is verified as `Rejected (Cascaded)`:
  - Open it → `I verify that the "Propose" button is visible`.
  - Propose → verify history version "0.1" is in state "Proposed".
- The sibling child stays `Rejected (Cascaded)`.

#### 7c. New scenario: rejected with an approver still pending

Place it next to 7a in `control_methods.feature`, or in `proposeWizard/`.
- Propose to two approvers; the first rejects, the second hasn't responded.
- As the proposer: Propose is visible → re-propose (per the ticket's decision: allowed, and the old request is closed).
- As the second approver: the old request no longer offers Approve / Reject, and the new request does.
- History: one version, transitions Proposed → Rejected → Proposed.

#### 7d. Rejected guards

Same shape as section 5:
- **Rejected restore proposal (archived):** Propose is invisible.
- **Rejected archive proposal on an approved record:** Propose is invisible or disabled per the decision.

#### 7e. Drafts Pending

Depends on the ticket's open question (Rejected in Drafts Pending). If yes, extend section 6's scenario: a fully rejected draft appears once in Drafts Pending and proposes from there.

## Findings

- (fill in after the runs)

## Follow-up

- If the open-request decision is "block", 7c flips to asserting Propose is hidden until the second approver responds.

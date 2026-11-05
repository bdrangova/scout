---
name: default-code-review
description: Scout's default reviewer for a pull request - finds actionable regressions in the change, ranks them by severity and writes each as a finding with a proposed PR comment, in the shape the Scout PR report expects. Used by scout-pr-review when the user names no other review skills; also use it when the user runs /default-code-review.
argument-hint: "<PR checkout> --base <ref> [--report <report.json>]"
---
# Default code review

Arguments: $ARGUMENTS

Reviewer name `default-code-review`, version `1`. Put it in the report's `reviewers` and in each finding's `sources`.

## What to look for
Read the PR intent and the changed code with surrounding callers and tests. Find actionable regressions introduced by the change: incorrect behaviour, lost data, authorization mistakes, concurrency failures, boundary conditions and broken integration contracts. Ground each claim in a concrete path and trigger. Avoid style-only findings and speculative risks. A valid review can have zero findings.

## Severity
Assign critical, high, medium or low by demonstrated impact, not by how alarming it sounds.

## Writing each finding
Load `/write-for-reviewers` (Skill tool) first.
- **Title:** the effect people see ("New equipment is saved without a type"), not the mechanism.
- **Proposed PR comment:** what goes wrong, when, and what to change. Name code only where the fix needs it.
- **Anchor:** the schema's old/new line anchor, kept tight within the diff (`ai-review pr-report schema`).

The human edits this wording and accepts or rejects each finding in Scout; never decide that for them. Reproducing findings is the caller's job (`/reproduce`); do not mark anything verified here.

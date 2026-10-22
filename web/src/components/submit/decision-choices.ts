import type { DecisionChoice } from './DecisionPicker'

/** The test run's wording: Accept, Changes requested (no Reject; the run is re-run, not abandoned). */
export const TEST_RUN_DECISION_CHOICES: readonly DecisionChoice[] = [
  { value: 'approve', label: 'Accept', hint: 'The run is good as it is.' },
  { value: 'request-changes', label: 'Changes requested', hint: 'Claude Code applies the open comments and decides what to re-run.' },
]

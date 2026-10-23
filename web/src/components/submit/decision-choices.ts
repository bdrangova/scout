import type { DecisionChoice } from './DecisionPicker'

/** The test run's wording: Accept, Changes requested (no Reject; the run is re-run, not abandoned). */
export const TEST_RUN_DECISION_CHOICES: readonly DecisionChoice[] = [
  { value: 'approve', label: 'Accept', hint: 'Run is good as is.' },
  { value: 'request-changes', label: 'Changes requested', hint: 'Claude applies comments, re-runs as needed.' },
]

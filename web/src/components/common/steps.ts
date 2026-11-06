export type StepState = 'pending' | 'active' | 'done' | 'failed'

/** One line of a `StepList`. */
export interface Step {
  label: string
  state: StepState
  /** When the step started (ms); the active step shows a running clock from it, a finished one its total. */
  startedAt?: number
  endedAt?: number
}

/** Small helpers for driving a `Step[]` from async code. */
export function startStep(steps: Step[], index: number): Step[] {
  return steps.map((s, i) => (i === index ? { ...s, state: 'active', startedAt: Date.now(), endedAt: undefined } : s))
}

export function endStep(steps: Step[], index: number, state: 'done' | 'failed'): Step[] {
  return steps.map((s, i) => (i === index ? { ...s, state, endedAt: Date.now() } : s))
}

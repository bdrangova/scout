import { SCENARIO_STATUSES, type ScenarioStatus } from '@scout/shared'
import type { Tone } from './status-tone'

export const SCENARIO_STATUS_LABEL: Record<ScenarioStatus, string> = {
  planned: 'Planned',
  pass: 'Pass',
  fail: 'Fail',
  uncertain: 'Uncertain',
  gap: 'Gap',
  na: 'N/A',
  blocked: 'Blocked',
}

/** The tint of a scenario's own status (not the reviewer's verdict): the same five tones as everywhere (`Tag`, `StatusDot`). */
export const SCENARIO_STATUS_TONE: Record<ScenarioStatus, Tone> = {
  planned: 'info',
  pass: 'ok',
  fail: 'err',
  uncertain: 'warn',
  gap: 'warn',
  na: 'neutral',
  blocked: 'err',
}

/** Scenarios per status, every status present (zeros included). */
export function scenarioCounts(scenarios: readonly { status: ScenarioStatus }[]): Record<ScenarioStatus, number> {
  const counts = Object.fromEntries(SCENARIO_STATUSES.map((status) => [status, 0])) as Record<ScenarioStatus, number>
  for (const scenario of scenarios) counts[scenario.status] += 1
  return counts
}

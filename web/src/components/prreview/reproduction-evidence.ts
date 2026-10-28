import type { PrFinding } from '@scout/shared'

export type Reproduction = PrFinding['reproduction']
export type EvidenceItem = Reproduction['evidence'][number]

/** Evidence in the order the steps ran (then by capture time), so stepping through it retells the reproduction. */
export function orderedEvidence(r: Reproduction): EvidenceItem[] {
  const rank = new Map(r.steps.map((s, i) => [s.id, i]))
  return [...r.evidence].sort((a, b) => (rank.get(a.stepId) ?? Infinity) - (rank.get(b.stepId) ?? Infinity) || a.capturedAt.localeCompare(b.capturedAt))
}

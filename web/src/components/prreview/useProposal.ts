import { currentProposal, type PrFinding, type ProposalReview } from '@scout/shared'
import { useReview } from '@/state/review-context'
import { useCurrentPrReport } from './pr-review-context'

export interface ProposalState {
  proposal: ProposalReview
  /** The report no longer matches the diff (or the card shows another scope): approving is off. */
  outdated: boolean
  update: (patch: Partial<ProposalReview>) => void
  /** Approve ⇄ pending; never while outdated or with empty wording. */
  toggleApprove: () => void
  /** Reject ⇄ pending. */
  toggleReject: () => void
  /** Sets approved or rejected (a swipe); false when approving is not allowed (outdated, empty wording). */
  decide: (verdict: 'approved' | 'rejected') => boolean
}

/** One finding's suggested comment and its independent actions (they never touch a file verdict). Null without a report. */
export function useProposal(finding: PrFinding, changed = false): ProposalState | null {
  const { detail, report, current } = useCurrentPrReport()
  const { state, dispatch } = useReview()
  if (!report || !detail) return null
  const proposal = currentProposal(report, finding, state.review)
  const outdated = changed || !current
  const update = (patch: Partial<ProposalReview>) => {
    dispatch({ type: 'SET_PROPOSAL', id: finding.id, proposal: { ...proposal, ...patch, updatedAt: new Date().toISOString() } })
  }
  return {
    proposal,
    outdated,
    update,
    toggleApprove: () => {
      if (outdated || !proposal.body.trim()) return
      update({ verdict: proposal.verdict === 'approved' ? 'none' : 'approved' })
    },
    toggleReject: () => update({ verdict: proposal.verdict === 'rejected' ? 'none' : 'rejected' }),
    decide: (verdict) => {
      if (verdict === 'approved' && (outdated || !proposal.body.trim())) return false
      if (proposal.verdict !== verdict) update({ verdict })
      return true
    },
  }
}

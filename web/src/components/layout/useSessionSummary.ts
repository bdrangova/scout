import { prReviewSessionStatus, sessionStatus, type Decision, type SessionStatus } from '@scout/shared'
import { useMemo } from 'react'
import { verdictSummary, suggestDecision, type VerdictSummary } from '@/components/submit/verdict-summary'
import { isTestRunDetail } from '@/lib/detail-kind'
import { reviewBreakdown } from '@/lib/review-breakdown'
import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'

export interface SessionSummaryView {
  status: SessionStatus
  progress: { reviewed: number; total: number }
  openComments: number
  /** Files by verdict, agreeing with `progress`. */
  verdicts: VerdictSummary
  /** What the verdicts point to (`undecided` until every file is approved or one is rejected). */
  suggestion: Decision
  /** The last send, for the status wording ("Changes sent · Request changes"). */
  lastSend: { at: string; decision: Decision } | null
}

/**
 * The live review of the open session in the numbers the bar and the rail show. Derived locally
 * (not from the server's summary, which lags the autosave) so it follows the review as it changes.
 */
export function useSessionSummary(): SessionSummaryView {
  const { detail } = useSessionContext()
  const { state, progress, comments, resolutions, items } = useReview()
  const openComments = useMemo(() => comments.filter((comment) => comment.status === 'open').length, [comments])
  return useMemo(() => {
    const verdicts = reviewBreakdown(verdictSummary(state.review, { files: items }), progress)
    const lastSend = state.review?.sent ?? null
    const fileStatus = sessionStatus({ review: state.review, tree: items, resolutions })
    const status = !isTestRunDetail(detail) && detail.manifest.kind === 'pr-review' ? prReviewSessionStatus(fileStatus, detail.prReview, detail.tree, state.review) : fileStatus
    return { status, progress, openComments, verdicts, suggestion: suggestDecision(verdicts), lastSend }
  }, [detail, state.review, items, resolutions, progress, openComments])
}

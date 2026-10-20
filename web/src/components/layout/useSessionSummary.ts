import { sessionStatus, type Decision } from '@review-dash/shared'
import { useMemo } from 'react'
import { verdictSummary, suggestDecision, type VerdictSummary } from '@/components/submit/verdict-summary'
import { reviewStatusOf, runChipFor, type ReviewStatus, type RunChipKind } from '@/lib/session-status'
import { reviewBreakdown } from '@/lib/review-breakdown'
import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'

export interface SessionSummaryView {
  /** The review state, the same with or without a run (the run is `run`). */
  status: ReviewStatus
  /** "Agent working" while a run is active, "Run failed" when the newest run failed, else null. */
  run: RunChipKind | null
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
  const { state, progress, comments, resolutions } = useReview()
  const { tree } = detail
  const openComments = useMemo(() => comments.filter((comment) => comment.status === 'open').length, [comments])
  return useMemo(() => {
    const verdicts = reviewBreakdown(verdictSummary(state.review, tree), progress)
    // The review state ignores the run; the run overlay is derived apart, with the same precedence as the server (working over failed).
    const lastSend = state.review?.sent ?? null
    const status = reviewStatusOf({ status: sessionStatus({ review: state.review, tree, resolutions, activeRun: false }), progress, openComments, lastSend })
    const run = runChipFor(detail.activeRunId !== null, detail.latestRunStatus)
    return { status, run, progress, openComments, verdicts, suggestion: suggestDecision(verdicts), lastSend }
  }, [state.review, tree, resolutions, detail.activeRunId, detail.latestRunStatus, progress, openComments])
}

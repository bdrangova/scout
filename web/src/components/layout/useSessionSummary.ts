import { prReviewSessionStatus, sessionStatus, type Decision } from '@scout/shared'
import { useMemo } from 'react'
import { verdictSummary, suggestDecision, type VerdictSummary } from '@/components/submit/verdict-summary'
import { isTestRunDetail } from '@/lib/detail-kind'
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
  const { state, progress, comments, resolutions, items } = useReview()
  // A test run's detail carries no run state yet (the Submit milestone adds it): no agent run is shown for it.
  const activeRunId = isTestRunDetail(detail) ? null : detail.activeRunId
  const latestRunStatus = isTestRunDetail(detail) ? null : detail.latestRunStatus
  const openComments = useMemo(() => comments.filter((comment) => comment.status === 'open').length, [comments])
  return useMemo(() => {
    const verdicts = reviewBreakdown(verdictSummary(state.review, { files: items }), progress)
    // The review state ignores the run; the run overlay is derived apart, with the same precedence as the server (working over failed).
    const lastSend = state.review?.sent ?? null
    const fileStatus = sessionStatus({ review: state.review, tree: items, resolutions, activeRun: false })
    const combinedStatus = !isTestRunDetail(detail) && detail.manifest.kind === 'pr-review' ? prReviewSessionStatus(fileStatus, detail.prReview, detail.tree, state.review) : fileStatus
    const status = reviewStatusOf({ status: combinedStatus, progress, openComments, lastSend })
    const run = runChipFor(activeRunId !== null, latestRunStatus)
    return { status, run, progress, openComments, verdicts, suggestion: suggestDecision(verdicts), lastSend }
  }, [detail, state.review, items, resolutions, activeRunId, latestRunStatus, progress, openComments])
}

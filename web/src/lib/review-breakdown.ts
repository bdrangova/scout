import type { VerdictSummary } from '@/components/submit/verdict-summary'

/**
 * `verdictSummary`'s counts made to agree with the review progress: a file counts as reviewed
 * when it has a verdict or an open comment, so the files reviewed without a verdict are the
 * commented ones and the rest are not reviewed.
 */
export function reviewBreakdown(summary: VerdictSummary, progress: { reviewed: number; total: number }): VerdictSummary {
  const commented = Math.max(0, progress.reviewed - summary.approved - summary.rejected)
  return {
    approved: summary.approved,
    rejected: summary.rejected,
    commented,
    notReviewed: Math.max(0, progress.total - summary.approved - summary.rejected - commented),
  }
}

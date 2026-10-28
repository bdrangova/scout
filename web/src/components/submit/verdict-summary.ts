import { effectiveVerdict, type Comment, type Decision, isItemComment, type Review, type ReviewItem, type Verdict } from '@scout/shared'

export interface VerdictSummary {
  approved: number
  rejected: number
  commented: number
  notReviewed: number
}

/**
 * Files of the live tree by effective verdict (a verdict pinned to an older fingerprint counts
 * as none); a file without a verdict but with a comment counts as `commented`.
 */
export function verdictSummary(review: Review, tree: { files: readonly ReviewItem[] }): VerdictSummary {
  const commented = new Set<string>()
  for (const comment of review.comments) {
    if (isItemComment(comment.target.kind) && comment.target.ref !== null) commented.add(comment.target.ref)
  }
  const summary: VerdictSummary = { approved: 0, rejected: 0, commented: 0, notReviewed: 0 }
  for (const file of tree.files) {
    const verdict = effectiveVerdict(review.files[file.path], file)
    if (verdict === 'approved') summary.approved += 1
    else if (verdict === 'rejected') summary.rejected += 1
    else if (commented.has(file.path)) summary.commented += 1
    else summary.notReviewed += 1
  }
  return summary
}

/** `3 approved · 1 rejected · 1 commented · 3 not reviewed` */
export function formatVerdictSummary(summary: VerdictSummary): string {
  return [
    `${summary.approved} approved`,
    `${summary.rejected} rejected`,
    `${summary.commented} commented`,
    `${summary.notReviewed} not reviewed`,
  ].join(' · ')
}

export type FileChip = Exclude<Verdict, 'none'> | 'commented'

/** The chip next to a file in the comment list: its verdict, or `commented` when it only has comments. */
export function fileChip(verdict: Verdict, comments: readonly Comment[]): FileChip | null {
  if (verdict !== 'none') return verdict
  return comments.length > 0 ? 'commented' : null
}

/**
 * The decision the verdicts point to: any rejected file → request changes, every file approved →
 * approve, otherwise none (the reviewer picks).
 */
export function suggestDecision(summary: VerdictSummary): Decision {
  if (summary.rejected > 0) return 'request-changes'
  const total = summary.approved + summary.rejected + summary.commented + summary.notReviewed
  if (total > 0 && summary.approved === total) return 'approve'
  return 'undecided'
}

/** A test run's suggestion: changes requested when a scenario is rejected or any comment is open, otherwise accept. */
export function suggestTestRunDecision(summary: VerdictSummary, openComments: number): Decision {
  return summary.rejected > 0 || openComments > 0 ? 'request-changes' : 'approve'
}

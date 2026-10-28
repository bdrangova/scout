import { effectiveVerdict, type TreeFile, type Verdict } from '@scout/shared'
import { useMemo } from 'react'
import { indexByPath } from '@/lib/scope'
import { useReview } from '@/state/review-context'

/** A file with no verdict but an open comment counts as reviewed, so it gets its own bucket. */
export type Category = Verdict | 'commented'

export interface FileCategories {
  reviewByPath: ReadonlyMap<string, TreeFile>
  openCommentsByPath: ReadonlyMap<string, number>
  /** A scope file without a full-diff entry (a later change undid it) has no verdict to show. */
  verdictOf: (file: TreeFile) => Verdict
  categoryOf: (file: TreeFile) => Category
}

/** Resolves each grid file's verdict and bucket against the review state of the full diff. */
export function useFileCategories(reviewFiles: readonly TreeFile[]): FileCategories {
  const { fileReview, comments } = useReview()
  const reviewByPath = useMemo(() => indexByPath(reviewFiles), [reviewFiles])

  const openCommentsByPath = useMemo(() => {
    const counts = new Map<string, number>()
    for (const comment of comments) {
      if (comment.target.kind !== 'file' || comment.status !== 'open' || comment.target.ref === null) continue
      counts.set(comment.target.ref, (counts.get(comment.target.ref) ?? 0) + 1)
    }
    return counts
  }, [comments])

  const verdictOf = (file: TreeFile): Verdict => {
    const reviewFile = reviewByPath.get(file.path)
    return reviewFile ? effectiveVerdict(fileReview(file.path), reviewFile) : 'none'
  }
  const categoryOf = (file: TreeFile): Category => {
    const verdict = verdictOf(file)
    return verdict === 'none' && reviewByPath.has(file.path) && (openCommentsByPath.get(file.path) ?? 0) > 0 ? 'commented' : verdict
  }

  return { reviewByPath, openCommentsByPath, verdictOf, categoryOf }
}

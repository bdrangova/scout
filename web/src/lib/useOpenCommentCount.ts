import type { CommentTarget } from '@review-dash/shared'
import { useReview } from '@/state/review-context'

/**
 * The number of open comments on one kind of target (`spec`, `extra`, `evidence`, `file`, `overall`),
 * or on one item of that kind when `ref` is given. Reads the live review through `useReview()`.
 */
export function useOpenCommentCount(kind: CommentTarget['kind'], ref?: string): number {
  const { comments } = useReview()
  return comments.filter((comment) => comment.target.kind === kind && comment.status === 'open' && (ref === undefined || comment.target.ref === ref)).length
}

import { useMemo } from 'react'
import { useReview } from './review-context'

export interface CommentActions {
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onResolve: (id: string) => void
  onReopen: (id: string) => void
}

/**
 * The edit / delete / resolve / reopen handlers every comment list takes, dispatching to the review
 * context. Stable across renders (they only depend on `dispatch`), so they can be passed straight down.
 */
export function useCommentActions(): CommentActions {
  const { dispatch } = useReview()
  return useMemo(
    () => ({
      onEdit: (id, body) => dispatch({ type: 'EDIT_COMMENT', id, body }),
      onDelete: (id) => dispatch({ type: 'DELETE_COMMENT', id }),
      onResolve: (id) => dispatch({ type: 'RESOLVE_COMMENT', id }),
      onReopen: (id) => dispatch({ type: 'REOPEN_COMMENT', id }),
    }),
    [dispatch],
  )
}

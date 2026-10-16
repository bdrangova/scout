import type { CommentTarget } from '@review-dash/shared'
import { useReview } from '@/state/review-context'
import { CommentBox } from './CommentBox'
import { CommentList } from './CommentList'

export interface TargetCommentsProps {
  /** An artifact target (`extra` or `spec`), keyed by the item's path. */
  target: CommentTarget
  /** `Comment on Architecture`. */
  label: string
  className?: string
}

/** The comment list plus the box for one extras or spec item; reads and dispatches through `useReview()`. */
export function TargetComments({ target, label, className }: TargetCommentsProps) {
  const { dispatch, commentsFor } = useReview()
  const comments = commentsFor(target)
  return (
    <footer className={className}>
      <CommentList
        comments={comments}
        onEdit={(id, text) => dispatch({ type: 'EDIT_COMMENT', id, body: text })}
        onDelete={(id) => dispatch({ type: 'DELETE_COMMENT', id })}
        onResolve={(id) => dispatch({ type: 'RESOLVE_COMMENT', id })}
        onReopen={(id) => dispatch({ type: 'REOPEN_COMMENT', id })}
      />
      <CommentBox
        label={label}
        pendingReject={false}
        collapsible
        onSubmit={(text) => dispatch({ type: 'ADD_COMMENT', target, body: text })}
        onCancelReject={() => {}}
      />
    </footer>
  )
}

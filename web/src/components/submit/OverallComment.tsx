import type { CommentWithStatus } from '@review-dash/shared'
import { useState, type KeyboardEvent } from 'react'
import { Textarea } from '@/components/ui/textarea'

export interface OverallCommentProps {
  /** The open overall comment, when there is one. */
  comment: CommentWithStatus | null
  onAdd: (body: string) => void
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
}

/**
 * The overall feedback textarea. It creates the `{ kind: 'overall' }` comment or edits the open
 * one when the field loses focus (or on ⌘+Enter); clearing an unsent comment deletes it.
 */
export function OverallComment({ comment, onAdd, onEdit, onDelete }: OverallCommentProps) {
  const [draft, setDraft] = useState(comment?.body ?? '')
  const commentId = comment?.id ?? null
  const commentBody = comment?.body ?? ''
  // Re-sync the draft when the comment changes underneath (reload, edit elsewhere).
  const [synced, setSynced] = useState({ id: commentId, body: commentBody })
  if (synced.id !== commentId || synced.body !== commentBody) {
    setSynced({ id: commentId, body: commentBody })
    setDraft(commentBody)
  }

  function commit() {
    const body = draft.trim()
    if (comment === null) {
      if (body !== '') onAdd(body)
      return
    }
    if (body === '') {
      if (comment.sentAt === null) onDelete(comment.id)
      else setDraft(comment.body)
      return
    }
    if (body !== comment.body) onEdit(comment.id, body)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      commit()
      event.currentTarget.blur()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        aria-label="Overall feedback"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        placeholder="What should Claude Code know about the change as a whole?"
        rows={3}
        className="min-h-20 bg-background text-[13px] leading-relaxed md:text-[13px]"
      />
      {comment?.sentAt && <span className="text-xs text-muted-foreground">Sent · still open, edits go with the next send</span>}
    </div>
  )
}

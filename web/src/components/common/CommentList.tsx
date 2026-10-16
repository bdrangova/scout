import type { CommentWithStatus } from '@review-dash/shared'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDuration, formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface CommentListProps {
  comments: CommentWithStatus[]
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onResolve: (id: string) => void
  onReopen: (id: string) => void
  className?: string
}

/**
 * Open comments with edit / delete / mark resolved; resolved ones hidden behind
 * "Show n resolved", each with the agent's note and a Reopen action.
 */
export function CommentList({ comments, onEdit, onDelete, onResolve, onReopen, className }: CommentListProps) {
  const [showResolved, setShowResolved] = useState(false)
  const open = comments.filter((comment) => comment.status === 'open')
  const resolved = comments.filter((comment) => comment.status === 'resolved')
  if (comments.length === 0) return null

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {open.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Open comments">
          {open.map((comment) => (
            <OpenComment key={comment.id} comment={comment} onEdit={onEdit} onDelete={onDelete} onResolve={onResolve} />
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={showResolved}
            onClick={() => setShowResolved((value) => !value)}
            className="self-start text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
          </button>
          {showResolved && (
            <ul className="flex flex-col gap-2" aria-label="Resolved comments">
              {resolved.map((comment) => (
                <ResolvedComment key={comment.id} comment={comment} onReopen={onReopen} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Timestamp({ seconds }: { seconds: number | null }) {
  if (seconds === null) return null
  return <span className="font-mono text-[11px] text-info">at {formatDuration(seconds)}</span>
}

function Meta({ comment }: { comment: CommentWithStatus }) {
  return (
    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="font-mono">{comment.id}</span>
      <Timestamp seconds={comment.timestampSec} />
      <time dateTime={comment.updatedAt ?? comment.createdAt}>
        {formatRelativeTime(comment.updatedAt ?? comment.createdAt)}
        {comment.updatedAt ? ' · edited' : ''}
      </time>
      {comment.sentAt && (
        <span className="rounded-full bg-info/10 px-1.5 py-px font-semibold text-info" title={`Sent ${comment.sentAt}`}>
          Sent
        </span>
      )}
    </span>
  )
}

interface OpenCommentProps {
  comment: CommentWithStatus
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onResolve: (id: string) => void
}

function OpenComment({ comment, onEdit, onDelete, onResolve }: OpenCommentProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)

  function save() {
    const body = draft.trim()
    if (body !== '' && body !== comment.body) onEdit(comment.id, body)
    setEditing(false)
  }

  return (
    <li className="flex gap-2.5 rounded-lg border bg-card px-3 py-2 text-[13px]" aria-label={`Comment ${comment.id}`}>
      <span
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background"
        aria-hidden
      >
        You
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {editing ? (
          <>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              autoFocus
              aria-label={`Edit comment ${comment.id}`}
              className="min-h-12 text-[13px] md:text-[13px]"
            />
            <div className="flex gap-2">
              <Button size="xs" onClick={save} disabled={draft.trim() === ''}>
                Save
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setDraft(comment.body)
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <p className="whitespace-pre-wrap">{comment.body}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Meta comment={comment} />
          {!editing && (
            <span className="ml-auto flex gap-2 text-xs">
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>
                Edit
              </button>
              {comment.sentAt === null && (
                <button type="button" className="text-muted-foreground hover:text-reject" onClick={() => onDelete(comment.id)}>
                  Delete
                </button>
              )}
              <button type="button" className="text-muted-foreground hover:text-approve" onClick={() => onResolve(comment.id)}>
                Mark resolved
              </button>
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

function ResolvedComment({ comment, onReopen }: { comment: CommentWithStatus; onReopen: (id: string) => void }) {
  const note = comment.resolution?.note ?? null
  const byAgent = comment.resolution !== null && comment.resolution.status === 'resolved'
  return (
    <li
      className="flex flex-col gap-1 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground"
      aria-label={`Resolved comment ${comment.id}`}
    >
      <p className="whitespace-pre-wrap">{comment.body}</p>
      {note && (
        <p className="flex gap-1.5 text-xs">
          <span className="font-semibold text-approve">{byAgent ? 'Claude Code:' : 'Note:'}</span>
          <span>{note}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3">
        <Meta comment={comment} />
        <button
          type="button"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onReopen(comment.id)}
        >
          Reopen
        </button>
      </div>
    </li>
  )
}

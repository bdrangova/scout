import { anchorLabel, type CommentWithStatus } from '@scout/shared'
import { ChevronDown, ChevronRight, CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
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
  const Chevron = showResolved ? ChevronDown : ChevronRight

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
            aria-label={`${showResolved ? 'Hide' : 'Show'} ${resolved.length} resolved`}
            onClick={() => setShowResolved((value) => !value)}
            className="inline-flex items-center gap-1.5 self-start rounded-md text-[12.5px] font-semibold text-ink-muted tabular-nums transition-colors hover:text-ink"
          >
            <Chevron aria-hidden className="size-3.5" />
            <CircleCheck aria-hidden className="size-3.5 text-green" />
            {resolved.length} resolved
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
  return <span className="font-mono text-[11px] text-st-r">at {formatDuration(seconds)}</span>
}

function Meta({ comment }: { comment: CommentWithStatus }) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
      <span className="font-mono">{comment.id}</span>
      {comment.target.anchor && <span className="font-mono text-st-r">{anchorLabel(comment.target.anchor)}</span>}
      <Timestamp seconds={comment.timestampSec} />
      <time dateTime={comment.updatedAt ?? comment.createdAt}>
        {formatRelativeTime(comment.updatedAt ?? comment.createdAt)}
        {comment.updatedAt ? ' · edited' : ''}
      </time>
      {comment.sentAt && (
        <Tag tone="info" size="sm" pill title={`Sent ${comment.sentAt}`}>
          Sent
        </Tag>
      )}
    </span>
  )
}

/** A flat text action in the comment's meta row. */
function TextAction({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn('rounded-sm text-xs font-semibold text-ink-muted underline-offset-[3px] transition-colors hover:text-ink hover:underline', className)}
      {...props}
    />
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
    <li className="flex gap-2.5 rounded-lg border-fine border-line bg-paper px-3 py-2 text-[13px]" aria-label={`Comment ${comment.id}`}>
      <span
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-fine border-fill-line bg-ink text-[9px] font-bold text-paper"
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
              className="min-h-12 text-[13px]"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={draft.trim() === ''}>
                Save
              </Button>
              <Button
                size="sm"
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
            <span className="ml-auto flex gap-2.5">
              <TextAction onClick={() => setEditing(true)}>Edit</TextAction>
              {comment.sentAt === null && (
                <TextAction className="hover:text-red" onClick={() => onDelete(comment.id)}>
                  Delete
                </TextAction>
              )}
              <TextAction className="hover:text-green" onClick={() => onResolve(comment.id)}>
                Mark resolved
              </TextAction>
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
      className="flex flex-col gap-1 rounded-lg border-fine border-dashed border-line bg-paper-2 px-3 py-2 text-[13px] text-ink-muted"
      aria-label={`Resolved comment ${comment.id}`}
    >
      <p className="whitespace-pre-wrap">{comment.body}</p>
      {note && (
        <p className="flex gap-1.5 text-xs">
          <span className="font-bold text-green">{byAgent ? 'Claude Code:' : 'Note:'}</span>
          <span>{note}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3">
        <Meta comment={comment} />
        <TextAction className="ml-auto" onClick={() => onReopen(comment.id)}>
          Reopen
        </TextAction>
      </div>
    </li>
  )
}

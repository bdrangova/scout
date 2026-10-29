import type { CommentWithStatus } from '@scout/shared'
import { ChevronDown, ChevronRight, CircleCheck, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { bodyExcerpt } from '@/components/prcomments/pr-format'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { Textarea } from '@/components/ui/textarea'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CommentAction, CommentHeader, YouAvatar } from './CommentHeader'

export interface CommentListProps {
  comments: CommentWithStatus[]
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onResolve: (id: string) => void
  onReopen: (id: string) => void
  className?: string
}

/**
 * Open comments with edit / delete / mark resolved, each foldable to one line; resolved ones hidden behind
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

/** The video time of a test-run comment, as a badge. */
function Timestamp({ seconds }: { seconds: number | null }) {
  if (seconds === null) return null
  return (
    <Tag size="sm" mono>
      at {formatDuration(seconds)}
    </Tag>
  )
}

function SentBadge({ comment }: { comment: CommentWithStatus }) {
  if (!comment.sentAt) return null
  return (
    <Tag tone="info" size="sm" pill title={`Sent ${comment.sentAt}`}>
      Sent
    </Tag>
  )
}

interface OpenCommentProps {
  comment: CommentWithStatus
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onResolve: (id: string) => void
}

/** Caret, avatar, "You", badges and Edit / Delete / Resolve on one row, the text under it. Id, line and time stay in the data only. */
function OpenComment({ comment, onEdit, onDelete, onResolve }: OpenCommentProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [collapsed, setCollapsed] = useState(false)

  function save() {
    const body = draft.trim()
    if (body !== '' && body !== comment.body) onEdit(comment.id, body)
    setEditing(false)
  }

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border-fine border-l-[3px] border-line border-l-ink bg-surface px-3 py-2 text-[13px]" aria-label={`Comment ${comment.id}`}>
      <CommentHeader
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        avatar={<YouAvatar />}
        title="You"
        label={`comment ${comment.id}`}
        badges={
          (comment.sentAt || comment.timestampSec !== null) && (
            <>
              <Timestamp seconds={comment.timestampSec} />
              <SentBadge comment={comment} />
            </>
          )
        }
        preview={bodyExcerpt(comment.body)}
        actions={
          !editing && (
            <>
              <CommentAction
                icon={Pencil}
                onClick={() => {
                  setCollapsed(false)
                  setEditing(true)
                }}
              >
                Edit
              </CommentAction>
              {comment.sentAt === null && (
                <CommentAction icon={Trash2} className="hover:text-red" onClick={() => onDelete(comment.id)}>
                  Delete
                </CommentAction>
              )}
              <CommentAction icon={CircleCheck} className="hover:text-green" onClick={() => onResolve(comment.id)}>
                Resolve
              </CommentAction>
            </>
          )
        }
      />
      {!collapsed &&
        (editing ? (
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
          <p className="m-0 whitespace-pre-wrap">{comment.body}</p>
        ))}
    </li>
  )
}

function ResolvedComment({ comment, onReopen }: { comment: CommentWithStatus; onReopen: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const note = comment.resolution?.note ?? null
  const byAgent = comment.resolution !== null && comment.resolution.status === 'resolved'
  return (
    <li
      className="flex flex-col gap-1.5 rounded-lg border-fine border-l-[3px] border-line border-l-green bg-paper-2 px-3 py-2 text-[13px] text-ink-muted"
      aria-label={`Resolved comment ${comment.id}`}
    >
      <CommentHeader
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        avatar={<YouAvatar />}
        title="You"
        label={`resolved comment ${comment.id}`}
        badges={
          <>
            <Timestamp seconds={comment.timestampSec} />
            <Tag tone="ok" size="sm">
              <CircleCheck aria-hidden />
              Resolved
            </Tag>
          </>
        }
        preview={bodyExcerpt(comment.body)}
        actions={
          <CommentAction icon={RotateCcw} onClick={() => onReopen(comment.id)}>
            Reopen
          </CommentAction>
        }
      />
      {!collapsed && (
        <>
          <p className="m-0 whitespace-pre-wrap">{comment.body}</p>
          {note && (
            <p className="m-0 flex gap-1.5 text-xs">
              <span className="font-bold text-green">{byAgent ? 'Claude Code:' : 'Note:'}</span>
              <span>{note}</span>
            </p>
          )}
        </>
      )}
    </li>
  )
}

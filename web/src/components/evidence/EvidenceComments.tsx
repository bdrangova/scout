import type { CommentTarget, CommentWithStatus } from '@review-dash/shared'
import { X } from 'lucide-react'
import { useEffect, useRef, type MouseEvent } from 'react'
import { CommentBox } from '@/components/common/CommentBox'
import { CommentList } from '@/components/common/CommentList'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useReview } from '@/state/review-context'

export interface EvidenceCommentsProps {
  target: CommentTarget
  /** File name for the box label: `Comment on upgrade-flow.webm`. */
  name: string
  comments: CommentWithStatus[]
  focusToken: number
  /** Set by "Comment at 0:42"; the next comment carries it as `timestampSec`. */
  pendingTimestamp: number | null
  onClearTimestamp: () => void
  /** Video only: a click on a timestamped comment seeks there. */
  onSeek?: (seconds: number) => void
  /** Video only: the comment whose timestamp is the latest at or before the playhead. */
  activeCommentId?: string | null
}

const ROW_SELECTOR = 'li[aria-label^="Comment "], li[aria-label^="Resolved comment "]'

function rowId(row: Element): string | null {
  const label = row.getAttribute('aria-label') ?? ''
  const match = /\b(c\d+)$/.exec(label)
  return match?.[1] ?? null
}

/** The comments column of an evidence card: open comments, the resolved toggle, and the box. */
export function EvidenceComments({
  target,
  name,
  comments,
  focusToken,
  pendingTimestamp,
  onClearTimestamp,
  onSeek,
  activeCommentId = null,
}: EvidenceCommentsProps) {
  const { dispatch } = useReview()
  const listRef = useRef<HTMLDivElement>(null)

  // CommentList owns the rows; the active highlight is applied from outside through a data attribute.
  useEffect(() => {
    const root = listRef.current
    if (!root) return
    for (const row of root.querySelectorAll(ROW_SELECTOR)) {
      const comment = comments.find((candidate) => candidate.id === rowId(row))
      row.setAttribute('data-active', String(comment !== undefined && comment.id === activeCommentId))
      row.setAttribute('data-seekable', String(comment?.timestampSec !== null && comment?.timestampSec !== undefined))
    }
  }, [comments, activeCommentId])

  function onListClick(event: MouseEvent<HTMLDivElement>) {
    if (!onSeek) return
    const element = event.target instanceof Element ? event.target : null
    if (!element || element.closest('button, textarea, a, input')) return
    const row = element.closest(ROW_SELECTOR)
    if (!row) return
    const comment = comments.find((candidate) => candidate.id === rowId(row))
    if (comment && comment.timestampSec !== null) onSeek(comment.timestampSec)
  }

  return (
    <div className="flex flex-col gap-3">
      {comments.length > 0 && (
        <div
          ref={listRef}
          onClick={onListClick}
          className={cn(
            '[&_li[data-active="true"]]:border-info [&_li[data-active="true"]]:ring-1 [&_li[data-active="true"]]:ring-info/40',
            onSeek && '[&_li[data-seekable="true"]]:cursor-pointer',
          )}
        >
          <CommentList
            comments={comments}
            onEdit={(id, body) => dispatch({ type: 'EDIT_COMMENT', id, body })}
            onDelete={(id) => dispatch({ type: 'DELETE_COMMENT', id })}
            onResolve={(id) => dispatch({ type: 'RESOLVE_COMMENT', id })}
            onReopen={(id) => dispatch({ type: 'REOPEN_COMMENT', id })}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {pendingTimestamp !== null && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 font-mono text-[11px] font-medium text-info">
            attached to {formatDuration(pendingTimestamp)}
            <button
              type="button"
              aria-label="Detach timestamp"
              onClick={onClearTimestamp}
              className="rounded-full hover:bg-info/20"
            >
              <X className="size-3" />
            </button>
          </span>
        )}
        <CommentBox
          label={`Comment on ${name}`}
          pendingReject={false}
          collapsible
          focusToken={focusToken}
          onSubmit={(body) => {
            dispatch({ type: 'ADD_COMMENT', target, body, timestampSec: pendingTimestamp })
            onClearTimestamp()
          }}
          onCancelReject={onClearTimestamp}
        />
      </div>
    </div>
  )
}

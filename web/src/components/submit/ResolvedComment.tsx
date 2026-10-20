import type { CommentWithStatus } from '@review-dash/shared'
import { CircleCheckIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { formatDuration, formatRelativeTime } from '@/lib/format'

export interface ResolvedCommentProps {
  comment: CommentWithStatus
  onReopen: (id: string) => void
}

/** A resolved comment in the Submit list: dashed, muted, with the agent's note and a Reopen action. */
export function ResolvedComment({ comment, onReopen }: ResolvedCommentProps) {
  const note = comment.resolution?.note ?? null
  const byAgent = comment.resolution?.status === 'resolved'
  const at = comment.resolution?.at ?? comment.resolvedAt ?? comment.createdAt
  return (
    <li
      className="flex flex-col gap-1.5 rounded-xl border-fine border-dashed border-line bg-paper-2 px-3 py-2.5 text-[13px] leading-[1.45] text-ink-muted"
      aria-label={`Resolved comment ${comment.id}`}
    >
      <p className="whitespace-pre-wrap text-ink">{comment.body}</p>
      {note && (
        <p className="flex gap-1.5 text-xs">
          <span className="font-bold text-green">{byAgent ? 'Claude Code:' : 'Note:'}</span>
          <span>{note}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-medium">
        <span className="font-mono">{comment.id}</span>
        {comment.timestampSec !== null && <span className="font-mono font-semibold text-focus">at {formatDuration(comment.timestampSec)}</span>}
        <Tag tone="ok" size="sm">
          <CircleCheckIcon aria-hidden />
          resolved
        </Tag>
        <time dateTime={at}>{formatRelativeTime(at)}</time>
        <Button variant="ghost" size="sm" className="-my-1 -mr-1.5 ml-auto h-7 px-2 text-xs" onClick={() => onReopen(comment.id)}>
          <RotateCcwIcon className="size-3.5" aria-hidden />
          Reopen
        </Button>
      </div>
    </li>
  )
}

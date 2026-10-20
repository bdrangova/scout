import type { CommentWithStatus } from '@review-dash/shared'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface TimelineMarkersProps {
  comments: CommentWithStatus[]
  duration: number
  activeId: string | null
  onSeek: (seconds: number) => void
}

/** One marker per timestamped comment, placed at `t / duration` above the control bar; resolved ones are green. */
export function TimelineMarkers({ comments, duration, activeId, onSeek }: TimelineMarkersProps) {
  const marked = comments.filter((comment) => comment.timestampSec !== null)
  return (
    <div className="relative h-4 w-full px-3" role="list" aria-label="Comment markers">
      <div className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-line" aria-hidden />
      {duration > 0 &&
        marked.map((comment) => {
          const seconds = comment.timestampSec ?? 0
          const left = `${Math.min(100, Math.max(0, (seconds / duration) * 100))}%`
          return (
            <button
              key={comment.id}
              type="button"
              role="listitem"
              title={`at ${formatDuration(seconds)} · ${comment.body}`}
              aria-label={`Comment at ${formatDuration(seconds)}`}
              aria-current={comment.id === activeId ? 'true' : undefined}
              onClick={() => onSeek(seconds)}
              style={{ left }}
              className={cn(
                'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-fine border-surface transition-transform hover:scale-125',
                comment.status === 'resolved' ? 'bg-st-a' : 'bg-st-r',
                comment.id === activeId && 'scale-125 border-ink',
              )}
            />
          )
        })}
    </div>
  )
}

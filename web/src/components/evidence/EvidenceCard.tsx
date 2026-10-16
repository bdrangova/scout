import type { CommentTarget, EvidenceItem } from '@review-dash/shared'
import { ExternalLink } from 'lucide-react'
import { useMemo, useReducer, useRef, useState } from 'react'
import { Markdown } from '@/components/common/Markdown'
import { Badge } from '@/components/ui/badge'
import { evidenceUrl, splitPath } from '@/lib/paths'
import { useReview } from '@/state/review-context'
import { EvidenceComments } from './EvidenceComments'
import { ImageViewer } from './ImageViewer'
import { VideoPlayer } from './VideoPlayer'

export interface EvidenceCardProps {
  item: EvidenceItem
  sessionId: string
  /** The carousel's current slide. */
  active: boolean
  /** Bump to focus the comment box (the `C` hotkey). */
  commentFocusToken?: number
}

/** Caption, viewer and the agent's description on the left; the comments column on the right. */
export function EvidenceCard({ item, sessionId, active, commentFocusToken = 0 }: EvidenceCardProps) {
  const { commentsFor } = useReview()
  const target = useMemo<CommentTarget>(() => ({ kind: 'evidence', ref: item.path }), [item.path])
  const comments = commentsFor(target)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pendingTimestamp, setPendingTimestamp] = useState<number | null>(null)
  const [localFocus, bumpLocalFocus] = useReducer((count: number) => count + 1, 0)
  const [time, setTime] = useState(0)
  const { name } = splitPath(item.path)
  const src = evidenceUrl(sessionId, item.path)

  const activeCommentId = useMemo(() => {
    if (item.type !== 'video') return null
    let best: { id: string; at: number } | null = null
    for (const comment of comments) {
      const at = comment.timestampSec
      if (at === null || at > time + 0.001) continue
      if (!best || at >= best.at) best = { id: comment.id, at }
    }
    return best?.id ?? null
  }, [comments, item.type, time])

  function seek(seconds: number) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = seconds
    setTime(seconds)
  }

  return (
    <article
      aria-label={item.caption}
      className="grid grid-cols-1 gap-5 rounded-xl border bg-card p-5 shadow-sm min-[1100px]:grid-cols-[minmax(0,1fr)_340px]"
    >
      <section className="flex min-w-0 flex-col gap-3">
        <header className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{item.type === 'image' ? 'Image' : 'Video'}</Badge>
          <span className="font-mono text-[13px]" title={item.path}>
            {name}
          </span>
          <h3 className="text-[13px] text-muted-foreground">{item.caption}</h3>
          <a
            href={src}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Open original
            <ExternalLink className="size-3" />
          </a>
        </header>
        {item.type === 'image' ? (
          <ImageViewer src={src} alt={item.caption} />
        ) : (
          <VideoPlayer
            src={src}
            videoRef={videoRef}
            comments={comments}
            activeCommentId={activeCommentId}
            active={active}
            onTimeUpdate={setTime}
            onCommentAt={(seconds) => {
              setPendingTimestamp(Math.floor(seconds))
              bumpLocalFocus()
            }}
          />
        )}
        {item.description && (
          <div className="flex gap-2.5 rounded-lg bg-muted/40 px-3 py-2">
            <span className="mt-0.5 shrink-0 rounded-full bg-info/10 px-1.5 py-px text-[10px] font-semibold text-info">
              Agent
            </span>
            <Markdown source={item.description} className="text-[13px]" />
          </div>
        )}
      </section>
      <aside className="flex min-w-0 flex-col gap-3 border-t pt-4 min-[1100px]:border-t-0 min-[1100px]:border-l min-[1100px]:pt-0 min-[1100px]:pl-5">
        <h3 className="text-sm font-semibold">
          Comments
          {comments.length > 0 && <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{comments.length}</span>}
        </h3>
        <EvidenceComments
          target={target}
          name={name}
          comments={comments}
          focusToken={localFocus + commentFocusToken}
          pendingTimestamp={pendingTimestamp}
          onClearTimestamp={() => setPendingTimestamp(null)}
          onSeek={item.type === 'video' ? seek : undefined}
          activeCommentId={activeCommentId}
        />
      </aside>
    </article>
  )
}

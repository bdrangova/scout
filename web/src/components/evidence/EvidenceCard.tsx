import type { CommentTarget, EvidenceItem } from '@scout/shared'
import { Bot, ExternalLink, Film, Image } from 'lucide-react'
import { useMemo, useReducer, useRef, useState } from 'react'
import { IconLink } from '@/components/common/IconLink'
import { KindTag } from '@/components/common/KindTag'
import { Markdown } from '@/components/common/Markdown'
import { Panel } from '@/components/ui/panel'
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

/** Caption, viewer and the agent's description on the left; the comments column on the right (below, under 900px). */
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
    <Panel role="article" aria-label={item.caption} className="grid h-full grid-cols-1 min-[900px]:grid-cols-[minmax(0,1fr)_320px] min-[900px]:grid-rows-[minmax(0,1fr)]">
      <section className="flex min-h-0 min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-none flex-wrap items-center gap-x-2.5 gap-y-1">
          <KindTag icon={item.type === 'image' ? Image : Film} label={item.type === 'image' ? 'Image' : 'Video'} />
          <span className="max-w-full truncate font-mono text-[13px] font-bold" title={item.path}>
            {name}
          </span>
          <h3 className="m-0 min-w-0 truncate text-[13.5px] font-medium text-ink-muted" title={item.caption}>{item.caption}</h3>
          <IconLink showLabel href={src} label="Open original" className="ml-auto">
            <ExternalLink aria-hidden />
          </IconLink>
        </div>
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
          <div className="flex max-h-24 flex-none items-start gap-2.5 overflow-y-auto rounded-lg border-fine border-line bg-paper-2 px-3 py-2">
            <KindTag icon={Bot} label="Agent" tone="info" className="mt-px" />
            <Markdown source={item.description} className="min-w-0 text-[13.5px] font-medium" />
          </div>
        )}
      </section>
      <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto border-t-fine border-line bg-paper-2 p-4 min-[900px]:border-t-0 min-[900px]:border-l-fine">
        <h3 className="m-0 text-[15px] font-bold">
          Comments
          {comments.length > 0 && <span className="ml-1.5 font-medium text-ink-muted tabular-nums">{comments.length}</span>}
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
    </Panel>
  )
}

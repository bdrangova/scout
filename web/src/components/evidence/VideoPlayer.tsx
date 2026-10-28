import type { CommentWithStatus } from '@scout/shared'
import { MessageSquarePlus } from 'lucide-react'
import {
  MediaControlBar,
  MediaController,
  MediaFullscreenButton,
  MediaMuteButton,
  MediaPlayButton,
  MediaTimeDisplay,
  MediaTimeRange,
} from 'media-chrome/react'
import { useEffect, useState, type RefObject, type SyntheticEvent } from 'react'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/format'
import { TimelineMarkers } from './TimelineMarkers'

export interface VideoPlayerProps {
  src: string
  /** Owned by the card so a comment click can seek. */
  videoRef: RefObject<HTMLVideoElement | null>
  comments: CommentWithStatus[]
  activeCommentId: string | null
  /** Pauses when the slide stops being the current one. */
  active: boolean
  /** `timeupdate`, for the active-comment highlight. */
  onTimeUpdate: (seconds: number) => void
  /** "Comment at 0:42": the video is paused and the comment box gets the timestamp. Without it the button is not shown. */
  onCommentAt?: (seconds: number) => void
}

/** media-chrome reads these custom properties; they point at the design tokens so the bar follows the theme. */
const MEDIA_THEME =
  '[--media-primary-color:var(--ink)] [--media-secondary-color:var(--surface)] [--media-text-color:var(--ink)] [--media-icon-color:var(--ink)] ' +
  '[--media-control-background:var(--surface)] [--media-control-hover-background:var(--hover)] [--media-control-height:40px] ' +
  '[--media-range-track-background:var(--sunken)] [--media-range-bar-color:var(--yellow)] [--media-range-thumb-background:var(--ink)] ' +
  '[--media-range-track-height:5px] [--media-range-track-border-radius:999px] [--media-font-family:var(--font-sans)] [--media-font-size:12px] [--media-font-weight:600] ' +
  '[--media-focus-box-shadow:inset_0_0_0_2px_var(--focus)] [--media-tooltip-display:none]'

/** Native `<video>` inside media-chrome controls, with a comment-marker strip above the bar. */
export function VideoPlayer({ src, videoRef, comments, activeCommentId, active, onTimeUpdate, onCommentAt }: VideoPlayerProps) {
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [paused, setPaused] = useState(true)

  useEffect(() => {
    if (!active) videoRef.current?.pause()
  }, [active, videoRef])

  function readTime(event: SyntheticEvent<HTMLVideoElement>) {
    const seconds = event.currentTarget.currentTime
    setTime(seconds)
    onTimeUpdate(seconds)
  }

  function readDuration(event: SyntheticEvent<HTMLVideoElement>) {
    const { duration: value } = event.currentTarget
    setDuration(Number.isFinite(value) ? value : 0)
  }

  function seek(seconds: number) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = seconds
    setTime(seconds)
    onTimeUpdate(seconds)
  }

  function commentAt() {
    const video = videoRef.current
    const seconds = video ? video.currentTime : time
    video?.pause()
    onCommentAt?.(seconds)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1" data-testid="video-player">
      <TimelineMarkers comments={comments} duration={duration} activeId={activeCommentId} onSeek={seek} />
      <div className={`min-h-[clamp(200px,40svh,420px)] flex-1 overflow-hidden rounded-xl border-fine border-line bg-sunken min-[900px]:min-h-0 ${MEDIA_THEME}`}>
        <MediaController className="h-full w-full">
          <video
            ref={videoRef}
            slot="media"
            src={src}
            preload="metadata"
            playsInline
            onTimeUpdate={readTime}
            onSeeked={readTime}
            onLoadedMetadata={readDuration}
            onDurationChange={readDuration}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            className="h-full w-full object-contain"
          />
          <MediaControlBar className="border-t-fine border-line">
            <MediaPlayButton />
            <MediaTimeRange />
            <MediaTimeDisplay showDuration />
            <MediaMuteButton />
            <MediaFullscreenButton />
          </MediaControlBar>
        </MediaController>
      </div>
      <div className="flex flex-none flex-wrap items-center gap-3 pt-1">
        {onCommentAt && (
          <Button size="sm" onClick={commentAt}>
            <MessageSquarePlus aria-hidden />
            Comment at {formatDuration(time)}
          </Button>
        )}
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          {paused ? `paused at ${formatDuration(time)}` : 'playing'}
          {duration > 0 ? ` · ${formatDuration(duration)} total` : ''}
        </span>
      </div>
    </div>
  )
}

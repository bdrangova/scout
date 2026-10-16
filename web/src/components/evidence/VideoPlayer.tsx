import type { CommentWithStatus } from '@review-dash/shared'
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
  /** "Comment at 0:42": the video is paused and the comment box gets the timestamp. */
  onCommentAt: (seconds: number) => void
}

/** Native `<video>` inside media-chrome controls, with a comment-marker strip above the bar. */
export function VideoPlayer({
  src,
  videoRef,
  comments,
  activeCommentId,
  active,
  onTimeUpdate,
  onCommentAt,
}: VideoPlayerProps) {
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [paused, setPaused] = useState(true)
  const [intrinsic, setIntrinsic] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (!active) videoRef.current?.pause()
  }, [active, videoRef])

  function readTime(event: SyntheticEvent<HTMLVideoElement>) {
    const seconds = event.currentTarget.currentTime
    setTime(seconds)
    onTimeUpdate(seconds)
  }

  function readDuration(event: SyntheticEvent<HTMLVideoElement>) {
    const { duration: value, videoWidth, videoHeight } = event.currentTarget
    setDuration(Number.isFinite(value) ? value : 0)
    if (videoWidth > 0 && videoHeight > 0) setIntrinsic({ width: videoWidth, height: videoHeight })
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
    onCommentAt(seconds)
  }

  // Nothing describes the recording up front: it takes its shape from the loaded metadata.
  const aspectRatio = intrinsic ? `${intrinsic.width} / ${intrinsic.height}` : '16 / 9'

  return (
    <div className="flex flex-col gap-1" data-testid="video-player">
      <TimelineMarkers comments={comments} duration={duration} activeId={activeCommentId} onSeek={seek} />
      <MediaController className="w-full overflow-hidden rounded-md bg-black" style={{ aspectRatio }}>
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
          className="h-full w-full"
        />
        <MediaControlBar>
          <MediaPlayButton />
          <MediaTimeRange />
          <MediaTimeDisplay showDuration />
          <MediaMuteButton />
          <MediaFullscreenButton />
        </MediaControlBar>
      </MediaController>
      <div className="flex items-center gap-3 pt-1">
        <Button variant="outline" size="sm" onClick={commentAt}>
          <MessageSquarePlus data-icon="inline-start" />
          Comment at {formatDuration(time)}
        </Button>
        <span className="font-mono text-xs text-muted-foreground">
          {paused ? `paused at ${formatDuration(time)}` : 'playing'}
          {duration > 0 ? ` · ${formatDuration(duration)} total` : ''}
        </span>
      </div>
    </div>
  )
}

import type { CommentWithStatus } from "@review-dash/shared";
import { useRef } from "react";
import { VideoPlayer } from "@/components/evidence/VideoPlayer";
import { formatDuration } from "@/lib/format";
import { runFileUrl } from "@/lib/paths";

function ignoreTime() {}

export interface Chapter {
  atSec: number;
  label: string;
}

export interface RunVideoProps {
  sessionId: string;
  /** `alias:path` of the video. */
  path: string;
  caption?: string;
  /** Buttons under the player that seek to `atSec`. */
  chapters?: readonly Chapter[];
  /** Timestamped comments become markers on the timeline. */
  comments?: CommentWithStatus[];
  /** Shows "Comment at 0:42" when given. */
  onCommentAt?: (seconds: number) => void;
}

/** The shared `VideoPlayer` on a run file, with chapter buttons that seek it. */
export function RunVideo({
  sessionId,
  path,
  caption,
  chapters = [],
  comments = [],
  onCommentAt,
}: RunVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sorted = [...chapters].sort((a, b) => a.atSec - b.atSec);
  function seek(seconds: number) {
    const video = videoRef.current;
    if (video) video.currentTime = seconds;
  }
  return (
    <figure data-slot="run-video" className="m-0 flex min-w-0 flex-col gap-2">
      <VideoPlayer
        src={runFileUrl(sessionId, path)}
        videoRef={videoRef}
        comments={comments}
        activeCommentId={null}
        active
        onTimeUpdate={ignoreTime}
        onCommentAt={onCommentAt}
      />
      {sorted.length > 0 && (
        <ul
          aria-label="Chapters"
          className="m-0 flex list-none flex-wrap gap-1.5 p-0"
        >
          {sorted.map((chapter, index) => (
            <li key={`${chapter.atSec}:${index}`}>
              <button
                type="button"
                onClick={() => seek(chapter.atSec)}
                className="inline-flex h-6 items-center gap-1.5 rounded-sm border-fine border-line bg-paper-2 px-2 text-[11.5px] font-bold hover:bg-hover"
              >
                <span className="font-mono font-medium text-ink-muted">
                  {formatDuration(chapter.atSec)}
                </span>
                {chapter.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {caption !== undefined && (
        <figcaption className="text-xs font-semibold text-ink-muted">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

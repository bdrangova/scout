import type { CommentWithStatus } from "@review-dash/shared";
import { ExternalLink, FileJson, Film, Image } from "lucide-react";
import { IconLink } from "@/components/common/IconLink";
import { KindTag } from "@/components/common/KindTag";
import { ImageViewer } from "@/components/evidence/ImageViewer";
import { Panel } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { runFileUrl } from "@/lib/paths";
import { useReview } from "@/state/review-context";
import { DataJsonView } from "./DataJsonView";
import { RunItemComments } from "./RunItemComments";
import { RunVideo, type Chapter } from "./RunVideo";
import {
  basename,
  entryName,
  EVIDENCE_KIND_LABEL,
  type EvidenceEntry,
} from "./scenario-evidence";

export interface RunEvidenceCardProps {
  sessionId: string;
  entry: EvidenceEntry;
  /** Seek buttons under a video (the screenshots that carry `atSec`). */
  chapters: readonly Chapter[];
  /** The scenario's timestamped comments: markers on a video's timeline. */
  timedComments: CommentWithStatus[];
  /** "Comment at 0:42" on a video: the scenario's comment box takes the timestamp. */
  onCommentAt: (seconds: number) => void;
}

const KIND_ICON = { video: Film, image: Image, data: FileJson } as const;

/**
 * One card of a scenario's evidence deck: the viewer on the left, its own comments on the right (like the
 * code review's evidence card). A screenshot or data file takes `run-file` comments; a video keeps "Comment at", which
 * lands in the scenario's comments.
 */
export function RunEvidenceCard({
  sessionId,
  entry,
  chapters,
  timedComments,
  onCommentAt,
}: RunEvidenceCardProps) {
  const { ref, kind } = entry;
  const name = entryName(entry);
  const src = runFileUrl(sessionId, ref.path);
  const commentable = kind !== "video";
  const { commentsFor } = useReview();
  const commentCount = commentsFor({ kind: "run-file", ref: ref.path }).length;
  return (
    <Panel
      role="article"
      aria-label={name}
      data-evidence={kind}
      className="grid grid-cols-1 min-[900px]:grid-cols-[minmax(0,1fr)_320px]"
    >
      <section className="flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <KindTag icon={KIND_ICON[kind]} label={EVIDENCE_KIND_LABEL[kind]} />
          <span className="max-w-full truncate font-mono text-[13px] font-bold" title={ref.path}>
            {basename(ref.path)}
          </span>
          {ref.caption !== undefined && (
            <h3 className="m-0 min-w-0 truncate text-[13.5px] font-medium text-ink-muted" title={ref.caption}>
              {ref.caption}
            </h3>
          )}
          {ref.layer !== undefined && (
            <Tag size="sm" mono>
              {ref.layer}
            </Tag>
          )}
          <IconLink showLabel href={src} label="Open original" className="ml-auto">
            <ExternalLink aria-hidden />
          </IconLink>
        </div>
        {kind === "image" && (
          <div className="flex h-[clamp(260px,50svh,480px)] flex-col">
            <ImageViewer src={src} alt={name} />
          </div>
        )}
        {kind === "video" && (
          <RunVideo
            sessionId={sessionId}
            path={ref.path}
            caption={undefined}
            chapters={chapters}
            comments={timedComments}
            onCommentAt={onCommentAt}
          />
        )}
        {kind === "data" && <DataJsonView sessionId={sessionId} path={ref.path} />}
      </section>
      {commentable && (
        <aside
          aria-label={`Comments on ${name}`}
          className="flex min-w-0 flex-col gap-3 border-t-fine border-line bg-paper-2 p-4 min-[900px]:border-t-0 min-[900px]:border-l-fine"
        >
          <h3 className="m-0 text-[15px] font-bold">
            Comments
            {commentCount > 0 && <span className="ml-1.5 font-medium text-ink-muted tabular-nums">{commentCount}</span>}
          </h3>
          <RunItemComments
            target={{ kind: "run-file", ref: ref.path }}
            label={`Comment on ${name}`}
          />
        </aside>
      )}
    </Panel>
  );
}

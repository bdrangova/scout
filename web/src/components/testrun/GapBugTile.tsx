import type { Bug, Gap } from "@review-dash/shared";
import { Tag } from "@/components/ui/tag";
import { useOpenCommentCount } from "@/lib/useOpenCommentCount";
import { RunTile } from "./RunTile";

export interface BugTileProps {
  bug: Bug;
  current: boolean;
  onOpen: () => void;
}

/** A bug in the grid: title, Jira key and its open comments. */
export function BugTile({ bug, current, onOpen }: BugTileProps) {
  const open = useOpenCommentCount("bug", bug.slug);
  return (
    <RunTile
      title={bug.title}
      current={current}
      comments={open}
      onOpen={onOpen}
      detail={
        <>
          <Tag tone="err" size="sm">
            Bug
          </Tag>
          {bug.jira !== undefined && (
            <Tag size="sm" mono>
              {bug.jira}
            </Tag>
          )}
        </>
      }
    />
  );
}

export interface GapTileProps {
  gap: Gap;
  current: boolean;
  onOpen: () => void;
}

/** A known gap in the grid: title, status and how many scenarios hit it. */
export function GapTile({ gap, current, onOpen }: GapTileProps) {
  return (
    <RunTile
      title={gap.title}
      current={current}
      onOpen={onOpen}
      detail={
        <>
          <Tag tone="warn" size="sm">
            Gap
          </Tag>
          <Tag size="sm" mono>
            {gap.status}
          </Tag>
          <span className="ml-auto font-mono tabular-nums">
            {gap.scenarios.length} scenarios
          </span>
        </>
      }
    />
  );
}

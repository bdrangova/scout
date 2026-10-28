import type { RunLog, Scenario } from "@scout/shared";
import { ScrollText } from "lucide-react";
import { useReview } from "@/state/review-context";
import { RunTile } from "./RunTile";

export interface LogTileProps {
  log: RunLog;
  scenarios: readonly Scenario[];
  current: boolean;
  onOpen: () => void;
}

/** A log in the grid: its label, path, the scenarios that point at it and its open line comments. */
export function LogTile({ log, scenarios, current, onOpen }: LogTileProps) {
  const { comments } = useReview();
  const open = comments.filter(
    (comment) =>
      comment.target.kind === "log" &&
      comment.target.ref === log.path &&
      comment.status === "open",
  ).length;
  const linked = scenarios.filter((scenario) =>
    scenario.logs.some((excerpt) => excerpt.path === log.path),
  ).length;
  return (
    <RunTile
      title={log.label}
      current={current}
      comments={open}
      onOpen={onOpen}
      preview={<ScrollText aria-hidden className="size-7" />}
      detail={
        <>
          <span className="min-w-0 truncate font-mono text-ink-muted">
            {log.path}
          </span>
          {linked > 0 && (
            <span className="font-semibold">{linked} scenarios</span>
          )}
        </>
      }
    />
  );
}

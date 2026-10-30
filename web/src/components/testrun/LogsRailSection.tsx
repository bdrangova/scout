import { useCommentedOnlyFilter, useOpenCommentRefs } from "@/components/layout/commented-only";
import { CommentedOnlyToggle } from "@/components/layout/CommentedOnlyToggle";
import type { RunLog, Scenario } from "@scout/shared";
import { LogList } from "./LogList";
import { LogSearchPicker } from "./LogSearchPicker";
import { RunRailSection } from "./RunRailSection";
import type { LogSearch } from "./useLogSearch";
import { useRunGrid } from "./useRunMode";

export interface LogsRailSectionProps {
  sessionId: string;
  logs: readonly RunLog[];
  scenarios: readonly Scenario[];
  selected: string;
  onSelect: (path: string) => void;
  search: LogSearch;
}

/** The Logs page's block in the session rail: Find and Failures, then the log list. */
export function LogsRailSection({ search, ...list }: LogsRailSectionProps) {
  const grid = useRunGrid();
  const openRefs = useOpenCommentRefs("log");
  const commented = useCommentedOnlyFilter(list.logs, (log) =>
    openRefs.has(log.path),
  );
  return (
    <RunRailSection
      heading="Logs"
      count={list.logs.length}
      shown={commented.active ? commented.items.length : undefined}
      picker={<LogSearchPicker search={search} disabled={grid} />}
      action={
        <CommentedOnlyToggle
          size="sm"
          count={commented.count}
          active={commented.active}
          onToggle={commented.toggle}
        />
      }
    >
      <LogList {...list} logs={commented.items} />
    </RunRailSection>
  );
}

import type { RunLog, Scenario } from "@review-dash/shared";
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
  return (
    <RunRailSection
      heading="Logs"
      count={list.logs.length}
      picker={<LogSearchPicker search={search} disabled={grid} />}
    >
      <LogList {...list} />
    </RunRailSection>
  );
}

import { SCENARIO_STATUSES, type ScenarioStatus } from "@review-dash/shared";
import { Panel } from "@/components/ui/panel";
import {
  scenarioCounts,
  SCENARIO_STATUS_LABEL,
  SCENARIO_STATUS_TONE,
} from "@/lib/scenario-status";
import { cn } from "@/lib/utils";

/** The always-shown statuses; the others (planned, uncertain, blocked) appear only when a scenario has them. */
const ALWAYS: ReadonlySet<ScenarioStatus> = new Set([
  "pass",
  "fail",
  "gap",
  "na",
]);

const TONE_TEXT = {
  ok: "text-st-approved",
  err: "text-st-failed",
  warn: "text-st-updated",
  info: "text-st-progress",
  neutral: "text-ink-muted",
} as const;

/**
 * The fixed header of the Overview: the scenario total and one tile per status (`Pass`, `Fail`, `Gap`, `N/A` always;
 * `Planned`, `Uncertain`, `Blocked` when present). Counts the scenarios' own status, not the reviewer's verdicts.
 */
export function RunStatsHeader({
  scenarios,
  className,
}: {
  scenarios: readonly { status: ScenarioStatus }[];
  className?: string;
}) {
  const counts = scenarioCounts(scenarios);
  const statuses = SCENARIO_STATUSES.filter(
    (status) => ALWAYS.has(status) || counts[status] > 0,
  );
  return (
    <Panel
      data-slot="run-stats"
      aria-label="Run results"
      role="group"
      className={cn("flex-row flex-wrap items-stretch", className)}
    >
      <div className="flex flex-col gap-0.5 border-r-fine border-line px-5 py-3">
        <span className="text-xs font-bold text-ink-muted">Scenarios</span>
        <span
          data-stat="total"
          className="text-[26px] leading-none font-bold tabular-nums"
        >
          {scenarios.length}
        </span>
      </div>
      {statuses.map((status) => (
        <div
          key={status}
          className="flex flex-col gap-0.5 px-5 py-3"
          data-status={status}
        >
          <span className="text-xs font-bold text-ink-muted">
            {SCENARIO_STATUS_LABEL[status]}
          </span>
          <span
            data-stat={status}
            className={cn(
              "text-[26px] leading-none font-bold tabular-nums",
              TONE_TEXT[SCENARIO_STATUS_TONE[status]],
            )}
          >
            {counts[status]}
          </span>
        </div>
      ))}
    </Panel>
  );
}

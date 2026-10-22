import type { Panel } from "@review-dash/shared";
import { Link } from "react-router";
import { Tag } from "@/components/ui/tag";
import { testRunRoute } from "@/lib/paths";
import {
  SCENARIO_STATUS_LABEL,
  SCENARIO_STATUS_TONE,
} from "@/lib/scenario-status";
import { useSessionContext } from "@/lib/session-context";
import { useTestRunDetail } from "@/lib/detail-kind";

/** Scenarios of the run (optionally only some ids or statuses), each a link to its place in the storyboard with its status chip. */
export function ScenarioListPanel({
  panel,
}: {
  panel: Extract<Panel, { type: "scenario-list" }>;
}) {
  const { sessionId } = useSessionContext();
  const { scenarios } = useTestRunDetail();
  const shown = scenarios.filter(
    (scenario) =>
      (panel.ids === undefined || panel.ids.includes(scenario.id)) &&
      (panel.statuses === undefined ||
        panel.statuses.includes(scenario.status)),
  );
  if (shown.length === 0)
    return (
      <p className="m-0 text-[13px] text-ink-muted">No scenarios match.</p>
    );
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {shown.map((scenario) => (
        <li
          key={scenario.id}
          className="flex items-center gap-2.5 text-[13px] font-semibold"
        >
          <Tag
            tone={SCENARIO_STATUS_TONE[scenario.status]}
            size="sm"
            className="w-16 justify-center"
          >
            {SCENARIO_STATUS_LABEL[scenario.status]}
          </Tag>
          <Link
            className="min-w-0 truncate underline-offset-2 hover:underline"
            to={testRunRoute(sessionId, "review", scenario.id)}
          >
            {scenario.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

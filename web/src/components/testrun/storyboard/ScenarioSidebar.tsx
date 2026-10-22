import { effectiveVerdict, fileIsUpdated } from "@review-dash/shared";
import { StatusDot } from "@/components/ui/status-dot";
import { Tag } from "@/components/ui/tag";
import {
  SCENARIO_STATUS_LABEL,
  SCENARIO_STATUS_TONE,
} from "@/lib/scenario-status";
import { VERDICT_STYLE, verdictKind } from "@/lib/verdict";
import { cn } from "@/lib/utils";
import { useReview } from "@/state/review-context";
import type { Scenario } from "./scenario-types";

export interface ScenarioSidebarProps {
  /** In display order. */
  scenarios: readonly Scenario[];
  currentId: string | null;
  onSelect: (id: string) => void;
}

/** The storyboard's index: a row per scenario with its status dot, the effective verdict icon, an "updated" flag and the current one highlighted. */
export function ScenarioSidebar({
  scenarios,
  currentId,
  onSelect,
}: ScenarioSidebarProps) {
  const { fileReview, commentsFor } = useReview();
  return (
    <nav aria-label="Scenarios" className="flex flex-col gap-1">
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {scenarios.map((scenario) => {
          const item = { path: scenario.id, fingerprint: scenario.fingerprint };
          const review = fileReview(scenario.id);
          const open = commentsFor({
            kind: "scenario",
            ref: scenario.id,
          }).filter((comment) => comment.status === "open").length;
          const kind = verdictKind(effectiveVerdict(review, item), open);
          const style = VERDICT_STYLE[kind];
          const Icon = style.icon;
          const current = scenario.id === currentId;
          return (
            <li key={scenario.id}>
              <button
                type="button"
                data-scenario={scenario.id}
                data-verdict={kind}
                aria-current={current ? "true" : undefined}
                onClick={() => onSelect(scenario.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border-fine border-transparent px-2.5 py-2 text-left text-[13px] font-semibold hover:bg-hover",
                  current && "border-ink bg-surface",
                )}
              >
                <StatusDot
                  tone={SCENARIO_STATUS_TONE[scenario.status]}
                  label={SCENARIO_STATUS_LABEL[scenario.status]}
                />
                <span className="min-w-0 flex-1 truncate">
                  {scenario.title}
                </span>
                {fileIsUpdated(review, item) && (
                  <Tag tone="warn" size="sm">
                    updated
                  </Tag>
                )}
                <Icon
                  aria-label={style.label}
                  role="img"
                  className={cn("size-4 shrink-0", style.iconClassName)}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

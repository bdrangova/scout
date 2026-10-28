import { effectiveVerdict, type Verdict } from "@scout/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { useReview } from "@/state/review-context";
import { useScenarioVerdict } from './useScenarioVerdict'
import { ScenarioTile } from "./ScenarioTile";
import type { Scenario } from "./scenario-types";

export interface ScenarioGridProps {
  sessionId: string;
  /** In display order. */
  scenarios: readonly Scenario[];
  currentId: string;
  /** Open the scenario in a card mode. */
  onOpen: (id: string) => void;
  onApprove: (scenario: Scenario) => void;
}

/** A scenario with no verdict but an open comment counts as reviewed, so it gets its own bucket. */
type Category = Verdict | "commented";
type GridFilter = "all" | Category;

const FILTERS: readonly { id: GridFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "none", label: "Unreviewed" },
  { id: "commented", label: "Commented" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function escapeAttribute(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/"/g, '\\"');
}

/** Every scenario as a compact tile in a responsive grid, under a verdict filter with counts (the file grid's counterpart). */
export function ScenarioGrid({ sessionId, scenarios, currentId, onOpen, onApprove }: ScenarioGridProps) {
  const { fileReview, comments } = useReview();
  const verdicts = useScenarioVerdict();
  const [filter, setFilter] = useState<GridFilter>("all");
  const gridRef = useRef<HTMLUListElement>(null);

  const openById = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of comments) {
      if (comment.target.kind !== "scenario" || comment.status !== "open" || comment.target.ref === null) continue;
      counts.set(comment.target.ref, (counts.get(comment.target.ref) ?? 0) + 1);
    }
    return counts;
  }, [comments]);

  const categoryOf = (scenario: Scenario): Category => {
    const verdict = effectiveVerdict(fileReview(scenario.id), { path: scenario.id, fingerprint: scenario.fingerprint });
    return verdict === "none" && (openById.get(scenario.id) ?? 0) > 0 ? "commented" : verdict;
  };
  const counts: Record<Category, number> = { none: 0, commented: 0, approved: 0, rejected: 0 };
  for (const scenario of scenarios) counts[categoryOf(scenario)] += 1;
  const shown = filter === "all" ? scenarios : scenarios.filter((scenario) => categoryOf(scenario) === filter);

  useEffect(() => {
    gridRef.current?.querySelector<HTMLElement>(`[data-scenario="${escapeAttribute(currentId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-5 md:px-6">
      <Segmented aria-label="Show scenarios" className="max-w-full self-start overflow-x-auto overflow-y-hidden">
        {FILTERS.map((option) => (
          <SegmentedItem
            key={option.id}
            pressed={option.id === filter}
            count={option.id === "all" ? scenarios.length : counts[option.id]}
            onClick={() => setFilter(option.id)}
            className="h-7 px-3"
          >
            {option.label}
          </SegmentedItem>
        ))}
      </Segmented>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-ink-muted">
          <p>{filter === "all" ? "No scenarios." : "No scenarios match this filter."}</p>
          {filter !== "all" && (
            <Button size="sm" onClick={() => setFilter("all")}>
              Clear filter
            </Button>
          )}
        </div>
      ) : (
        <ul ref={gridRef} aria-label="All scenarios" className="m-0 grid list-none gap-3.5 p-0" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
          {shown.map((scenario) => (
            <ScenarioTile
              key={scenario.id}
              sessionId={sessionId}
              scenario={scenario}
              current={scenario.id === currentId}
              openComments={openById.get(scenario.id) ?? 0}
              onOpen={() => onOpen(scenario.id)}
              onApprove={() => onApprove(scenario)}
              onClearVerdict={() => {
                const verdict = effectiveVerdict(fileReview(scenario.id), { path: scenario.id, fingerprint: scenario.fingerprint });
                if (verdict === 'approved') verdicts.approve(scenario);
                if (verdict === 'rejected') verdicts.reject(scenario);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

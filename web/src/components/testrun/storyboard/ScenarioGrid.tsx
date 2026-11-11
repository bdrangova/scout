import { effectiveVerdict } from "@scout/shared";
import { useEffect, useRef } from "react";
import { useReview } from "@/state/review-context";
import { useScenarioVerdict } from "./useScenarioVerdict";
import { ScenarioTile } from "./ScenarioTile";
import type { Scenario } from "./scenario-types";

export interface ScenarioGridProps {
  sessionId: string;
  /** In display order, already through the page's filter. */
  scenarios: readonly Scenario[];
  currentId: string;
  /** Open comments of a scenario, its evidence included. */
  openComments: (scenario: Scenario) => number;
  /** Open the scenario in a card mode. */
  onOpen: (id: string) => void;
  onApprove: (scenario: Scenario) => void;
}

function escapeAttribute(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/"/g, '\\"');
}

/** Every scenario as a compact tile in a responsive grid (the file grid's counterpart); the filter sits above, on the page. */
export function ScenarioGrid({ sessionId, scenarios, currentId, openComments, onOpen, onApprove }: ScenarioGridProps) {
  const { fileReview } = useReview();
  const verdicts = useScenarioVerdict();
  const gridRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    gridRef.current?.querySelector<HTMLElement>(`[data-scenario="${escapeAttribute(currentId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  return (
    <ul ref={gridRef} aria-label="All scenarios" className="m-0 grid list-none gap-3.5 p-0" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
      {scenarios.map((scenario) => (
        <ScenarioTile
          key={scenario.id}
          sessionId={sessionId}
          scenario={scenario}
          current={scenario.id === currentId}
          openComments={openComments(scenario)}
          onOpen={() => onOpen(scenario.id)}
          onApprove={() => onApprove(scenario)}
          onClearVerdict={() => {
            const verdict = effectiveVerdict(fileReview(scenario.id), { path: scenario.id, fingerprint: scenario.fingerprint });
            if (verdict === "approved") verdicts.approve(scenario);
            if (verdict === "rejected") verdicts.reject(scenario);
          }}
        />
      ))}
    </ul>
  );
}

import { RunRailSection } from "../RunRailSection";
import type { Scenario } from "./scenario-types";
import { ScenarioSidebar } from "./ScenarioSidebar";

export interface ScenarioRailSectionProps {
  /** In display order. */
  scenarios: readonly Scenario[];
  currentId: string | null;
  onSelect: (id: string) => void;
}

/** The Review page's block in the session rail: the scenario list (the Swipe | Grid toggle is in the session bar). */
export function ScenarioRailSection({
  scenarios,
  currentId,
  onSelect,
}: ScenarioRailSectionProps) {
  return (
    <RunRailSection heading="Scenarios" count={scenarios.length} modeToggle={false}>
      <ScenarioSidebar
        scenarios={scenarios}
        currentId={currentId}
        onSelect={onSelect}
      />
    </RunRailSection>
  );
}

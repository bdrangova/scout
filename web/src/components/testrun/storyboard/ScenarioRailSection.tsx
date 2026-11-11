import { useCommentedOnlyFilter } from "@/components/layout/commented-only";
import { CommentedOnlyToggle } from "@/components/layout/CommentedOnlyToggle";
import { RunRailSection } from "../RunRailSection";
import type { Scenario } from "./scenario-types";
import { ScenarioSidebar } from "./ScenarioSidebar";

export interface ScenarioRailSectionProps {
  /** In display order, already through the page's filter. */
  scenarios: readonly Scenario[];
  /** Every scenario of the run, for the heading's count. */
  total: number;
  currentId: string | null;
  /** Open comments of a scenario, its evidence included. */
  openComments: (scenario: Scenario) => number;
  onSelect: (id: string) => void;
}

/** The Review page's block in the session rail: the scenario list under the page's filter (the Swipe | Grid toggle is in the session bar). */
export function ScenarioRailSection({
  scenarios,
  total,
  currentId,
  openComments,
  onSelect,
}: ScenarioRailSectionProps) {
  const commented = useCommentedOnlyFilter(scenarios, (scenario) => openComments(scenario) > 0);
  const shown = commented.active ? commented.items.length : scenarios.length;
  return (
    <RunRailSection
      heading="Scenarios"
      count={total}
      shown={shown === total ? undefined : shown}
      action={
        <CommentedOnlyToggle
          size="sm"
          count={commented.count}
          active={commented.active}
          onToggle={commented.toggle}
        />
      }
    >
      <ScenarioSidebar
        scenarios={commented.items}
        currentId={currentId}
        openComments={openComments}
        onSelect={onSelect}
      />
    </RunRailSection>
  );
}

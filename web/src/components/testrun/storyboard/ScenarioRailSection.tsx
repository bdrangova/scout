import { useCommentedOnlyFilter, useOpenCommentRefs } from "@/components/layout/commented-only";
import { CommentedOnlyToggle } from "@/components/layout/CommentedOnlyToggle";
import { evidenceRefsOf } from "@/components/submit/open-comments-sections";
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
  const openRefs = useOpenCommentRefs("scenario", "run-file");
  const commented = useCommentedOnlyFilter(
    scenarios,
    (scenario) =>
      openRefs.has(scenario.id) ||
      evidenceRefsOf(scenario).some((ref) => openRefs.has(ref)),
  );
  return (
    <RunRailSection
      heading="Scenarios"
      count={scenarios.length}
      shown={commented.active ? commented.items.length : undefined}
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
        onSelect={onSelect}
      />
    </RunRailSection>
  );
}

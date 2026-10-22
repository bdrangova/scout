import { GapsAndBugsLists, type GapBugSelection } from "./GapsAndBugsLists";
import { RunRailSection } from "./RunRailSection";
import type { Bug, Gap } from "@review-dash/shared";

export interface GapsRailSectionProps {
  gaps: readonly Gap[];
  bugs: readonly Bug[];
  selected: GapBugSelection | null;
  onSelect: (selection: GapBugSelection) => void;
}

/** The Gaps & bugs page's block in the session rail: the Swipe | Grid toggle, the known gaps and the bugs. */
export function GapsRailSection(props: GapsRailSectionProps) {
  return (
    <RunRailSection
      heading="Gaps & bugs"
      count={props.gaps.length + props.bugs.length}
    >
      <GapsAndBugsLists {...props} />
    </RunRailSection>
  );
}
